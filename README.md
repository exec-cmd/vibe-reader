# vibe-reader

vibe-reader is a desktop book reader for Linux. It shows EPUB, FB2, Markdown,
TXT, HTML and PDF with careful typography, and each book can have its own
atmosphere: a palette, a pair of fonts, a background, quiet rain or snow,
chapter drawings and illustrations.

There is no AI inside the app. The `vibe-reader` command-line tool and the
bundled Skills let the agent you already use (Claude Code, Codex, opencode and
others) read your library, discuss the chapter you are on without spoilers,
keep notes and set the atmosphere. The reader window shows what the agent does
as it happens.

[Русская версия](README_RU.md)

## Quick start

Requirements: Rust 1.90 or newer and, for the window, WebKitGTK 4.1
(see [building](docs/dev/building.md)).

```bash
git clone https://github.com/exec-cmd/vibe-reader
cd vibe-reader
cargo install --path src/cli
cargo install --path src/gui

vibe-reader add ~/Books/crime-and-punishment.epub --shelf Classics
vibe-reader open
```

Drop more files onto the window or press **Open…**. Release archives and an
AppImage are attached to each [GitHub release](https://github.com/exec-cmd/vibe-reader/releases).

## Reading

- **Shelf, library, reading.** One window: recent books as spines, the whole
  library grouped by your shelves or by author, and an immersive page with a
  thin progress line.
- **Pages or scroll.** Prose opens in pages (a spread on wide windows),
  technical books and Markdown in a scroll. Code is highlighted and copyable,
  TeX and MathML formulas are typeset, wide tables scroll, images zoom.
- **Notes.** Highlights, notes and bookmarks, exported to Markdown or JSON.
  Notes by an agent are marked differently from yours.
- **Typography.** Six bundled fonts with Cyrillic, size, line length and
  spacing, justification and hyphenation, light and dark.
- **Keyboard first.** `Ctrl+K` palette, single-key commands, optional Vim keys.
- **Quick view.** `vibe-reader open notes.md --lite` opens one file without the
  library; Markdown reloads when you save it.

More: [getting started](docs/user/getting-started.md),
[reading](docs/user/reading.md), [keyboard](docs/user/keyboard.md).

## Atmosphere

```bash
vibe-reader atmosphere set --book 3 --preset rain
vibe-reader atmosphere set --book 3 --chapter 7 --preset storm
vibe-reader art add 3 ./map.png --locator ch:2:4800 --as page
```

Seven presets come built in: study, terminal, noir, soft, rain, storm and
mountain. Profiles are declarative TOML or JSON with a checked schema: only
bundled fonts, and no profile can make the text hard to read. Everything else in
the interface can be restyled live with `~/.config/vibe-reader/ui/user.css`.
See [atmosphere](docs/user/atmosphere.md).

## AI agents

```bash
vibe-reader skills install            # Claude Code; --dir for other agents
```

Then ask your agent about your book. The Skills teach it to:

| Skill | Purpose |
|---|---|
| `reader-cli` | Use the CLI safely: locators, output, authorship, undo. |
| `reader-analyze` | Analyze a book or your reading: characters, themes, glossary, pace. |
| `reader-discuss` | Talk about the place you are reading, without spoilers. |
| `reader-atmosphere` | Pick presets, style chapters and scenes, add illustrations. |

Agents read only up to your position unless you ask otherwise, sign everything
they write, can undo it, cannot remove books, and see your reading habits only
if you allow it. Book text is passed to them as untrusted data. See
[agents](docs/user/agents.md) and the [CLI reference](docs/user/cli.md).

## Configuration

Settings live in `~/.config/vibe-reader/config.toml` and the library in one
SQLite file in `~/.local/share/vibe-reader/`. Nothing leaves your computer.
See [configuration](docs/user/configuration.md).

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md) and
[architecture](docs/dev/architecture.md).

## Built with

Rust and [Tauri](https://tauri.app/) with the system webview. Books are parsed
with `zip`, `quick-xml`, `pulldown-cmark` and `pdf-extract` and sanitized with
`ammonia`; the library is SQLite through `rusqlite`. The window uses
[KaTeX](https://katex.org/), [highlight.js](https://highlightjs.org/) and
[pdf.js](https://mozilla.github.io/pdf.js/), and fonts under the SIL Open Font
License.

## License

Licensed under either of [Apache License 2.0](LICENSE-APACHE) or
[MIT license](LICENSE-MIT) at your option.
