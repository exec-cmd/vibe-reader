# vibe-reader: facts for the documentation (state after the redesign, 2026-10-28)

Repository: /run/media/ankaped/ADATA SD810/ankaped/projects/ai-projects/vibe.reader
Everything below is the source of truth. Do not invent features that are not listed here.

## What it is
Desktop book reader for Linux (Rust + Tauri, system WebKitGTK webview). Formats: EPUB, PDF, FB2, Markdown, TXT, HTML (DjVu is NOT supported). Two programs: `vibe-reader-gui` (window) and `vibe-reader` (CLI for people and AI agents). No AI inside; agents use the CLI and bundled Skills.

## Window: library
- Toolbar: sidebar toggle, search field (filters by title or author; Enter opens the first match), "Group" dropdown (Shelves / Authors / Format / Status / No groups), "Sort" dropdown (Recently read / Title / Author / Progress / Date added), "Add books" button (file dialog; also Ctrl+O; also drag and drop files onto the window), mini-library button, settings (gear, Ctrl+,).
- Left sidebar: Library section with counts: All books, Reading, Unread, Finished, Dropped. Shelves section with "+" to create a shelf; right-click a shelf to rename or delete it (deleting a shelf keeps its books). Drag a spine onto a shelf in the sidebar to put the book there. Authors section (top 10, "Show all").
- Middle: books as bound spines (bookcloth color, gilt title, author surname) standing on shelf boards, grouped by the chosen grouping. A gilt ribbon on a spine marks a book being read. Height follows length.
- Click a spine to select it; double-click or Enter to open. Arrow keys move between spines. F2 edits, Delete removes (with confirmation).
- Right panel (details of the selected book): cover (EPUB/FB2 own cover; for PDF the first page is drawn automatically; you can choose any image), title, authors, progress bar with percent, buttons Continue/Read, Edit, More (…). Fields: Status (dropdown: unread, reading, finished, dropped), Atmosphere (dropdown of presets or Default), Shelves (chips with × to take off a shelf, "Add to shelf" menu with checkboxes and "New shelf"), Format and pages/chapters, length in words, date added, last opened, file path.
- Book menu (right-click a spine or the "…" button): Read/Continue, Edit details (title, authors separated by commas, change cover), Shelves ▸, Status ▸, Atmosphere ▸, Change cover…, Start over (reset position; notes stay), Copy file path, Remove from library… (the file stays on disk unless the library kept a copy).
- Mini library: button in the toolbar or key M. The window shrinks to a small strip (760×340) with one shelf of recently opened books and a "Continue" line for the last book. Same button (or M) expands back. Opening a book from mini mode restores the full window. Note: tiling window managers (niri, sway, Hyprland tiles) may ignore the resize; the layout still switches to the compact one. Settings → Library → "Start in the mini library".
- Titles of PDFs come from the PDF metadata when it looks real, otherwise from the file name: download-site tags like "(z-library.sk, 1lib.sk)" and "(1)" are dropped, a trailing "(Author Name)" becomes the author, CamelCase file names get spaces. Titles and authors can be edited.
- Importing many files shows a progress card in the corner; files are parsed in the background. Large PDFs take a few seconds the first time; after that the parsed book is cached and opens instantly.

## Window: reader
- Toolbar: Back to library (Esc), side panel toggle (T), book title and author/chapter, pager (previous page, page number field — type a number and press Enter, total pages, next page), zoom (PDF only: zoom out, zoom menu with "Whole page", "Page width", 50–300 %, zoom in), layout button (menu), find (Ctrl+F), atmosphere menu (sparkle icon), light/dark (D), full screen (F11; the toolbar hides and shows when the mouse moves to the top), More (…: bookmark this page, go to page, find in book, reading settings).
- Layouts for EPUB/FB2/MD/TXT: Spread (two facing pages bound in the middle; needs a wide window), One page (a full-height sheet), Scroll. Default from Settings → Reading; technical books open on one page when Spread is chosen. L cycles layouts.
- Layouts for PDF: Spread (two pages side by side, the first page alone like a printed book; in a tall narrow window it shows one page), One page, Scroll (continuous). Zoom: whole page, page width, or a percentage; Ctrl+wheel, Ctrl+= / Ctrl+-, + / -, 0 resets. A zoomed page scrolls before turning to the next one.
- Side panel tabs: Contents (EPUB/FB2/MD chapters with nesting; for PDF the PDF's own bookmarks with page numbers, or a message when the PDF has none), Pages (PDF thumbnails, click to jump), Notes (all highlights, notes and bookmarks of the book; click to go; right-click to delete your own), Find (full-text search; PDF results arrive page by page; click a result to jump, the match is marked for a few seconds).
- Selecting text shows a small bar: Highlight, Note, Copy, Find in book. Works in PDF too (pdf.js text layer), except scanned PDFs without a text layer.
- Notes: your highlights are gilt-underlined; an agent's notes are blue with a dotted underline and a ✦ mark in the margin; click a mark to read the note. Ctrl+Enter saves a note. B bookmarks the current page.
- Dark mode: in dark mode PDF pages are inverted so a white page does not glare (Settings → PDF → "Dark pages in dark mode").
- Atmosphere: the page is a sheet of paper on a "desk"; the atmosphere (background, particles like rain or snow, light effects) is drawn on the desk around the page, never over the text. The atmosphere menu in the reader picks a preset for this book or Default, and turns particles on or off.
- Keys in the reader: → Space PageDown next page; ← Shift+Space PageUp previous; ↑ ↓ scroll; ] [ next/previous chapter (PDF: 10 pages); Home/End chapter start/end; G go to page; T side panel; N notes; Ctrl+F find; B bookmark; L layout; D light/dark; + − 0 zoom; F11 full screen; Esc closes popups or goes back. Vim keys (setting): h/l pages, j/k scroll, g/G start/end.
- Command palette: Ctrl+Shift+P (was Ctrl+K). Lists commands and books.
- Lite mode: `vibe-reader open FILE --lite` opens one file without the library, atmosphere or animations, with an "Add to library" button. Markdown reloads on save.

## Settings page (gear button or Ctrl+,)
Sections and their controls:
- Appearance: Theme (Auto / Light / Dark), Language (Auto / English / Русский), Reduce motion.
- Reading: Books layout (Spread / One page / Scroll), live typography preview, Font (From the atmosphere / Literata / Spectral / Cormorant Garamond / Playfair Display / Onest / JetBrains Mono / System font), Size (14–30 px), Line length (22–50 em), Line spacing (1.2–2.2), Justify, Hyphenation.
- PDF: Layout (Spread / One page / Scroll), Page size (Whole page / Page width), Dark pages in dark mode.
- Library: Start in the mini library, Keep copies of added files, Group, Sort.
- Atmosphere: default preset cards (study, terminal, noir, soft, rain, storm, mountain), Particles and light effects, path of user.css for your own design.
- AI agents: what agents may see — Reading habits, Reading speed, Tastes (all off by default); how to install Skills (`vibe-reader skills install`).
- Keyboard: Vim keys toggle and the list of shortcuts.
- About: version, paths of the settings file, library folder, design overrides folder, presets folder (click to copy).

## config.toml (~/.config/vibe-reader/config.toml)
```toml
[reader]
locale = "auto"        # auto, en, ru
preset = "study"
mode = "auto"          # auto, light, dark
vim = false
reduce_motion = false
layout = "spread"      # spread, pages, scroll
particles = true

[typography]
font = "auto"          # auto (from the atmosphere), a bundled font, "system", any installed family
size = 19.0
width = 34.0
line_height = 1.6
justify = true
hyphens = true

[library]
group = "shelf"        # shelf, author, format, status, none
sort = "recent"        # recent, title, author, progress, added
start_mini = false
copy_on_import = false

[pdf]
layout = "spread"      # spread, single, scroll
fit = "page"           # page, width
invert_dark = true

[agent.consent]
habits = false
genres = false
speed = false
```
Data: library database `~/.local/share/vibe-reader/library.db`, parsed-book cache `~/.local/share/vibe-reader/cache/`, covers `~/.local/share/vibe-reader/covers/`, art `…/art/`, copied books `…/books/`. `VIBE_READER_HOME` moves everything under one folder.

## PDF security
pdf.js runs without eval, XFA forms or document scripts; no annotation layer is built, so links and actions inside a PDF do nothing. Everything stays local.

## CLI (unchanged by the redesign)
Commands as in docs/user/cli.md. PDF locators: `ch:N` is page N. Agents get PDF text extracted by the core; notes an agent leaves on a PDF appear in the window, found by their quoted text.

## Agents (unchanged)
Skills reader-cli, reader-analyze, reader-discuss, reader-atmosphere in src/cli/skills/. Agents read up to the reader's position, sign writes with --author, can undo their own writes, cannot remove books, see the reader profile only with consent.
