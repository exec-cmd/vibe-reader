//! EPUB 2 and 3: container.xml, the OPF package, spine order, and the nav or NCX table of contents.

use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::Path;

use anyhow::{Context, Result};
use quick_xml::Reader;
use quick_xml::events::Event;
use zip::ZipArchive;

use super::xml::{attr, entity, local, percent_decode};
use super::{Chapter, Document, Format, Kind, Meta, TocEntry, decode};
use crate::text::{self, ID_PREFIX, join_path};

struct Item {
    href: String,
    media: String,
    properties: String,
}

#[derive(Default)]
struct Package {
    meta: Meta,
    manifest: HashMap<String, Item>,
    spine: Vec<String>,
    ncx: Option<String>,
}

/// One table-of-contents link before it is mapped to a chapter.
struct Link {
    title: String,
    target: String,
    level: usize,
}

pub fn open(path: &Path) -> Result<Document> {
    let mut zip = ZipArchive::new(File::open(path)?)?;
    let container = read(&mut zip, "META-INF/container.xml")?;
    let opf_path = rootfile(&container).context("container.xml has no rootfile")?;
    let package = parse_opf(&read(&mut zip, &opf_path)?, dir(&opf_path))?;

    let mut chapters = Vec::new();
    for idref in &package.spine {
        let Some(item) = package.manifest.get(idref) else {
            continue;
        };
        if !item.media.contains("html") {
            continue;
        }
        let Ok(raw) = read(&mut zip, &item.href) else { continue };
        let prepared = text::prepare(&raw, dir(&item.href));
        chapters.push(Chapter {
            title: String::new(),
            path: item.href.clone(),
            html: prepared.html,
            text: prepared.text,
        });
    }

    let nav = package
        .manifest
        .values()
        .find(|i| i.properties.split_whitespace().any(|p| p == "nav"));
    let ncx = package.ncx.as_ref().and_then(|id| package.manifest.get(id));
    let links = match (nav, ncx) {
        (Some(nav), _) => read(&mut zip, &nav.href)
            .map(|x| parse_nav(&x, dir(&nav.href)))
            .unwrap_or_default(),
        (None, Some(ncx)) => read(&mut zip, &ncx.href)
            .map(|x| parse_ncx(&x, dir(&ncx.href)))
            .unwrap_or_default(),
        (None, None) => Vec::new(),
    };
    let toc = links
        .into_iter()
        .filter_map(|link| {
            let (file, fragment) = link.target.split_once('#').unwrap_or((&link.target, ""));
            let chapter = chapters.iter().position(|c| c.path == file)?;
            let anchor = (!fragment.is_empty()).then(|| format!("{ID_PREFIX}{fragment}"));
            Some(TocEntry {
                title: link.title,
                chapter,
                level: link.level,
                anchor,
                offset: 0,
            })
        })
        .collect();

    Ok(Document {
        format: Format::Epub,
        kind: Kind::Prose,
        meta: package.meta,
        chapters,
        toc,
    })
}

pub fn resource(path: &Path, name: &str) -> Result<Option<Vec<u8>>> {
    let mut zip = ZipArchive::new(File::open(path)?)?;
    let Ok(mut file) = zip.by_name(name) else {
        return Ok(None);
    };
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;
    Ok(Some(bytes))
}

fn read(zip: &mut ZipArchive<File>, name: &str) -> Result<String> {
    let mut file = zip.by_name(name).with_context(|| format!("missing {name}"))?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;
    Ok(decode(&bytes))
}

fn dir(path: &str) -> &str {
    path.rsplit_once('/').map_or("", |(dir, _)| dir)
}

fn rootfile(container: &str) -> Option<String> {
    let mut reader = Reader::from_str(container);
    loop {
        match reader.read_event().ok()? {
            Event::Start(e) | Event::Empty(e) if local(&e) == "rootfile" => return attr(&e, "full-path"),
            Event::Eof => return None,
            _ => {}
        }
    }
}

fn parse_opf(opf: &str, base: &str) -> Result<Package> {
    let mut package = Package::default();
    let mut reader = Reader::from_str(opf);
    let mut field: Option<String> = None;
    let mut value = String::new();
    loop {
        match reader.read_event()? {
            Event::Start(e) | Event::Empty(e) => match local(&e).as_str() {
                "item" => {
                    let (Some(id), Some(href)) = (attr(&e, "id"), attr(&e, "href")) else {
                        continue;
                    };
                    let item = Item {
                        href: join_path(base, &percent_decode(&href)),
                        media: attr(&e, "media-type").unwrap_or_default(),
                        properties: attr(&e, "properties").unwrap_or_default(),
                    };
                    package.manifest.insert(id, item);
                }
                "itemref" => package.spine.extend(attr(&e, "idref")),
                "spine" => package.ncx = attr(&e, "toc"),
                name @ ("title" | "creator" | "language") => {
                    field = Some(name.to_owned());
                    value.clear();
                }
                _ => {}
            },
            Event::Text(t) if field.is_some() => value.push_str(&t.xml10_content()),
            Event::GeneralRef(r) if field.is_some() => value.extend(entity(&r)),
            Event::End(e) if field.as_deref() == Some(e.local_name().as_ref()) => {
                let text = value.trim().to_owned();
                match field.take().as_deref() {
                    Some("title") if package.meta.title.is_empty() => package.meta.title = text,
                    Some("creator") if !text.is_empty() => package.meta.authors.push(text),
                    Some("language") if package.meta.language.is_none() => package.meta.language = Some(text),
                    _ => {}
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    // Media types are case-insensitive and sometimes written in caps.
    for item in package.manifest.values_mut() {
        item.media.make_ascii_lowercase();
    }
    if package.ncx.is_none() {
        package.ncx = package
            .manifest
            .iter()
            .find(|(_, i)| i.media.contains("dtbncx"))
            .map(|(id, _)| id.clone());
    }
    Ok(package)
}

/// EPUB 3 navigation document: links inside `<nav epub:type="toc">`, nested by `<ol>`.
fn parse_nav(xhtml: &str, base: &str) -> Vec<Link> {
    let mut reader = Reader::from_str(xhtml);
    reader.config_mut().check_end_names = false;
    let mut links = Vec::new();
    let (mut in_toc, mut nav_depth, mut ol_depth) = (false, 0usize, 0usize);
    let mut current: Option<Link> = None;
    while let Ok(event) = reader.read_event() {
        match event {
            Event::Start(e) => match local(&e).as_str() {
                "nav" => {
                    nav_depth += 1;
                    if !in_toc && attr(&e, "type").is_some_and(|t| t.split_whitespace().any(|t| t == "toc")) {
                        in_toc = true;
                        nav_depth = 1;
                    }
                }
                "ol" if in_toc => ol_depth += 1,
                "a" if in_toc => {
                    let target = attr(&e, "href")
                        .map(|h| join_path(base, &percent_decode(&h)))
                        .unwrap_or_default();
                    current = Some(Link {
                        title: String::new(),
                        target,
                        level: ol_depth.saturating_sub(1),
                    });
                }
                _ => {}
            },
            Event::Text(t) => {
                if let Some(link) = current.as_mut() {
                    link.title.push_str(&t.xml10_content());
                }
            }
            Event::GeneralRef(r) => {
                if let Some(link) = current.as_mut() {
                    link.title.extend(entity(&r));
                }
            }
            Event::End(e) => match e.local_name().as_ref() {
                "a" => {
                    if let Some(mut link) = current.take() {
                        link.title = squash(&link.title);
                        links.push(link);
                    }
                }
                "ol" if in_toc => ol_depth = ol_depth.saturating_sub(1),
                "nav" if in_toc => {
                    nav_depth -= 1;
                    if nav_depth == 0 {
                        break;
                    }
                }
                _ => {}
            },
            Event::Eof => break,
            _ => {}
        }
    }
    links
}

/// EPUB 2 NCX: `navPoint` elements with a `navLabel/text` and a `content src`.
fn parse_ncx(ncx: &str, base: &str) -> Vec<Link> {
    let mut reader = Reader::from_str(ncx);
    let mut links: Vec<Link> = Vec::new();
    let mut open: Vec<usize> = Vec::new();
    let mut in_text = false;
    while let Ok(event) = reader.read_event() {
        match event {
            Event::Start(e) | Event::Empty(e) => match local(&e).as_str() {
                "navPoint" => {
                    open.push(links.len());
                    links.push(Link {
                        title: String::new(),
                        target: String::new(),
                        level: open.len() - 1,
                    });
                }
                "text" => in_text = !open.is_empty(),
                "content" => {
                    if let (Some(&i), Some(src)) = (open.last(), attr(&e, "src")) {
                        links[i].target = join_path(base, &percent_decode(&src));
                    }
                }
                _ => {}
            },
            Event::Text(t) if in_text => {
                if let Some(&i) = open.last() {
                    links[i].title.push_str(&t.xml10_content());
                }
            }
            Event::GeneralRef(r) if in_text => {
                if let Some(&i) = open.last() {
                    links[i].title.extend(entity(&r));
                }
            }
            Event::End(e) => match e.local_name().as_ref() {
                "text" => in_text = false,
                "navPoint" => {
                    open.pop();
                }
                _ => {}
            },
            Event::Eof => break,
            _ => {}
        }
    }
    for link in &mut links {
        link.title = squash(&link.title);
    }
    links
}

fn squash(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
pub(crate) mod tests {
    use std::io::Write;

    use zip::write::SimpleFileOptions;

    /// Writes a minimal EPUB 3 with two chapters, an image and a nav document.
    pub fn sample(path: &std::path::Path) {
        let mut zip = zip::ZipWriter::new(std::fs::File::create(path).unwrap());
        let files: &[(&str, &str)] = &[
            ("mimetype", "application/epub+zip"),
            (
                "META-INF/container.xml",
                r#"<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>"#,
            ),
            (
                "OEBPS/content.opf",
                r#"<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Преступление &amp; наказание</dc:title><dc:creator>Ф. Достоевский</dc:creator><dc:language>ru</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="text/ch%201.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/><item id="img" href="img/a.png" media-type="image/png"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>"#,
            ),
            (
                "OEBPS/nav.xhtml",
                r#"<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="text/ch%201.xhtml">Часть первая</a><ol><li><a href="text/ch2.xhtml#s1">Глава I</a></li></ol></li></ol></nav></body></html>"#,
            ),
            (
                "OEBPS/text/ch 1.xhtml",
                r#"<html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title><style>p{}</style></head><body><h1>Часть первая</h1><p>В начале июля, в чрезвычайно жаркое время.</p><img src="../img/a.png" alt=""/></body></html>"#,
            ),
            (
                "OEBPS/text/ch2.xhtml",
                r#"<html xmlns="http://www.w3.org/1999/xhtml"><body><h2 id="s1">Глава I</h2><p>Он благополучно избегнул встречи.</p></body></html>"#,
            ),
            ("OEBPS/img/a.png", "PNG"),
        ];
        for (name, body) in files {
            zip.start_file(*name, SimpleFileOptions::default()).unwrap();
            zip.write_all(body.as_bytes()).unwrap();
        }
        zip.finish().unwrap();
    }

    #[test]
    fn reads_epub() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("book.epub");
        sample(&file);
        let doc = crate::format::open(&file).unwrap();
        assert_eq!(doc.meta.title, "Преступление & наказание");
        assert_eq!(doc.meta.authors, ["Ф. Достоевский"]);
        assert_eq!(doc.meta.language.as_deref(), Some("ru"));
        assert_eq!(doc.chapters.len(), 2);
        assert_eq!(
            doc.chapters[0].text,
            "Часть первая\nВ начале июля, в чрезвычайно жаркое время."
        );
        assert!(doc.chapters[0].html.contains(r#"src="/res/OEBPS/img/a.png""#));
        assert_eq!(doc.toc.len(), 2);
        assert_eq!(doc.toc[1].chapter, 1);
        assert_eq!(doc.toc[1].level, 1);
        assert_eq!(doc.toc[1].anchor.as_deref(), Some("b-s1"));
        assert_eq!(doc.chapters[1].title, "Глава I");
        assert_eq!(
            crate::format::resource(&file, "OEBPS/img/a.png").unwrap().unwrap(),
            b"PNG"
        );
        assert!(crate::format::resource(&file, "../../etc/passwd").unwrap().is_none());
    }
}
