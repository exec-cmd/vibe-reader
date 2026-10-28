[Русская версия](ru/reading.md)

# Reading

## The reader

Open a book to switch the window to the reader. The reader has these controls:

| Control | What it does |
|---|---|
| Back to library (`Esc`) | Returns to the library. |
| Side panel (`T`) | Shows or hides the side panel. |
| Title, author and chapter | Shows where you are. |
| Pager | Previous page, a page number field, the total number of pages, and next page. Type a number and press Enter to go to that page. |
| Zoom | PDF only. See [PDF](pdf.md). |
| Layout (`L`) | Chooses the layout. |
| Find (`Ctrl+F`) | Searches the book. The results are in the Find tab of the side panel. |
| Atmosphere (sparkle icon) | Picks the atmosphere for this book. |
| Light or dark (`D`) | Switches the color mode. |
| Full screen (`F11`) | Hides the toolbar. The toolbar comes back when the mouse moves to the top. |
| More (…) | Bookmark this page, go to page, find in book, and reading settings. |

## Layouts

For EPUB, FB2, Markdown and TXT there are three layouts:

- **Spread**: two facing pages, bound in the middle. This layout needs a wide window.
- **One page**: one full-height sheet.
- **Scroll**: a continuous text.

The default comes from Settings → Reading. Technical books open on one page when
you choose Spread. Press `L` to cycle through the layouts.

PDF has its own layouts. See [PDF](pdf.md).

Technical books get:

- highlighted code with a **Copy** button;
- formulas (TeX in Markdown, MathML in EPUB);
- tables that scroll sideways when they are wide;
- images that open at full size when you click them.

## Side panel

Press `T` to open the side panel. It has these tabs:

- **Contents** lists the chapters, with nested chapters shown inside their
  parents. For PDF, it shows the PDF's own bookmarks. See [PDF](pdf.md).
- **Pages** shows page thumbnails. Click one to jump to it. This tab is for PDF.
- **Notes** lists all highlights, notes and bookmarks in the book. Click an
  item to go to it. Right-click an item to delete it, if you wrote it.
- **Find** runs a full-text search. Click a result to jump to it. The match
  stays marked for a few seconds.

## Notes, highlights and bookmarks

Select text to see a small bar with **Highlight**, **Note**, **Copy** and **Find
in book**. Click **Note** to write a note. Press `Ctrl+Enter` to save it.

Press `B` to bookmark the current page. Press `N` to open the notes.

- Your highlights are underlined with a gilt line.
- Notes and highlights written by an AI agent are blue, with a dotted underline.
  They also have a ✦ mark in the margin. Click the mark to read the note.

Export all notes, highlights and bookmarks from a terminal with
`vibe-reader export notes`.

## Typography

Open Settings (`Ctrl+,`) and go to Reading. You can change the books layout,
the font, the size, the line length, the line spacing, justification and
hyphenation. The page shows a live preview. Changes apply at once and are saved
to `config.toml`. See [configuration](configuration.md).

Bundled fonts (all with Cyrillic): Literata, Spectral, Cormorant Garamond,
Playfair Display, Onest and JetBrains Mono. You can also choose the system font,
or set any installed font family in `config.toml`.

## Atmosphere

The atmosphere menu in the reader sets the preset for the open book, or Default.
It also turns particles on or off. The atmosphere is drawn on the desk around the
page, never over the text. See [atmosphere](atmosphere.md).
