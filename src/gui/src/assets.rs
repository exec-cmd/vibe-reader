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
    let rel = match path.trim_start_matches('/') {
        "" => "index.html",
        rel => rel,
    };
    if rel.split('/').any(|part| part == ".." || part.is_empty()) {
        return status(StatusCode::BAD_REQUEST);
    }
    if let Ok(bytes) = fs::read(overrides.join(rel)) {
        return reply(bytes, mime(rel));
    }
    match app.asset_resolver().get(rel.to_owned()) {
        Some(asset) => reply(asset.bytes, &asset.mime_type),
        None => status(StatusCode::NOT_FOUND),
    }
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

/// Emits `ui-changed` with the changed relative paths when override files change.
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
        }
    });
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
