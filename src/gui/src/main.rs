//! vibe-reader desktop window.

mod assets;

use std::time::Instant;

use tauri::{State, WebviewUrl, WebviewWindowBuilder};
use vibe_reader_core::Paths;

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
    let measure = std::env::args().any(|arg| arg == "--measure");
    let paths = Paths::resolve()?;
    let overrides = paths.ui_overrides();

    tauri::Builder::default()
        .manage(Launch { started, measure })
        .register_uri_scheme_protocol("vr", move |ctx, request| {
            assets::serve(ctx.app_handle(), &overrides, request.uri().path())
        })
        .invoke_handler(tauri::generate_handler![ready])
        .setup(move |app| {
            assets::watch(app.handle().clone(), paths.ui_overrides());
            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::CustomProtocol("vr://localhost/".parse()?),
            )
            .title("vibe-reader")
            .inner_size(1100.0, 760.0)
            .min_inner_size(480.0, 360.0)
            .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())?;
    Ok(())
}
