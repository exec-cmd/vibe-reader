[Русская версия](ru/reading.md)

# Reading

## The reader

Open a book to switch the window to the reader. The window is the book: there is
no toolbar on top. The chapter title (or the book title, for PDF) is printed
above the page as a running head. The page number is printed below it as a
folio: "3 / 10", "121 / 530", or a percent in the scroll layout. Click the folio
to type a page number.

The controls are in the dock, a strip that floats at the bottom of the window:

| Control | What it does |
|---|---|
| Back to library (`Esc`) | Returns to the library. |
| Side panel (`T`) | Shows or hides the side panel. |
| Pager | Previous page, a page number field, the total number of pages, and next page. Type a number and press Enter to go to that page. |
| Zoom | PDF only. Shows the zoom in percent. See [PDF](pdf.md). |
| Layout (`L`) | Chooses the layout. |
| Find (`Ctrl+F`) | Searches the book. The results are in the Find tab of the side panel. |
| Translator (`Y`) | Opens the translator card. See [translator](translator.md). |
| For the agent (✦) | Remembers this page, sends a passage or this page, or writes a message to the agent. See [agents](agents.md). |
| Atmosphere (sparkle icon) | Picks the atmosphere for this book. |
| Sound (`S`) | Turns the ambient sound on or off. See [sound](sound.md). |
| Light or dark (`D`) | Switches the color mode. |
| Full screen (`F11`) | Switches the window to full screen. |
| More (…) | Bookmark this page, go to page, find in book, translate this page, and reading settings. |

The dock hides after about 2.6 seconds without mouse movement, and the cursor
hides with it. It comes back when the mouse moves. To keep it visible, turn off
**Hide controls while reading** in Settings → Reading.

## Page edges

A stack of page edges runs along both sides of the sheet. The left edge grows as
you read, and the right edge shrinks. PDF pages and spreads show page edges too.

## Turning pages

Settings → Reading → **Page turn** chooses the animation:

- **Leaf** (the default): a sheet swings over the spine.
- **Slide**: the columns slide.
- **None**: the page changes without motion.

Reduced motion turns the animations off.

## Chapter titles

When you reach a new chapter, its title appears over the desk for about a second.

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

Press `T` to open the side panel. It is a drawer over the desk, so the page does
not move. Press `Esc` to close it. It has these tabs:

- **Contents** lists the chapters, with nested chapters shown inside their
  parents. For PDF, it shows the PDF's own bookmarks. See [PDF](pdf.md).
- **Pages** shows page thumbnails. Click one to jump to it. This tab is for PDF.
- **Notes** lists all highlights, notes and bookmarks in the book. Click an
  item to go to it. Right-click an item to delete it, if you wrote it.
- **Find** runs a full-text search. Click a result to jump to it. The match
  stays marked for a few seconds.
- **Agent** lists what you sent to your agent from the window and your messages,
  newest first. Click an item to go to its place. Use its delete button to remove
  it. See [agents](agents.md).

## Notes, highlights and bookmarks

Select text to see a small bar with **Highlight**, **Note**, **Translate**,
**Send the selection**, **Copy** and **Find in book**. Click **Note** to write a
note. Press `Ctrl+Enter` to save it.

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
