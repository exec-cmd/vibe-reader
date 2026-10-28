# Building

## Requirements

- Rust 1.90 or newer.
- For the GUI on Linux: WebKitGTK 4.1 and GTK 3 development files.

Debian and Ubuntu:

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

Arch Linux:

```bash
sudo pacman -S webkit2gtk-4.1 gtk3
```

The core and the CLI need no system libraries: SQLite is compiled in.

## Core features

`vibe-reader-core` keeps formats behind Cargo features. `epub` and `markdown`
are on by default (TXT and HTML are always available); `fb2` and `pdf` are
optional. The CLI and the GUI enable all of them.

```bash
cargo test -p vibe-reader-core --features fb2,pdf
```

## Build and run

```bash
cargo build --release            # all three crates
cargo run -p vibe-reader -- --help
cargo run -p vibe-reader-gui
```

The GUI builds with plain `cargo`. The `custom-protocol` feature of `tauri` is
always on, so the UI in `src/gui/ui/` is embedded into the binary in every
profile and no Tauri CLI or dev server is needed.

Install the binaries into `~/.cargo/bin`:

```bash
cargo install --path src/cli
cargo install --path src/gui
```

## Measure startup

```bash
cargo run --release -p vibe-reader-gui -- --measure
```

The window prints the time from process start to the first painted frame and
exits. The budget is 700 ms.

## Vendored files

Fonts, KaTeX, highlight.js and pdf.js are committed under `src/gui/ui/fonts/`
and `src/gui/ui/vendor/`. To upgrade them, change the pinned versions in
`scripts/vendor.py` and run:

```bash
python3 scripts/vendor.py            # everything
python3 scripts/vendor.py fonts      # or one part: fonts, katex, highlight, pdfjs
```

## Checks

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

CI runs the same commands and also fails when the release binaries plus the
UI files exceed 100 MB.
