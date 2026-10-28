# Repository Guide

## Overview

vibe-reader is a desktop book reader for Linux written in Rust. A synchronous core crate parses books and keeps the library in SQLite. The `vibe-reader` CLI exposes the library to people and AI agents. The `vibe-reader-gui` window is Tauri with a build-free HTML/CSS/JS UI.

## Layout

- `src/core/`: library crate. Formats, locators, storage, atmosphere profiles, the IPC link. Built-in presets live in `src/core/presets/`, SQL migrations in `src/core/migrations/`.
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
- The UI has no build step: no Node, npm or frameworks. Types go in JSDoc comments. Design values are CSS tokens in `theme.css`.
- Every UI string goes in both `src/gui/ui/i18n/en.json` and `ru.json`, under the same key.
- New UI pieces use the shared widgets in `ui.js` (`menu`, `select`, `dialog`, `ask`, `confirmAction`, `toast`), not a new widget.
- UI elements inside a book page carry `data-skip` (or `data-wrap` for wrappers) so offsets stay correct.
- PDF locators count characters of the pdf.js text layer, normalized as `offsets.js` `normalize()` does. Never derive them from the PDF file itself.
- Normalized text rules exist twice, in `src/core/src/text.rs` and `src/gui/ui/offsets.js`; change both together.
- Bump `CACHE_VERSION` (`src/core/src/store/mod.rs`) when the parsed book form changes. The cache is keyed only by file size and mtime.
- Files embedded with `include_str!` or Tauri assets live inside the crate that embeds them, so `cargo package` ships them.
- Dependencies must be compatible with MIT OR Apache-2.0. GPL crates are rejected; this is why EPUB and FB2 are parsed in-house.
- Book text is untrusted input: sanitize HTML before it reaches the webview and mark it as data in CLI output.
- User-visible behavior changes update the matching page in `docs/user/`; CLI changes update `docs/user/cli.md` and, when agents use the command, the Skills.

## Where to read before changing a subsystem

| Changing | Read |
|---|---|
| Crate boundaries, dependencies, budgets | `docs/dev/architecture.md` |
| Database schema, undo, authorship | `docs/dev/data-model.md` |
| Locators, offsets, sanitizing | `docs/dev/locator.md` |
| Atmosphere profiles or presets | `docs/dev/atmosphere-schema.md` |
| CLI ↔ window link | `docs/dev/ipc.md` |
| UI modules, tokens, overrides | `docs/dev/ui.md` |
| Build, vendored files | `docs/dev/building.md` |
| Releases | `docs/dev/releasing.md` |
| Skills in `src/cli/skills/` | the `writing-for-agents` guidance, if available |
