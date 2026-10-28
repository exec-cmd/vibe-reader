//! The `vr://` scheme: UI files from the config folder override the built-in ones.

use std::borrow::Cow;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use std::{fs, thread};

use tauri::http::{Response, StatusCode, header};
use tauri::{AppHandle, Emitter};

/// Book content is sanitized, but the policy still blocks scripts and requests from other origins.
const CSP: &str = "default-src 'self' vr:; script-src 'self' vr:; style-src 'self' vr: 'unsafe-inline'; \
     img-src 'self' vr: data: blob:; font-src 'self' vr: data:; connect-src 'self' vr: ipc: http://ipc.localhost; \
     object-src 'none'; base-uri 'none'; form-action 'none'";

type Reply = Response<Cow<'static, [u8]>>;

pub fn serve(app: &AppHandle, overrides: &Path, path: &str) -> Reply {
    let Some(rel) = clean(path) else {
        return status(StatusCode::BAD_REQUEST);
    };
    if rel == "book" {
        return open_file(app);
    }
    // Library files by id, for drawing PDF covers; only books in the library are reachable.
    if let Some(id) = rel.strip_prefix("file/").and_then(|id| id.parse::<i64>().ok()) {
        let path = crate::app_state(app).lib.lock().unwrap().book(id).map(|b| b.path);
        return match path.ok().and_then(|p| fs::read(&p).ok().map(|bytes| (bytes, p))) {
            Some((bytes, p)) => reply(bytes, mime(&p.to_string_lossy())),
            None => status(StatusCode::NOT_FOUND),
        };
    }
    if let Some(id) = rel.strip_prefix("cover/").and_then(|id| id.parse::<i64>().ok()) {
        return match crate::state::cover_bytes(&crate::app_state(app), id) {
            Some(bytes) => {
                let mime = vibe_reader_core::image::image_type(&bytes)
                    .map(vibe_reader_core::image::mime)
                    .unwrap_or("image/jpeg");
                reply(bytes, mime)
            }
            None => status(StatusCode::NOT_FOUND),
        };
    }
    if let Some(name) = rel.strip_prefix("res/") {
        return book_resource(app, name);
    }
    if let Some(name) = rel.strip_prefix("art/") {
        let file = crate::app_state(app).paths.art().join(name);
        return match (name.contains('/'), fs::read(&file)) {
            (false, Ok(bytes)) => reply(bytes, mime(name)),
            _ => status(StatusCode::NOT_FOUND),
        };
    }
    let rel = rel.as_str();
    if let Ok(bytes) = fs::read(overrides.join(rel)) {
        return reply(bytes, mime(rel));
    }
    match app.asset_resolver().get(rel.to_owned()) {
        Some(asset) => reply(asset.bytes, &asset.mime_type),
        None => status(StatusCode::NOT_FOUND),
    }
}

/// Request path to a relative file path, or `None` when it tries to leave the served folders.
/// Checked after decoding, so `%2e%2e` cannot climb out either.
fn clean(path: &str) -> Option<String> {
    let rel = percent_decode(path.trim_start_matches('/'));
    if rel.is_empty() {
        return Some("index.html".into());
    }
    let bad = rel
        .split('/')
        .any(|part| part == ".." || part == "." || part.is_empty())
        || rel.contains('\\');
    (!bad).then_some(rel)
}

/// The open book file itself, for pdf.js.
fn open_file(app: &AppHandle) -> Reply {
    let state = crate::app_state(app);
    let Some(path) = state.open.lock().unwrap().as_ref().map(|o| o.path.clone()) else {
        return status(StatusCode::NOT_FOUND);
    };
    match fs::read(&path) {
        Ok(bytes) => reply(bytes, mime(&path.to_string_lossy())),
        Err(_) => status(StatusCode::NOT_FOUND),
    }
}

/// A file from inside the open book: an image or a stylesheet referenced by a chapter.
fn book_resource(app: &AppHandle, name: &str) -> Reply {
    let state = crate::app_state(app);
    let Some(path) = state.open.lock().unwrap().as_ref().map(|o| o.path.clone()) else {
        return status(StatusCode::NOT_FOUND);
    };
    match vibe_reader_core::format::resource(&path, name) {
        Ok(Some(bytes)) => reply(bytes, mime(name)),
        _ => status(StatusCode::NOT_FOUND),
    }
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && let Some(b) = s.get(i + 1..i + 3).and_then(|h| u8::from_str_radix(h, 16).ok())
        {
            out.push(b);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn reply(bytes: Vec<u8>, mime: &str) -> Reply {
    Response::builder()
        .header(header::CONTENT_TYPE, mime)
        .header(header::CONTENT_SECURITY_POLICY, CSP)
        .header(header::CACHE_CONTROL, "no-store")
        .body(Cow::Owned(bytes))
        .expect("static headers are valid")
}

fn status(code: StatusCode) -> Reply {
    Response::builder()
        .status(code)
        .body(Cow::Borrowed(&[][..]))
        .expect("static headers are valid")
}

pub fn mime(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or_default() {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json",
        "toml" | "txt" | "md" => "text/plain; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

/// Emits `ui-changed` with the changed relative paths when override files change,
/// and `book-changed` when the open book file is rewritten (Markdown edited in place).
// shortcut: polls mtimes once a second; switch to inotify if polling shows up in profiles.
pub fn watch(app: AppHandle, dir: PathBuf) {
    thread::spawn(move || {
        let mut seen = snapshot(&dir);
        loop {
            thread::sleep(Duration::from_secs(1));
            let now = snapshot(&dir);
            let changed: Vec<String> = now
                .iter()
                .filter(|(path, time)| seen.get(*path) != Some(time))
                .chain(seen.iter().filter(|(path, _)| !now.contains_key(*path)))
                .map(|(path, _)| path.clone())
                .collect();
            if !changed.is_empty() {
                let _ = app.emit("ui-changed", changed);
            }
            seen = now;
            if reload_book(&app) {
                let _ = app.emit("book-changed", ());
            }
        }
    });
}

/// Re-parses the open book when its file changed on disk.
fn reload_book(app: &AppHandle) -> bool {
    let state = crate::app_state(app);
    let mut guard = state.open.lock().unwrap();
    let Some(open) = guard.as_mut() else { return false };
    let stamp = crate::state::stamp(&open.path);
    if stamp.is_none() || stamp == open.stamp {
        return false;
    }
    open.stamp = stamp;
    match vibe_reader_core::format::open(&open.path) {
        Ok(doc) => {
            open.doc = doc;
            true
        }
        Err(_) => false,
    }
}

fn snapshot(dir: &Path) -> HashMap<String, SystemTime> {
    let mut files = HashMap::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(current) = stack.pop() {
        let Ok(entries) = fs::read_dir(&current) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if let (Ok(meta), Ok(rel)) = (entry.metadata(), path.strip_prefix(dir))
                && let Ok(time) = meta.modified()
            {
                files.insert(rel.to_string_lossy().replace('\\', "/"), time);
            }
        }
    }
    files
}

#[cfg(test)]
mod tests {
    use super::clean;

    #[test]
    fn rejects_traversal() {
        assert_eq!(clean("/").as_deref(), Some("index.html"));
        assert_eq!(clean("/res/OEBPS/a%20b.png").as_deref(), Some("res/OEBPS/a b.png"));
        assert_eq!(clean("/../etc/passwd"), None);
        assert_eq!(clean("/%2e%2e/%2e%2e/etc/passwd"), None);
        assert_eq!(clean("/a//b"), None);
    }
}
