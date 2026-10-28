# Reading

## The window

The window has three states:

- **Shelf**: recent books as spines and a search field. This is where the app starts.
- **Library**: every book, grouped by your shelves or by author. Press `F` or **Library**.
- **Reading**: the text and a thin progress line. Everything else hides until you ask for it.

A spine's color comes from the book, its height from the book's length, and the
lighter fill from the bottom shows your progress. Hover or focus a spine to see
its card with a typographic cover, status and progress.

## Shelves and status

Shelves are labels: a book can sit on several shelves, and moving it between
shelves never touches the file. Manage them with `vibe-reader shelf`.

Opening a book marks it as **reading**. The card has buttons to mark it
**finished** or **dropped**. Status is kept for statistics; the library is not
grouped by it.

## Pages and scroll

Prose opens in pages; on a wide window you see a two-page spread. Technical
books and Markdown open in a continuous scroll. Press `L` to switch.

Technical books get:

- highlighted code with a **Copy** button,
- formulas (TeX in Markdown, MathML in EPUB),
- tables that scroll sideways when they are wide,
- images that open full size on click.

## Notes, highlights, bookmarks

Select text to get a small toolbar: **Highlight**, **Note**, **Copy**. A note
opens an editor; `Ctrl+Enter` saves it. `B` bookmarks the current page.

Your highlights are underlined with a solid line. Notes and highlights written
by an AI agent use a dotted line and a ✦ mark in the margin; click the mark to
read the note. Open all notes with `N`, and export them with
`vibe-reader export notes`.

## Typography

`,` opens settings: font, size, line length, line spacing, justification,
hyphenation, light or dark appearance, language, Vim keys and reduced motion.
Changes apply at once and are saved to `config.toml`.

Bundled fonts (all with Cyrillic): Literata, Spectral, Cormorant Garamond,
Playfair Display, Onest, JetBrains Mono. You can also pick the system font, or
set any installed family in `config.toml`.
