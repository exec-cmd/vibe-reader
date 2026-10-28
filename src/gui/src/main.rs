//! vibe-reader desktop window.

mod assets;
mod state;

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;

use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};
use vibe_reader_core::{Library, Paths};

use crate::state::App;

struct Launch {
    started: Instant,
    measure: bool,
}

/// Called by the UI once the first screen is painted.
#[tauri::command]
fn ready(app: tauri::AppHandle, launch: State<Launch>) {
    let ms = launch.started.elapsed().as_millis();
    if launch.measure {
        println!("window ready in {ms} ms");
        app.exit(0);
    }
}

fn main() -> anyhow::Result<()> {
    let started = Instant::now();
    let mut measure = false;
    let mut lite = false;
    let mut initial = None;
    for arg in std::env::args_os().skip(1) {
        match arg.to_str() {
            Some("--measure") => measure = true,
            Some("--lite") => lite = true,
            Some("--help" | "-h") => {
                println!("usage: vibe-reader-gui [--lite] [FILE]");
                return Ok(());
            }
            _ => initial = Some(PathBuf::from(arg)),
        }
    }
    // Lite mode needs a file; without one it is the normal window.
    let lite = lite && initial.is_some();
    let paths = Paths::resolve()?;
    let overrides = paths.ui_overrides();
    let app_state = App {
        lib: Mutex::new(Library::open(&paths)?),
        paths: paths.clone(),
        open: Mutex::new(None),
        lite,
        initial,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Launch { started, measure })
        .manage(app_state)
        .register_uri_scheme_protocol("vr", move |ctx, request| {
            assets::serve(ctx.app_handle(), &overrides, request.uri().path())
        })
        .invoke_handler(tauri::generate_handler![
            ready,
            state::boot,
            state::library,
            state::open_book,
            state::open_path,
            state::chapter,
            state::save_position,
            state::annotate,
            state::edit_annotation,
            state::delete_annotation,
            state::annotations,
            state::import_open,
            state::add_files,
            state::save_config,
            state::set_status,
            state::shelve,
        ])
        .setup(move |app| {
            assets::watch(app.handle().clone(), paths.ui_overrides());
            let title = if lite { "vibe-reader · lite" } else { "vibe-reader" };
            WebviewWindowBuilder::new(app, "main", WebviewUrl::CustomProtocol("vr://localhost/".parse()?))
                .title(title)
                .inner_size(if lite { 860.0 } else { 1180.0 }, 800.0)
                .min_inner_size(480.0, 360.0)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())?;
    Ok(())
}

/// Shortcut to the managed state from places that only have an `AppHandle`.
pub fn app_state(handle: &tauri::AppHandle) -> State<'_, App> {
    handle.state::<App>()
}
