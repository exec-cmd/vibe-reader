//! Window state and the commands the UI calls.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use serde::Serialize;
use tauri::State;
use vibe_reader_core::format::TocEntry;
use vibe_reader_core::store::{Annotation, AnnotationKind, Art, Shelf, USER, now};
use vibe_reader_core::{Book, Config, Document, Library, Locator, Paths, Span, Status};

/// Sessions with a longer pause start anew.
const SESSION_GAP: i64 = 5 * 60;

pub struct App {
    pub paths: Paths,
    pub lib: Mutex<Library>,
    pub open: Mutex<Option<Open>>,
    pub lite: bool,
    /// File given on the command line, opened once the UI is ready.
    pub initial: Option<PathBuf>,
    /// What the UI last reported, for the CLI's live commands.
    pub live: Mutex<Live>,
}

#[derive(Default, Clone, Serialize, serde::Deserialize)]
pub struct Live {
    pub position: Option<Locator>,
    pub selection: Option<Selection>,
}

#[derive(Clone, Serialize, serde::Deserialize)]
pub struct Selection {
    pub start: Locator,
    pub end: Locator,
    pub text: String,
}

pub struct Open {
    pub book: Option<Book>,
    pub path: PathBuf,
    pub doc: Document,
    pub stamp: Option<SystemTime>,
    session: Option<Session>,
}

struct Session {
    id: i64,
    start: Locator,
    last: i64,
}

type Res<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    format!("{e:#}")
}

pub fn stamp(path: &Path) -> Option<SystemTime> {
    std::fs::metadata(path).and_then(|m| m.modified()).ok()
}

#[derive(Serialize)]
pub struct Boot {
    config: Config,
    lite: bool,
    initial: Option<PathBuf>,
    version: &'static str,
    paths: serde_json::Value,
}

#[tauri::command]
pub fn boot(app: State<App>) -> Res<Boot> {
    let p = &app.paths;
    Ok(Boot {
        config: Config::load(p).map_err(err)?,
        lite: app.lite,
        initial: app.initial.clone(),
        version: env!("CARGO_PKG_VERSION"),
        paths: serde_json::json!({
            "config": p.config_file(),
            "data": p.data,
            "ui": p.ui_overrides(),
            "presets": p.presets(),
        }),
    })
}

#[derive(Serialize)]
pub struct LibraryView {
    books: Vec<Book>,
    shelves: Vec<Shelf>,
}

#[tauri::command]
pub fn library(app: State<App>) -> Res<LibraryView> {
    let lib = app.lib.lock().unwrap();
    Ok(LibraryView {
        books: lib.books().map_err(err)?,
        shelves: lib.shelves().map_err(err)?,
    })
}

#[derive(Serialize)]
pub struct ChapterInfo {
    title: String,
    chars: usize,
}

#[derive(Serialize)]
pub struct Opened {
    book: Option<Book>,
    title: String,
    authors: Vec<String>,
    language: Option<String>,
    kind: vibe_reader_core::Kind,
    format: vibe_reader_core::Format,
    toc: Vec<TocEntry>,
    chapters: Vec<ChapterInfo>,
    /// Chapter file paths inside the book, to follow links between chapters.
    paths: Vec<String>,
    position: Option<Locator>,
    annotations: Vec<Annotation>,
    art: Vec<Art>,
}

fn opened(lib: &Library, open: &Open) -> Res<Opened> {
    let doc = &open.doc;
    let (position, annotations, art) = match &open.book {
        Some(book) => (
            lib.position(book.id)
                .map_err(err)?
                .map(|p| p.locator.resolve(&doc.texts(), &p.quote)),
            lib.annotations(book.id, None).map_err(err)?,
            lib.arts(book.id).map_err(err)?,
        ),
        None => (None, Vec::new(), Vec::new()),
    };
    Ok(Opened {
        book: open.book.clone(),
        title: doc.meta.title.clone(),
        authors: doc.meta.authors.clone(),
        language: doc.meta.language.clone(),
        kind: doc.kind,
        format: doc.format,
        toc: doc.toc.clone(),
        chapters: doc
            .chapters
            .iter()
            .map(|c| ChapterInfo {
                title: c.title.clone(),
                chars: c.text.chars().count(),
            })
            .collect(),
        paths: doc.chapters.iter().map(|c| c.path.clone()).collect(),
        position,
        annotations,
        art,
    })
}

// Opening and importing parse files, which takes seconds for large PDFs; async commands keep the window responsive.
#[tauri::command]
pub async fn open_book(app: State<'_, App>, id: i64) -> Res<Opened> {
    open_book_sync(&app, id)
}

fn open_book_sync(app: &App, id: i64) -> Res<Opened> {
    let lib = app.lib.lock().unwrap();
    let book = lib.book(id).map_err(err)?;
    let doc = lib.document(&book).map_err(err)?;
    lib.touch(id).map_err(err)?;
    let book = lib.book(id).map_err(err)?;
    let open = Open {
        stamp: stamp(&book.path),
        path: book.path.clone(),
        book: Some(book),
        doc,
        session: None,
    };
    let view = opened(&lib, &open)?;
    *app.open.lock().unwrap() = Some(open);
    Ok(view)
}

/// Opens a file: in the library window it is added first, in lite mode it is only viewed.
#[tauri::command]
pub async fn open_path(app: State<'_, App>, path: PathBuf) -> Res<Opened> {
    if !app.lite {
        let id = app.lib.lock().unwrap().add(&path, false).map_err(err)?.0.id;
        return open_book_sync(&app, id);
    }
    let lib = app.lib.lock().unwrap();
    let path = std::fs::canonicalize(&path).map_err(err)?;
    // A file already in the library keeps its position and notes even in lite mode.
    let book = lib.books().map_err(err)?.into_iter().find(|b| b.path == path);
    let doc = vibe_reader_core::format::open(&path).map_err(err)?;
    let open = Open {
        stamp: stamp(&path),
        path,
        book,
        doc,
        session: None,
    };
    let view = opened(&lib, &open)?;
    *app.open.lock().unwrap() = Some(open);
    Ok(view)
}

#[derive(Serialize)]
pub struct ChapterView {
    index: usize,
    title: String,
    html: String,
}

#[tauri::command]
pub fn chapter(app: State<App>, index: usize) -> Res<ChapterView> {
    let open = app.open.lock().unwrap();
    let doc = &open.as_ref().ok_or("no book is open")?.doc;
    let chapter = doc.chapters.get(index).ok_or("no such chapter")?;
    Ok(ChapterView {
        index,
        title: chapter.title.clone(),
        html: chapter.html.clone(),
    })
}

/// Stores the reader's position and extends the current reading session.
#[tauri::command]
pub fn save_position(app: State<App>, locator: Locator) -> Res<()> {
    let mut guard = app.open.lock().unwrap();
    let Some(open) = guard.as_mut() else { return Ok(()) };
    let Some(book) = &open.book else { return Ok(()) };
    let Some(text) = open.doc.chapters.get(locator.chapter).map(|c| &c.text) else {
        return Err("no such chapter".into());
    };
    let lib = app.lib.lock().unwrap();
    lib.set_position(book.id, locator, &locator.quote(text)).map_err(err)?;

    let t = now();
    let fresh = open.session.as_ref().is_none_or(|s| t - s.last > SESSION_GAP);
    if fresh {
        let id = lib.start_session(book.id, locator).map_err(err)?;
        open.session = Some(Session {
            id,
            start: locator,
            last: t,
        });
        return Ok(());
    }
    let session = open.session.as_mut().expect("checked above");
    session.last = t;
    let start = book.progress_at(session.start);
    let read = ((book.progress_at(locator) - start).max(0.0) * book.chars as f64) as usize;
    let words = (read * book.words).checked_div(book.chars).unwrap_or(0);
    lib.extend_session(session.id, locator, read, words).map_err(err)
}

fn current_book(app: &App) -> Res<Book> {
    app.open
        .lock()
        .unwrap()
        .as_ref()
        .and_then(|o| o.book.clone())
        .ok_or_else(|| "the book is not in the library".into())
}

#[tauri::command]
pub fn annotate(
    app: State<App>,
    kind: AnnotationKind,
    start: Locator,
    end: Locator,
    body: String,
    quote: Option<String>,
) -> Res<Annotation> {
    let book = current_book(&app)?;
    let open = app.open.lock().unwrap();
    let doc = &open.as_ref().ok_or("no book is open")?.doc;
    let chapter = doc.chapters.get(start.chapter).ok_or("no such chapter")?;
    // PDF pages are counted from pdf.js text in the window, so the window sends the quote.
    let quote: String = if let Some(quote) = quote {
        quote.chars().take(2000).collect()
    } else if start.chapter == end.chapter && end > start {
        chapter
            .text
            .chars()
            .skip(start.offset)
            .take(end.offset - start.offset)
            .collect()
    } else {
        start.quote(&chapter.text)
    };
    let lib = app.lib.lock().unwrap();
    let id = lib
        .annotate(book.id, kind, Span { start, end }, &quote, &body, USER)
        .map_err(err)?;
    lib.annotation(id).map_err(err)
}

#[tauri::command]
pub fn edit_annotation(app: State<App>, id: i64, body: String) -> Res<Annotation> {
    let lib = app.lib.lock().unwrap();
    let id = lib.edit_annotation(id, &body, USER).map_err(err)?;
    lib.annotation(id).map_err(err)
}

#[tauri::command]
pub fn delete_annotation(app: State<App>, id: i64) -> Res<()> {
    app.lib.lock().unwrap().delete_annotation(id, USER).map_err(err)
}

#[tauri::command]
pub fn annotations(app: State<App>) -> Res<Vec<Annotation>> {
    let book = current_book(&app)?;
    app.lib.lock().unwrap().annotations(book.id, None).map_err(err)
}

/// Adds the file open in lite mode to the library.
#[tauri::command]
pub async fn import_open(app: State<'_, App>) -> Res<Book> {
    let path = app
        .open
        .lock()
        .unwrap()
        .as_ref()
        .map(|o| o.path.clone())
        .ok_or("no file is open")?;
    let book = app.lib.lock().unwrap().add(&path, false).map_err(err)?.0;
    if let Some(open) = app.open.lock().unwrap().as_mut() {
        open.book = Some(book.clone());
    }
    Ok(book)
}

/// Imports files one by one and reports `import-progress` so the window can show it.
#[tauri::command]
pub async fn add_files(app: State<'_, App>, window: tauri::Window, paths: Vec<PathBuf>) -> Res<Vec<Book>> {
    use tauri::Emitter;
    let copy = Config::load(&app.paths)
        .map(|c| c.library.copy_on_import)
        .unwrap_or(false);
    let files: Vec<PathBuf> = paths
        .into_iter()
        .filter(|p| vibe_reader_core::Format::detect(p).is_some())
        .collect();
    let mut added = Vec::new();
    let mut failed = Vec::new();
    for (i, path) in files.iter().enumerate() {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let _ = window.emit(
            "import-progress",
            serde_json::json!({ "done": i, "total": files.len(), "name": name }),
        );
        // Parse without the library lock so the window keeps answering during long imports.
        let existing = app.lib.lock().unwrap().find_file(path).ok().flatten();
        let result = match existing {
            Some(book) => Ok((book, false)),
            None => {
                vibe_reader_core::format::open(path).and_then(|doc| app.lib.lock().unwrap().add_parsed(path, doc, copy))
            }
        };
        match result {
            Ok((book, _)) => added.push(book),
            Err(e) => failed.push(format!("{name}: {}", err(e))),
        }
    }
    let _ = window.emit(
        "import-progress",
        serde_json::json!({ "done": files.len(), "total": files.len(), "failed": failed }),
    );
    Ok(added)
}

#[tauri::command]
pub fn save_config(app: State<App>, config: Config) -> Res<()> {
    config.save(&app.paths).map_err(err)
}

#[tauri::command]
pub fn set_status(app: State<App>, id: i64, status: String) -> Res<()> {
    let status = Status::parse(&status).map_err(err)?;
    app.lib.lock().unwrap().set_status(id, status).map_err(err)
}

#[tauri::command]
pub fn shelve(app: State<App>, shelf: String, id: i64, on: bool) -> Res<()> {
    let lib = app.lib.lock().unwrap();
    if on {
        lib.shelve(&shelf, id)
    } else {
        lib.unshelve(&shelf, id)
    }
    .map_err(err)
}

/// The UI reports the reader's place and selection for `vibe-reader live` and `context`.
#[tauri::command]
pub fn report_state(app: State<App>, live: Live) {
    *app.live.lock().unwrap() = live;
}

/// The atmosphere in effect at a place in the open book, or none in lite mode.
#[tauri::command]
pub fn atmosphere(app: State<App>, at: Locator, dark: bool) -> Res<Option<vibe_reader_core::atmosphere::Resolved>> {
    use vibe_reader_core::atmosphere::{self, Mode};
    if app.lite {
        return Ok(None);
    }
    let book = current_book(&app)?;
    let lib = app.lib.lock().unwrap();
    let config = Config::load(&app.paths).map_err(err)?;
    let presets = atmosphere::presets(&app.paths).map_err(err)?;
    let layers = atmosphere::layers_at(&lib.atmospheres(book.id).map_err(err)?, at);
    // The window knows the mode in effect (the setting, or the system for "auto").
    let wanted = if dark { Mode::Dark } else { Mode::Light };
    // A broken stored profile must not leave the reader without a look: fall back to the default preset.
    atmosphere::resolve(&presets, &config.reader.preset, &layers, Some(wanted))
        .or_else(|_| atmosphere::resolve(&presets, "study", &[], Some(wanted)))
        .map(Some)
        .map_err(err)
}

/// Fresh annotations and art of the open book, after an agent changed them.
#[tauri::command]
pub fn refresh_open(app: State<App>) -> Res<Option<Opened>> {
    let lib = app.lib.lock().unwrap();
    let guard = app.open.lock().unwrap();
    guard.as_ref().map(|open| opened(&lib, open)).transpose()
}

/// Answers `vibe-reader live` requests from the socket.
pub fn handle_ipc(handle: &tauri::AppHandle, message: serde_json::Value) -> serde_json::Value {
    use serde_json::json;
    use tauri::Emitter;
    let app = crate::app_state(handle);
    let book = app.open.lock().unwrap().as_ref().map(|o| {
        json!({
            "id": o.book.as_ref().map(|b| b.id),
            "title": o.doc.meta.title,
            "path": o.path,
        })
    });
    let live = app.live.lock().unwrap().clone();
    let emit = |event: &str, payload: serde_json::Value| match handle.emit(event, payload) {
        Ok(()) => json!({ "ok": true }),
        Err(e) => json!({ "error": e.to_string() }),
    };
    match message["cmd"].as_str() {
        Some("ping") => json!({ "ok": true }),
        Some("status") => json!({ "ok": true, "lite": app.lite, "book": book, "position": live.position }),
        Some("position") => json!({ "ok": true, "book": book, "position": live.position }),
        Some("selection") => json!({ "ok": true, "book": book, "selection": live.selection }),
        Some("goto") => match message["locator"].as_str().map(str::parse::<Locator>) {
            Some(Ok(at)) => emit("live-goto", json!(at)),
            _ => json!({ "error": "goto needs a locator like ch:3:120" }),
        },
        Some("highlight") => match message["range"].as_str().map(str::parse::<Span>) {
            Some(Ok(span)) => emit("live-highlight", json!(span)),
            _ => json!({ "error": "highlight needs a range like ch:3:0..ch:3:80" }),
        },
        Some("reload") => emit("live-reload", json!(null)),
        Some("open") => match message["path"].as_str() {
            Some(path) => emit("live-open", json!(path)),
            None => json!({ "error": "open needs a path" }),
        },
        _ => json!({ "error": "unknown command" }),
    }
}

// ---------- library management ----------

#[tauri::command]
pub fn update_book(app: State<App>, id: i64, title: String, authors: Vec<String>) -> Res<Book> {
    let lib = app.lib.lock().unwrap();
    let authors: Vec<String> = authors
        .into_iter()
        .map(|a| a.trim().to_owned())
        .filter(|a| !a.is_empty())
        .collect();
    lib.update_meta(id, &title, &authors).map_err(err)?;
    lib.book(id).map_err(err)
}

/// Removes a book from the library. The window confirms first; the file stays unless it was a copy.
#[tauri::command]
pub fn remove_book(app: State<App>, id: i64) -> Res<()> {
    let book = app.lib.lock().unwrap().remove(id).map_err(err)?;
    let _ = std::fs::remove_file(cover_file(&app.paths, book.id));
    Ok(())
}

#[tauri::command]
pub fn reset_position(app: State<App>, id: i64) -> Res<()> {
    app.lib.lock().unwrap().reset_position(id).map_err(err)
}

#[tauri::command]
pub fn create_shelf(app: State<App>, name: String) -> Res<()> {
    app.lib.lock().unwrap().create_shelf(&name).map_err(err)
}

#[tauri::command]
pub fn rename_shelf(app: State<App>, from: String, to: String) -> Res<()> {
    app.lib.lock().unwrap().rename_shelf(&from, &to).map_err(err)
}

#[tauri::command]
pub fn delete_shelf(app: State<App>, name: String) -> Res<()> {
    app.lib.lock().unwrap().delete_shelf(&name).map_err(err)
}

/// A preset as the settings and menus show it: name, colors and what it brings.
#[derive(Serialize)]
pub struct PresetInfo {
    id: String,
    name: String,
    description: String,
    modes: Vec<vibe_reader_core::atmosphere::Mode>,
    spine: Option<String>,
    palettes: std::collections::BTreeMap<vibe_reader_core::atmosphere::Mode, vibe_reader_core::atmosphere::Palette>,
    background: Option<vibe_reader_core::atmosphere::BackgroundKind>,
    particles: Option<vibe_reader_core::atmosphere::ParticleKind>,
    sound: Option<vibe_reader_core::atmosphere::SoundKind>,
    fonts: Option<vibe_reader_core::atmosphere::Typeface>,
}

#[tauri::command]
pub fn presets(app: State<App>) -> Res<Vec<PresetInfo>> {
    use vibe_reader_core::atmosphere::Mode;
    let list = vibe_reader_core::atmosphere::presets(&app.paths).map_err(err)?;
    Ok(list
        .into_iter()
        .map(|p| {
            let profile = p.profile;
            let meta = profile.preset.clone().unwrap_or_default();
            let palettes = profile.palette.unwrap_or_default();
            let spine = palettes
                .get(&Mode::Dark)
                .or(palettes.get(&Mode::Light))
                .and_then(|c| c.spine.clone());
            PresetInfo {
                id: p.id,
                name: meta.name,
                description: meta.description,
                modes: meta.modes,
                spine,
                palettes,
                background: profile.background.and_then(|b| b.kind),
                particles: profile.particles.and_then(|b| b.kind),
                sound: profile.sound.and_then(|s| s.kind),
                fonts: profile.typeface,
            }
        })
        .collect())
}

/// The book-wide atmosphere preset chosen by the reader, or none to use the default.
#[tauri::command]
pub fn book_preset(app: State<App>, id: i64) -> Res<Option<String>> {
    let lib = app.lib.lock().unwrap();
    let book = lib
        .atmospheres(id)
        .map_err(err)?
        .into_iter()
        .find(|a| a.scope == vibe_reader_core::store::Scope::Book);
    Ok(book.and_then(|a| a.profile.get("base").and_then(|b| b.as_str()).map(str::to_owned)))
}

#[tauri::command]
pub fn set_book_preset(app: State<App>, id: i64, preset: Option<String>) -> Res<()> {
    use vibe_reader_core::store::Scope;
    let lib = app.lib.lock().unwrap();
    let current = lib
        .atmospheres(id)
        .map_err(err)?
        .into_iter()
        .find(|a| a.scope == Scope::Book);
    match preset {
        Some(preset) => {
            let presets = vibe_reader_core::atmosphere::presets(&app.paths).map_err(err)?;
            let layer = serde_json::json!({ "base": preset });
            let resolved = vibe_reader_core::atmosphere::resolve(&presets, "study", std::slice::from_ref(&layer), None)
                .map_err(err)?;
            lib.set_atmosphere(id, Scope::Book, None, &layer, USER).map_err(err)?;
            if let Some(spine) = resolved.palette.spine {
                lib.set_color(id, &spine).map_err(err)?;
            }
        }
        None => {
            if let Some(current) = current {
                lib.clear_atmosphere(current.id, USER).map_err(err)?;
            }
        }
    }
    Ok(())
}

pub fn cover_file(paths: &Paths, id: i64) -> PathBuf {
    paths.covers().join(format!("{id}.img"))
}

/// Stores a cover: an image file the reader picked, or a thumbnail the window drew from a PDF.
#[tauri::command]
pub fn set_cover(app: State<App>, id: i64, path: Option<PathBuf>, bytes: Option<Vec<u8>>) -> Res<()> {
    let bytes = match (path, bytes) {
        (Some(path), _) => {
            let size = std::fs::metadata(&path).map_err(err)?.len();
            if size > vibe_reader_core::image::MAX_IMAGE {
                return Err("images are limited to 10 MB".into());
            }
            std::fs::read(path).map_err(err)?
        }
        (None, Some(bytes)) => bytes,
        (None, None) => return Err("no image".into()),
    };
    vibe_reader_core::image::image_type(&bytes).map_err(err)?;
    std::fs::create_dir_all(app.paths.covers()).map_err(err)?;
    std::fs::write(cover_file(&app.paths, id), bytes).map_err(err)
}

/// Bytes of a book cover: cached or chosen first, then the book's own cover image.
pub fn cover_bytes(app: &App, id: i64) -> Option<Vec<u8>> {
    let file = cover_file(&app.paths, id);
    if let Ok(bytes) = std::fs::read(&file) {
        return Some(bytes);
    }
    let path = app.lib.lock().unwrap().book(id).ok()?.path;
    let (bytes, _) = vibe_reader_core::format::cover(&path).ok()??;
    let _ = std::fs::create_dir_all(app.paths.covers());
    let _ = std::fs::write(&file, &bytes);
    Some(bytes)
}

// ---------- translator, agent inbox, reading log ----------

/// Translates text with the provider chosen in the settings.
#[tauri::command]
pub async fn translate(app: State<'_, App>, text: String, target: String) -> Res<String> {
    let config = Config::load(&app.paths).map_err(err)?;
    crate::translate::translate(&config.translate, &text, &target).map_err(err)
}

/// The conversation with agents about the open book: what the reader sent (memory under
/// `reader.*` by the user) and everything agents keep in the book's memory.
#[tauri::command]
pub fn inbox(app: State<App>) -> Res<Vec<vibe_reader_core::store::MemoryEntry>> {
    use vibe_reader_core::store::FROM_READER;
    let book = current_book(&app)?;
    let list = app.lib.lock().unwrap().memories(book.id, None).map_err(err)?;
    Ok(list
        .into_iter()
        .filter(|m| m.author != USER || m.key.starts_with(FROM_READER))
        .collect())
}

/// Leaves something for agents: `place` replaces the remembered page, `saved` and `message` add up.
#[tauri::command]
pub fn send_to_agent(app: State<App>, kind: String, value: String, locator: Option<Locator>) -> Res<i64> {
    let key = match kind.as_str() {
        "place" => "reader.place".to_owned(),
        "saved" | "message" => format!(
            "reader.{kind}.{}",
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .map_err(err)?
                .as_millis()
        ),
        _ => return Err(format!("unknown kind \"{kind}\"")),
    };
    let value: String = value.trim().chars().take(4000).collect();
    if value.is_empty() {
        return Err("nothing to send".into());
    }
    let book = current_book(&app)?;
    app.lib
        .lock()
        .unwrap()
        .remember(book.id, &key, &value, locator, USER)
        .map_err(err)
}

#[tauri::command]
pub fn forget(app: State<App>, id: i64) -> Res<()> {
    app.lib.lock().unwrap().forget(id, USER).map_err(err)
}

/// Reading sessions of the last `days` days, for the reading log on the desk.
#[tauri::command]
pub fn sessions(app: State<App>, days: i64) -> Res<Vec<vibe_reader_core::store::Session>> {
    app.lib
        .lock()
        .unwrap()
        .sessions(now() - days * 86_400, None)
        .map_err(err)
}

/// Full-text search in the open book (the reader may search everywhere, unlike agents).
#[tauri::command]
pub async fn search_book(app: State<'_, App>, query: String) -> Res<Vec<vibe_reader_core::excerpt::Hit>> {
    let open = app.open.lock().unwrap();
    let doc = &open.as_ref().ok_or("no book is open")?.doc;
    vibe_reader_core::excerpt::search(doc, &query, false, None, 500).map_err(err)
}
