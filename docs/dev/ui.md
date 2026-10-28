# UI

The window's interface lives in `src/gui/ui/` as plain HTML, CSS and ES
modules. There is no build step, no Node and no framework: edit a file, rebuild
the GUI crate (or drop the file into `<config>/ui/`), and reload.

## Files

| File | Role |
|---|---|
| `index.html` | All views as static markup; modules fill them. |
| `theme.css` | Design tokens: colors, fonts, sizes, motion. Light and dark sets. |
| `app.css` | Layout and components, built only from tokens. |
| `app.js` | Boot, view switching, keyboard, file opening, live reload of overrides. |
| `core.js` | Shared state, `call()` for Tauri commands, helpers, JSDoc types. |
| `library.js` | Shelf and library: spines, groups, search, the book card. |
| `reader.js` | Chapters, pages and scroll, position saving, annotations, panels, links. |
| `offsets.js` | DOM point ↔ chapter offset, mirroring `src/core/src/text.rs`. |
| `enhance.js` | Code highlighting, copy buttons, KaTeX, table wrappers, image zoom. |
| `settings.js` | Typography and appearance panel. |
| `palette.js` | `Ctrl+K` palette over the `commands` registry and the books. |
| `i18n.js`, `i18n/*.json` | Strings. English is the fallback; add a locale by adding a JSON file. |
| `fonts/`, `vendor/` | Fonts (OFL) and KaTeX, highlight.js, pdf.js. Refresh with `python3 scripts/vendor.py`. |

Types are written in JSDoc so editors can check them without a compiler.

## Talking to Rust

`call(name, args)` invokes a Tauri command from `src/gui/src/state.rs`. The
commands work on the open book held in the `App` state: `open_book`,
`open_path`, `chapter`, `save_position`, `annotate`, and so on. Book files are
served under `vr://localhost/res/<path inside the book>`, art under `/art/`.

## Offsets and annotations

Chapter HTML arrives sanitized, with `data-o` on every block (see
[locator](locator.md)). Anything the UI adds to a chapter must not change its
text as `offsets.js` sees it:

- add `data-skip` to UI elements inside the page (buttons, marks);
- add `data-wrap` to wrappers that are not part of the book (`.table-wrap`);
- keep replaced text in `data-tex` (KaTeX does this).

Highlights use the CSS Custom Highlight API (`::highlight(user)`,
`::highlight(agent)`), so annotations never change the DOM.

## Changing the design

1. Tokens first: most changes are a few variables in `theme.css`.
2. People and agents override the built-in files without rebuilding: any file
   in `<config>/ui/` replaces the file with the same path, and `user.css` there
   is loaded after everything else. CSS changes apply live; other files reload
   the page.
3. Keep animations behind the `--fast` and `--slow` tokens: they drop to zero
   for reduced motion and in lite mode.
