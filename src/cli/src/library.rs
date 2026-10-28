//! Books, shelves, art and status.

use std::collections::BTreeMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{Context, Result, bail};
use serde_json::json;
use vibe_reader_core::store::{Placement, now};
use vibe_reader_core::{Book, Locator, Status};

use crate::output::{Out, percent};
use crate::{ArtCmd, Ctx, Group, ShelfCmd, confirm};

const MAX_BOOK: u64 = 200 * 1024 * 1024;
const MAX_ART: u64 = 10 * 1024 * 1024;

pub fn line(book: &Book) -> String {
    let authors = if book.authors.is_empty() {
        String::new()
    } else {
        format!(" — {}", book.authors.join(", "))
    };
    format!(
        "{:>4}  {}{}  [{}, {}, {}]",
        book.id,
        book.title,
        authors,
        book.format,
        book.status.as_str(),
        percent(book.progress)
    )
}

pub fn add(ctx: &Ctx, source: &str, copy: bool, shelf: Option<&str>) -> Result<Out> {
    let (book, new) = if source.starts_with("http://") || source.starts_with("https://") {
        let dir = tempfile_dir()?;
        let file = download(source, &dir, MAX_BOOK)?;
        let added = ctx.lib.add(&file, true);
        let _ = fs::remove_dir_all(&dir);
        added?
    } else {
        ctx.lib.add(Path::new(source), copy)?
    };
    if let Some(shelf) = shelf {
        ctx.lib.shelve(shelf, book.id)?;
    }
    let book = ctx.lib.book(book.id)?;
    let verb = if new { "Added" } else { "Already in the library" };
    Ok(Out::new(
        json!({ "added": new, "book": book }),
        format!("{verb}:\n{}", line(&book)),
    ))
}

pub fn remove(ctx: &Ctx, query: &str) -> Result<Out> {
    let book = ctx.lib.find(query)?;
    confirm(&format!(
        "Remove \"{}\" with its notes and reading history?",
        book.title
    ))?;
    let book = ctx.lib.remove(book.id)?;
    Ok(Out::new(
        json!({ "removed": book.id }),
        format!("Removed \"{}\".", book.title),
    ))
}

pub fn list(ctx: &Ctx, shelf: Option<&str>, group: Option<Group>) -> Result<Out> {
    let books = match shelf {
        Some(shelf) => ctx.lib.shelf_books(shelf)?,
        None => ctx.lib.books()?,
    };
    let Some(group) = group else {
        let text = if books.is_empty() {
            "The library is empty. Add a book with `vibe-reader add FILE`.".to_owned()
        } else {
            books.iter().map(line).collect::<Vec<_>>().join("\n")
        };
        return Ok(Out::new(json!({ "books": books }), text));
    };
    let mut groups: BTreeMap<String, Vec<&Book>> = BTreeMap::new();
    for book in &books {
        let keys = match group {
            Group::Shelf => book.shelves.clone(),
            Group::Author => book.authors.clone(),
        };
        let keys = if keys.is_empty() { vec![String::new()] } else { keys };
        for key in keys {
            groups.entry(key).or_default().push(book);
        }
    }
    let mut text = String::new();
    for (name, books) in &groups {
        let name = if name.is_empty() { "—" } else { name };
        text.push_str(&format!("## {name}\n"));
        for book in books {
            text.push_str(&line(book));
            text.push('\n');
        }
        text.push('\n');
    }
    let json_groups: Vec<_> = groups
        .iter()
        .map(|(name, books)| json!({ "name": name, "books": books }))
        .collect();
    Ok(Out::new(json!({ "groups": json_groups }), text))
}

pub fn show(ctx: &Ctx, query: &str) -> Result<Out> {
    let book = ctx.lib.find(query)?;
    let mut text = format!("# {}\n\n", book.title);
    if !book.authors.is_empty() {
        text.push_str(&format!("Authors: {}\n", book.authors.join(", ")));
    }
    text.push_str(&format!(
        "Id: {}\nFile: {}\nFormat: {} ({})\nStatus: {}\nProgress: {}{}\nChapters: {}, words: {}\nShelves: {}\n",
        book.id,
        book.path.display(),
        book.format,
        book.kind.as_str(),
        book.status.as_str(),
        percent(book.progress),
        book.position.map(|p| format!(" at {p}")).unwrap_or_default(),
        book.chapters(),
        book.words,
        if book.shelves.is_empty() {
            "—".to_owned()
        } else {
            book.shelves.join(", ")
        },
    ));
    Ok(Out::new(json!({ "book": book }), text))
}

/// Starts the GUI next to this binary or from PATH, without waiting for it.
pub fn open(file: Option<&Path>, lite: bool) -> Result<Out> {
    let gui = gui_binary().context("vibe-reader-gui is not installed next to vibe-reader or in PATH")?;
    let mut command = Command::new(&gui);
    if lite {
        command.arg("--lite");
    }
    if let Some(file) = file {
        command.arg(fs::canonicalize(file).with_context(|| format!("no such file: {}", file.display()))?);
    }
    command
        .spawn()
        .with_context(|| format!("cannot start {}", gui.display()))?;
    Ok(Out::new(json!({ "opened": true }), "Opened the reader window."))
}

pub fn gui_binary() -> Option<PathBuf> {
    let name = format!("vibe-reader-gui{}", std::env::consts::EXE_SUFFIX);
    let beside = std::env::current_exe().ok()?.parent()?.join(&name);
    if beside.is_file() {
        return Some(beside);
    }
    std::env::split_paths(&std::env::var_os("PATH")?)
        .map(|dir| dir.join(&name))
        .find(|p| p.is_file())
}

pub fn shelf(ctx: &Ctx, cmd: ShelfCmd) -> Result<Out> {
    let lib = &ctx.lib;
    let done = |text: String| Ok(Out::new(json!({ "ok": true, "message": text }), text));
    match cmd {
        ShelfCmd::Create { name } => {
            lib.create_shelf(&name)?;
            done(format!("Created shelf \"{name}\"."))
        }
        ShelfCmd::Rename { from, to } => {
            lib.rename_shelf(&from, &to)?;
            done(format!("Renamed \"{from}\" to \"{to}\"."))
        }
        ShelfCmd::Delete { name } => {
            confirm(&format!("Delete shelf \"{name}\"? Its books stay in the library."))?;
            lib.delete_shelf(&name)?;
            done(format!("Deleted shelf \"{name}\"."))
        }
        ShelfCmd::List => {
            let shelves = lib.shelves()?;
            let text = if shelves.is_empty() {
                "No shelves yet.".to_owned()
            } else {
                shelves
                    .iter()
                    .map(|s| format!("{} ({})", s.name, s.books))
                    .collect::<Vec<_>>()
                    .join("\n")
            };
            Ok(Out::new(json!({ "shelves": shelves }), text))
        }
        ShelfCmd::Add { shelf, book } => {
            let book = lib.find(&book)?;
            lib.shelve(&shelf, book.id)?;
            done(format!("Put \"{}\" on \"{shelf}\".", book.title))
        }
        ShelfCmd::Remove { shelf, book } => {
            let book = lib.find(&book)?;
            lib.unshelve(&shelf, book.id)?;
            done(format!("Took \"{}\" off \"{shelf}\".", book.title))
        }
    }
}

pub fn status(ctx: &Ctx, query: &str, status: &str) -> Result<Out> {
    let book = ctx.lib.find(query)?;
    ctx.lib.set_status(book.id, Status::parse(status)?)?;
    Ok(Out::new(
        json!({ "book": book.id, "status": status }),
        format!("\"{}\" is now {status}.", book.title),
    ))
}

pub fn art(ctx: &Ctx, cmd: ArtCmd) -> Result<Out> {
    match cmd {
        ArtCmd::Add {
            book,
            image,
            locator,
            placement,
        } => {
            let book = ctx.lib.find(&book)?;
            let placement = match placement {
                crate::Placement::Page => Placement::Page,
                crate::Placement::Chapter => Placement::Chapter,
                crate::Placement::Margin => Placement::Margin,
                crate::Placement::Cover => Placement::Cover,
            };
            let at: Locator = match (locator, placement) {
                (Some(l), _) => l.parse()?,
                (None, Placement::Cover) => Locator::default(),
                (None, _) => bail!("--locator is required unless the image is a cover"),
            };
            if at.chapter >= book.chapters() {
                bail!("the book has {} chapters", book.chapters());
            }
            let (bytes, ext) = load_image(&image)?;
            let dir = ctx.lib.paths().art();
            fs::create_dir_all(&dir)?;
            let name = format!("{}-{}-{}.{ext}", book.id, now(), std::process::id());
            fs::write(dir.join(&name), &bytes)?;
            let mime = image_mime(ext);
            let id = ctx.lib.add_art(book.id, at, placement, &name, mime, &ctx.author)?;
            Ok(Out::new(
                json!({ "id": id, "book": book.id, "locator": at, "placement": placement, "file": name }),
                format!(
                    "Attached art {id} to \"{}\" at {at} as {}.",
                    book.title,
                    placement.as_str()
                ),
            ))
        }
        ArtCmd::List { book } => {
            let book = ctx.lib.find(&book)?;
            let arts = ctx.lib.arts(book.id)?;
            let text = if arts.is_empty() {
                "No art.".to_owned()
            } else {
                arts.iter()
                    .map(|a| {
                        format!(
                            "{:>4}  {}  {}  {}  by {}",
                            a.id,
                            a.locator,
                            a.placement.as_str(),
                            a.file,
                            a.author
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            };
            Ok(Out::new(json!({ "art": arts }), text))
        }
        ArtCmd::Remove { id } => {
            ctx.lib.remove_art(id, &ctx.author)?;
            Ok(Out::new(json!({ "removed": id }), format!("Detached art {id}.")))
        }
    }
}

fn image_mime(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "jpg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/svg+xml",
    }
}

/// Reads an image from a path or URL and checks its type by content.
fn load_image(source: &str) -> Result<(Vec<u8>, &'static str)> {
    let bytes = if source.starts_with("http://") || source.starts_with("https://") {
        fetch(source, MAX_ART)?
    } else {
        let size = fs::metadata(source)
            .with_context(|| format!("no such file: {source}"))?
            .len();
        if size > MAX_ART {
            bail!("images are limited to 10 MB");
        }
        fs::read(source)?
    };
    let ext = image_type(&bytes)?;
    Ok((bytes, ext))
}

/// Raster formats by magic bytes; SVG only without scripts, event handlers or external references.
pub fn image_type(bytes: &[u8]) -> Result<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Ok("png");
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Ok("jpg");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Ok("gif");
    }
    if bytes.len() > 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Ok("webp");
    }
    let text = std::str::from_utf8(bytes).context("unsupported image type; use PNG, JPEG, WebP, GIF or SVG")?;
    let lower = text.to_lowercase();
    if !lower.contains("<svg") {
        bail!("unsupported image type; use PNG, JPEG, WebP, GIF or SVG");
    }
    let unsafe_svg = [
        "<script",
        "javascript:",
        "<foreignobject",
        "href=\"http",
        "href='http",
        "href=\"//",
        "@import",
        "url(http",
    ];
    if unsafe_svg.iter().any(|s| lower.contains(s)) || has_event_handler(&lower) {
        bail!("SVG with scripts, event handlers or external references is not accepted");
    }
    Ok("svg")
}

fn has_event_handler(svg: &str) -> bool {
    svg.match_indices(" on").any(|(i, _)| {
        let rest = &svg[i + 3..];
        let name_len = rest.chars().take_while(|c| c.is_ascii_alphabetic()).count();
        name_len > 0 && rest[name_len..].trim_start().starts_with('=')
    })
}

fn fetch(url: &str, limit: u64) -> Result<Vec<u8>> {
    let response = ureq::get(url)
        .call()
        .with_context(|| format!("cannot download {url}"))?;
    let mut bytes = Vec::new();
    response
        .into_body()
        .into_reader()
        .take(limit + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > limit {
        bail!("download is larger than {} MB", limit / 1024 / 1024);
    }
    Ok(bytes)
}

fn download(url: &str, dir: &Path, limit: u64) -> Result<PathBuf> {
    let bytes = fetch(url, limit)?;
    let name = url
        .split(['?', '#'])
        .next()
        .and_then(|u| u.rsplit('/').next())
        .filter(|n| !n.is_empty())
        .unwrap_or("download");
    let file = dir.join(name.replace(['/', '\\'], "_"));
    fs::write(&file, bytes)?;
    Ok(file)
}

fn tempfile_dir() -> Result<PathBuf> {
    let dir = std::env::temp_dir().join(format!("vibe-reader-{}-{}", std::process::id(), now()));
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checks_images() {
        assert_eq!(image_type(b"\x89PNG\r\n\x1a\nrest").unwrap(), "png");
        assert_eq!(
            image_type(br#"<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>"#).unwrap(),
            "svg"
        );
        assert!(image_type(b"<svg><script>alert(1)</script></svg>").is_err());
        assert!(image_type(br#"<svg><rect onload = "x()"/></svg>"#).is_err());
        assert!(image_type(br#"<svg><image href="https://evil/x.png"/></svg>"#).is_err());
        assert!(image_type(b"plain text").is_err());
    }
}
