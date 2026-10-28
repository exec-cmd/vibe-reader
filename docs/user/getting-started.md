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

Start the window and drop book files onto it, or press **Open…** (`O`):

```bash
vibe-reader-gui
```

From a terminal:

```bash
vibe-reader add ~/Books/crime-and-punishment.epub --shelf Classics
vibe-reader open
```

The library keeps a link to the file; add `--copy` to store a copy instead.
Supported formats: EPUB, FB2, Markdown, TXT, HTML and PDF.

## Read

Click a spine to open the book. Prose opens in pages, technical books and
Markdown in a continuous scroll; `L` switches between them. The thin line at the
top shows how far you are, and the window remembers your place.

Press `Ctrl+K` for the command palette, `Esc` to go back to the shelf. See
[reading](reading.md) and [keyboard](keyboard.md) for more.

## Quick look at a file

```bash
vibe-reader open notes.md --lite
```

Lite mode shows one file without the library, atmosphere or animations. The
book joins the library only when you press **Add to library**. A Markdown file
open in lite mode reloads when you save it in your editor.

## Next steps

- Let an AI agent discuss and annotate your books: [agents](agents.md).
- Change fonts, colors and the whole design: [configuration](configuration.md).
