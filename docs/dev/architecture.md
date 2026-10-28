# Architecture

## Crates

| Crate | Path | Role |
|---|---|---|
| `vibe-reader-core` | `src/core` | Synchronous library without GUI or async runtime. Parses books, keeps the SQLite library, locators and statistics, returns sanitized HTML and plain text. |
| `vibe-reader` | `src/cli` | The `vibe-reader` binary for people and AI agents. |
| `vibe-reader-gui` | `src/gui` | Tauri window. The webview renders text, code, formulas and typography. |

The GUI uses a webview because EPUB, HTML and Markdown are web content. A native
Rust GUI would need its own HTML and CSS renderer and code highlighting.

## UI delivery

The UI in `src/gui/ui/` is plain HTML, CSS and ES modules without a build step.
Tauri embeds it at compile time. The window loads `vr://localhost/`, and the
`vr` scheme handler (`src/gui/src/assets.rs`) answers each request:

1. a file with the same relative path in `<config>/ui/` wins;
2. otherwise the embedded file is served.

Every response carries a Content Security Policy that allows only `vr:`
resources. A background thread checks `<config>/ui/` once a second and emits
`ui-changed`; the UI reloads stylesheets in place, or the page for other files.
This is how a person or an agent changes the design by editing one CSS file,
without rebuilding.

## Measurements

Prototype measured on 2026-10-28, Arch Linux (CachyOS), niri compositor,
WebKitGTK 2.54, release profile (`lto`, `opt-level = "s"`, `strip`).

| Metric | Value | Budget |
|---|---|---|
| `vibe-reader-gui` binary | 3.6 MB | |
| `vibe-reader` binary (empty CLI) | 0.5 MB | |
| Start to first frame (`--measure`, 5 runs) | 216–220 ms | 700 ms |
| Resident memory, GUI + WebKit web and network processes | ≈ 200 + 230 + 65 MB RSS, shared libraries counted in each | measured only |

CSS multi-column layout with `column-fill: auto` and a fixed height paginates
correctly in WebKitGTK, including `hyphens: auto` for Russian text. The config
override replaced `theme.css` in a running window within about one second.
