# Repository Guide

## Overview

vibe-reader is a desktop book reader for Linux written in Rust. A synchronous core crate parses books and keeps the library in SQLite. The `vibe-reader` CLI exposes the library to people and AI agents. The `vibe-reader-gui` window is Tauri with a build-free HTML/CSS/JS UI.

Work in progress: read `docs/progress.md` first to see which phase is next, and `docs/concept.md` for the product decisions behind it.

## Layout

- `src/core/`: library crate. Formats, locators, storage, atmosphere profiles. Built-in presets live in `src/core/presets/`.
- `src/cli/`: the `vibe-reader` binary (clap). Agent Skills live in `src/cli/skills/` and are embedded into the binary.
- `src/gui/`: the Tauri app. `src/gui/ui/` holds the UI as plain HTML, CSS and ES modules, embedded at build time and served over the `vr://` scheme.
- `docs/user/`: documentation for readers. `docs/dev/`: documentation for contributors.

## Development

Check every change with:

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Run the CLI with `cargo run -p vibe-reader -- --help` and the window with `cargo run -p vibe-reader-gui`. Set `VIBE_READER_HOME` to a temporary directory to keep test data away from the real library.

## Rules that the code does not show

- The core stays synchronous, without GUI, async runtime or heavy dependencies. New formats go behind a Cargo feature.
- The UI has no build step: no Node, npm or frameworks. Types go in JSDoc comments. Design values are CSS tokens.
- Files embedded with `include_str!`, `include_dir!` or Tauri assets live inside the crate that embeds them, so `cargo package` ships them.
- Dependencies must be compatible with MIT OR Apache-2.0. GPL crates are rejected (this is why EPUB is parsed in-house).
- Book text is untrusted input: sanitize HTML before it reaches the webview and mark it as data in CLI output.
- Before changing a subsystem, read its page in `docs/dev/` when one exists: architecture, building, data model, locator, atmosphere schema, IPC, UI, releasing.
