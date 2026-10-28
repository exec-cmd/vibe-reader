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
}

#[tauri::command]
pub fn boot(app: State<App>) -> Res<Boot> {
    Ok(Boot {
        config: Config::load(&app.paths).map_err(err)?,
        lite: app.lite,
        initial: app.initial.clone(),
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

#[tauri::command]
pub fn open_book(app: State<App>, id: i64) -> Res<Opened> {
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
pub fn open_path(app: State<App>, path: PathBuf) -> Res<Opened> {
    if !app.lite {
        let id = app.lib.lock().unwrap().add(&path, false).map_err(err)?.0.id;
        return open_book(app, id);
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
pub fn annotate(app: State<App>, kind: AnnotationKind, start: Locator, end: Locator, body: String) -> Res<Annotation> {
    let book = current_book(&app)?;
    let open = app.open.lock().unwrap();
    let doc = &open.as_ref().ok_or("no book is open")?.doc;
    let chapter = doc.chapters.get(start.chapter).ok_or("no such chapter")?;
    let quote: String = if start.chapter == end.chapter && end > start {
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
pub fn import_open(app: State<App>) -> Res<Book> {
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

#[tauri::command]
pub fn add_files(app: State<App>, paths: Vec<PathBuf>) -> Res<Vec<Book>> {
    let lib = app.lib.lock().unwrap();
    let mut added = Vec::new();
    for path in paths {
        if vibe_reader_core::Format::detect(&path).is_some() {
            added.push(lib.add(&path, false).map_err(err)?.0);
        }
    }
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
    let wanted = match config.reader.mode.as_str() {
        "light" => Mode::Light,
        "dark" => Mode::Dark,
        _ if dark => Mode::Dark,
        _ => Mode::Light,
    };
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
