[Русская версия](ru/getting-started.md)

# Getting started

## Install

vibe-reader has two programs:

- `vibe-reader-gui`, the reader window;
- `vibe-reader`, the command line used by you and by AI agents.

Install both from source (requirements in [building](../dev/building.md)):

```bash
cargo install --path src/cli
cargo install --path src/gui
```

Release builds for Linux (a CLI archive and an AppImage) are attached to each
GitHub release.

## Add your first book

Start the window:

```bash
vibe-reader-gui
```

Then add books in one of these ways:

- click **Add books** in the toolbar, or press `Ctrl+O`;
- drag the files onto the window.

From a terminal:

```bash
vibe-reader add ~/Books/crime-and-punishment.epub --shelf Classics
vibe-reader open
```

The library keeps a link to each file. To store a copy in the library instead,
add `--copy`, or turn on **Keep copies of added files** in Settings → Library.
Supported formats: EPUB, FB2, PDF, Markdown, TXT and HTML.

## Read

Double-click a spine, or select it and press Enter, to open the book. Press
`Esc` to go back to the library. The thin progress line at the top shows how far
you are, and the window remembers your place.

Use the layout button or `L` to switch between layouts. The default comes from
Settings → Reading (for PDF, from Settings → PDF).

Press `Ctrl+Shift+P` for the command palette. It lists commands and books.

See [library](library.md), [reading](reading.md), [PDF](pdf.md) and
[keyboard](keyboard.md) for more.

## Quick look at a file

```bash
vibe-reader open notes.md --lite
```

Lite mode shows one file without the library, atmosphere or animations. The
book joins the library only when you press **Add to library**. A Markdown file
open in lite mode reloads when you save it in your editor.

## Next steps

- Let an AI agent discuss and annotate your books: [agents](agents.md).
- Change the font, theme and atmosphere: [configuration](configuration.md).
