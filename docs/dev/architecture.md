# Architecture

vibe-reader is a desktop reader written in Rust. It has no AI of its own:
agents work with it through the `vibe-reader` CLI and the bundled Skills. This
page explains how the parts fit and why they are built this way.

## Crates

| Crate | Path | Role |
|---|---|---|
| `vibe-reader-core` | `src/core` | Synchronous library without GUI or async runtime. Parses books, keeps the SQLite library, locators, atmosphere profiles, statistics and the IPC link; returns sanitized HTML and plain text. |
| `vibe-reader` | `src/cli` | The `vibe-reader` binary for people and AI agents. Embeds the Skills. |
| `vibe-reader-gui` | `src/gui` | Tauri window. Embeds the UI, fonts and vendored libraries. The only crate that makes network calls (the translator, `ureq`). |

```
            ┌───────────── vibe-reader-core ─────────────┐
 book file ─► format::open ─► text::prepare ─► Document  │
            │  (EPUB, FB2,     (ammonia, data-o,          │
            │   MD, TXT,        normalized text)          │
            │   HTML, PDF)                                 │
            │  store::Library (SQLite)   atmosphere   ipc │
            └──────┬──────────────────────────┬─────────┬─┘
                   │                          │         │ Unix socket
             vibe-reader (CLI)        vibe-reader-gui ◄──┘
             JSON / Markdown           Tauri commands ─► webview UI (vr://)
```

## Decisions and their reasons

- **Webview, not a native GUI.** EPUB, HTML and Markdown are web content.
  A native Rust GUI would need its own HTML and CSS renderer, code
  highlighting and formula layout. Tauri uses the system webview (WebKitGTK
  on Linux), which keeps the binary small.
- **A light synchronous core.** The core has no async runtime and no GUI
  dependencies, so the CLI starts in milliseconds and the core is easy to
  test. Formats sit behind Cargo features; EPUB and Markdown are default,
  FB2 and PDF optional. EPUB and FB2 are parsed in-house on `zip` and
  `quick-xml`, because the available EPUB crate is GPL.
- **A build-free UI.** The UI is plain HTML, CSS and ES modules with types in
  JSDoc: no Node, npm or framework. Anyone, including an agent, can change
  the design by editing one file, and the release needs no JS toolchain.
  Design values are CSS tokens.
- **Overrides instead of rebuilds.** Every UI file is embedded, and a file
  with the same path in `<config>/ui/` wins (`src/gui/src/assets.rs`). A
  background thread notices changes and the window reloads CSS in place.
- **One address for a place: the locator.** Chapter, offset in normalized
  text, and an anchor quote (see [locator](locator.md)). Notes, atmosphere
  ranges, art, memory, the CLI and the live window all use it, for every
  format, and it survives small edits of the file.
- **Book text is untrusted.** HTML is sanitized with ammonia (no scripts,
  handlers or remote URLs; ids prefixed), every response carries a strict
  CSP, and the CLI marks book text as data so agents can resist prompt
  injection.
- **Agents are guests.** They read everything, write only records that carry
  their name, can undo their own writes, cannot change the reader's records,
  and cannot remove books (destructive commands need an interactive
  terminal). Their reads stop at the reader's position unless spoilers are
  allowed. The reader's profile (habits, genres, speed) is shared only with
  consent in `config.toml`.
- **Declarative atmosphere.** Profiles are data with a schema, not CSS, so an
  agent cannot break the layout or make text unreadable: fonts come from the
  bundled set and contrast is checked (see
  [atmosphere schema](atmosphere-schema.md)). Presets may add CSS; profiles
  set by agents may not.
- **Local only.** One SQLite file, no telemetry, no network port; the live
  link is a Unix socket only the owner can open (see [IPC](ipc.md)). The window
  sends text to a translation provider only when the reader presses Translate.
  Provider keys sit in `config.toml` (mode 0600), which only the window reads
  and `vibe-reader config` prints through `Config::redacted()`.

## Where things live

| Concern | Code |
|---|---|
| Paths, `VIBE_READER_HOME` | `src/core/src/paths.rs` |
| `config.toml` | `src/core/src/config.rs` |
| Formats | `src/core/src/format/` |
| Sanitizing and normalized text | `src/core/src/text.rs` |
| Locators | `src/core/src/locator.rs` |
| Chunks and search for agents | `src/core/src/excerpt.rs` |
| Library database | `src/core/src/store/`, `src/core/migrations/` |
| Atmosphere | `src/core/src/atmosphere.rs`, `src/core/presets/` |
| Live link | `src/core/src/ipc.rs` |
| CLI commands | `src/cli/src/` (`library`, `reading`, `notes`, `look`, `service`) |
| Window state and commands | `src/gui/src/state.rs` |
| Translator | `src/gui/src/translate.rs` |
| `vr://` scheme and live reload | `src/gui/src/assets.rs` |
| UI | `src/gui/ui/` (see [UI](ui.md)) |

## Measurements

Measured on 2026-10-28, Arch Linux (CachyOS), niri compositor, WebKitGTK
2.54, release profile (`lto`, `opt-level = "s"`, `strip`).

| Metric | Value | Budget |
|---|---|---|
| `vibe-reader-gui` (UI, fonts, KaTeX, pdf.js embedded) | 12.9 MB | |
| `vibe-reader` | 8.6 MB | |
| `src/gui/ui/` (already inside the GUI binary) | 4.0 MB | |
| Install size, both binaries | ≈ 21.5 MB | 100 MB |
| Start to first frame (`--measure`) | 265–500 ms | 700 ms |
| Empty prototype window, for comparison | 216–220 ms | |
| Resident memory, GUI + WebKit processes (prototype) | ≈ 200 + 230 + 65 MB RSS, shared libraries counted in each | measured only |
| Adding a 1.3-million-character EPUB (debug build) | 0.22 s | |

CSS multi-column layout with `column-fill: auto` paginates correctly in
WebKitGTK, including `hyphens: auto` for Russian. The CSS Custom Highlight API
works, so annotations never touch the DOM.

CI checks the install size when it runs (for now it is paused and starts only
by hand). Startup time is not checked in CI, because CI runners have no
display; run `--measure` before a release.
