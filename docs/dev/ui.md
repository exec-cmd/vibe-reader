# UI

The window's interface lives in `src/gui/ui/` as plain HTML, CSS and ES
modules. There is no build step, no Node and no framework: edit a file, rebuild
the GUI crate (or drop the file into `<config>/ui/`), and reload.

## Modules

| File | Role |
|---|---|
| `index.html` | Every view as static markup (library, reader, settings); links the stylesheets. |
| `app.js` | Boot, view switching, global keys (Ctrl+O, M), opening files and drops. |
| `core.js` | `state`, `call()` for Tauri commands, `commands` registry for the palette, `applyConfig()` and `saveConfig()`. |
| `ui.js` | Shared widgets: `icon`, `menu`, `select`, `dialog`, `ask`, `confirmAction`, `toast`, `progress`. |
| `library.js` | Catalog drawers, the desk, the bookcase, the catalog card, book menu, mini mode, library keys. |
| `reader.js` | Reader shell: dock, running head, folio, page turns, idle state, side panel tabs, annotations, find. It creates one engine per open book. |
| `flow.js` | `FlowEngine` for EPUB, FB2, Markdown, TXT and HTML. |
| `pdfview.js` | `PdfEngine` for PDF, drawn with pdf.js. |
| `pdfcover.js` | `loadPdfjs()` (lazy pdf.js loader) and PDF covers. |
| `offsets.js` | DOM point ↔ offset (`offsetOf`, `rangeOf`, `pointAt`), and `normalize()` for PDF text pieces. |
| `enhance.js` | Code highlighting, copy buttons, KaTeX, table wrappers, image zoom in chapter content. |
| `atmosphere.js` | Apply an atmosphere look; `updateSound()` follows its sound. |
| `particles.js` | Particles and light: `start(p, rgb, strength)`, `setEdge(rect)` (snow and rain meet the page), `blow(dir)` (page-turn gust), `setOnStrike(fn)` (lightning). |
| `sound.js` | Ambient sound from Web Audio, no files: `play(sound, level)`, `stop()`, `thunder()`. |
| `translator.js` | The translator card: `init(visibleText)`, `open()`, `toggle()`, `target()`. |
| `settings.js` | The settings page: sections built from `row`, `segmented`, `dropdown`, `toggle`, `slider`. |
| `palette.js` | Command palette (Ctrl+Shift+P) over the `commands` registry and the books. |
| `i18n.js`, `i18n/*.json` | Strings. `t(key)`; English is the fallback. |
| `fonts/`, `vendor/` | Fonts (OFL), KaTeX, highlight.js, pdf.js. Refresh with `python3 scripts/vendor.py`. |

Types are written in JSDoc so editors can check them without a compiler.

## Stylesheets

`index.html` loads them in this order: `fonts/fonts.css`, KaTeX, then:

| File | Role |
|---|---|
| `theme.css` | Design tokens: colors, fonts, sizes, motion. Light set on `:root`, dark set under `data-mode="dark"`. |
| `base.css` | Shared components: buttons, fields, toolbars, menus, dialogs, toasts. |
| `library.css`, `reader.css`, `settings.css` | One view each. |
| `atmosphere.css` | Background, effects and particle layers; palette values come from the atmosphere profile. |
| `user.css` | Loaded last, from `<config>/ui/` if present. |

Animations use the `--fast` and `--slow` tokens. They drop to zero for reduced
motion and in lite mode.

| Token | Set by | Meaning |
|---|---|---|
| `--case`, `--board`, `--card`, `--card-rule` | `theme.css`, both modes | Bookcase interior, shelf boards, catalog card and its rules. |
| `--turn` | `theme.css` | Page turn duration. |
| `--glass` | `core.js`, from `[reader] opacity` | Window opacity; `:root[data-glass]` makes the background transparent. |
| `:root[data-turn]` | `core.js`, from `[reader] page_turn` | Chooses the turn: `curl`, `slide` or `none`. |
| `--read` | `reader.js` | Share of the book read; drives the page edges. |
| `--fx` | `atmosphere.js`, from `[reader] effects` | Effect strength; scales background, glow, grain, particles and lightning. |

## Engines

The reader shell holds one engine per open book. Both engines expose the same
methods, so `reader.js` drives either one the same way:

| Method | Meaning |
|---|---|
| `open(...)` | Lay out the book at a place. `FlowEngine.open(chapters, {chapter, offset})`; `PdfEngine.open(page)`. |
| `next()`, `prev()` | Move one screen or page. At the edge, flow moves to the next chapter; PDF moves to the next spread. |
| `label()` | The pager text for the current place. |
| `selection()` | The current text selection as `{chapter, start, end, text, rect}`, or `null`. For PDF, `chapter` is the page index. |
| `range(chapter, start, end)` | A DOM `Range` for an offset span on what is drawn, or `null`. Used to paint highlights and find hits. |
| `setLayout(layout)` | Switch spread, one page or scroll, keeping the place. |
| `visibleText()` | The text on screen, for Translate this page and Send this page. |

## Reader chrome

`#dock` is the only permanent control. `#reader-sub` (running head) and `#folio`
(page number, a button) print around the book. `reader.js` sets `data-idle` on
`#reader` after the mouse rests (`[reader] autohide`); mouse movement and focus
clear it. The side panel `#side` opens with `data-open="true"` or `"false"`, not
`hidden`. `#book` holds `#frame` and `#leaf`, the sheet that swings over the
spine in `turn()`.

The library's `#room` holds `#desk` (books being read) and `#shelves` (`.stacks`).

Engine-specific calls stay behind `instanceof PdfEngine` checks in `reader.js`
(for example `chapterStart()` and `chapterEnd()`). Keep format branches there,
not in the engines.

## Talking to Rust

`call(name, args)` invokes a Tauri command registered in `src/gui/src/state.rs`.
Book files are served under `vr://localhost/res/<path inside the book>`, art
under `/art/`. Command names are in `state.rs`; use them from there.

## Offsets and annotations

Chapter HTML arrives sanitized, with `data-o` on every block (see
[locator](locator.md)). Anything the UI adds to a chapter must not change its
text as `offsets.js` sees it:

- add `data-skip` to UI elements inside the page (buttons, marks);
- add `data-wrap` to wrappers that are not part of the book (`.table-wrap`);
- keep replaced text in `data-tex` (KaTeX does this).

A PDF page has one block: its text layer, stamped `data-o="0"`. Its offsets
come from the pdf.js text items through `normalize()`.

Highlights use the CSS Custom Highlight API (`::highlight(user)`,
`::highlight(agent)`, `::highlight(found)`), so annotations never change the DOM.

## Adding a setting

1. Add the field to its struct in `src/core/src/config.rs` (`Reader`,
   `Typography`, `LibraryView`, `Pdf` or `Agent`). Fields carry `#[serde(default)]`,
   so old config files still load.
2. Add a `row(label, hint, control)` to the section builder in `settings.js`
   (`appearance`, `reading`, `pdf`, `library`, ...). The change callback writes
   the field and calls `changed()` (applies and saves) or `changed(true)` to
   re-render the section.
3. Add the label and hint keys to both `i18n/en.json` and `i18n/ru.json`.
4. If the setting changes the look, apply it in `applyConfig()` in `core.js`.
   Font families must match `FONTS` in `config.rs` and `settings.js`.
5. Document it in `docs/user/configuration.md`.

## Changing the design

1. Tokens first: most changes are a few variables in `theme.css`.
2. People and agents override the built-in files without rebuilding: any file
   in `<config>/ui/` replaces the file with the same path, and `user.css` there
   is loaded after everything else. CSS changes apply live; other files reload
   the page.
