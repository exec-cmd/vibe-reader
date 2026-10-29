[Русская версия](ru/library.md)

# Library

The library is the main view of the window. It shows your books, groups them,
and shows the card of the book you select.

## Toolbar

| Control | What it does |
|---|---|
| Sidebar button | Shows or hides the catalog. |
| Search field | Filters books by title or author. Press Enter to open the first match. |
| Group | Groups books by shelf, author, format, status, or not at all. |
| Sort | Sorts books by recently read, title, author, progress, or date added. |
| Add books (`Ctrl+O`) | Opens a file dialog. You can also drag files onto the window. |
| Mini library (`M`) | Switches to the small window. See [Mini library](#mini-library). |
| Settings (`Ctrl+,`) | Opens the settings. See [configuration](configuration.md). |

## Catalog

The left side is the catalog. Every filter (All books, Reading, Unread, Finished
and Dropped), every shelf and every author is a drawer with a label holder. The
selected drawer is pulled out.

- Click **+** to create a shelf.
- Right-click a shelf drawer to rename or delete it. Deleting a shelf keeps its
  books.
- Drag a spine onto a shelf drawer to put the book there.

## The desk and the reading log

Above the bookcase, the desk holds up to four books with the status reading.
They stand with their covers out and show the title, authors and progress. Click
one to open it, or right-click it to open the book menu.

Next to the desk, the reading log shows the minutes you read in the last seven
days as seven small bars. Today's bar is highlighted. When you have read on two
or more days in a row, the log also shows "N days in a row". The log is hidden
when nothing has been read yet.

## Books on shelves

The bookcase is a dark case. Each group is a shelf: a shelf, an author, a format
or a status, depending on the Group dropdown. A brass plate on each shelf shows
the name of the group and the number of books in it. A lamp glow sits above each
shelf.

Books stand as bound spines on shelf boards. Each spine has a bookcloth color, a
gilt title and the author's surname. The height of a spine follows the length of
the book. The last book of a short row leans on its neighbour.

A gilt ribbon on a spine marks a book you are reading. The selected spine is
pulled up and outlined in gilt.

- Click a spine to select it. Double-click it, or press Enter, to open the book.
- Use the arrow keys to move between spines.
- Press F2 to edit the selected book.
- Press Delete to remove the selected book. The window asks you to confirm.

## Catalog card

The right side shows the catalog card of the selected book. The cover sits at
the top, and the details are on a ruled index card below it:

- **Cover.** EPUB and FB2 use their own cover. For PDF, the first page is drawn
  as the cover. You can choose any image.
- **Call number.** The format and the book's id, with the date added.
- **Title, authors and progress.** The progress bar shows the percentage read.
- **Buttons.** **Continue** or **Read** opens the book. **Edit** changes the
  details. **More** (…) opens the book menu.
- **Status.** Unread, reading, finished or dropped.
- **Atmosphere.** A preset, or Default. See [atmosphere](atmosphere.md).
- **Shelves.** Each shelf is a chip. Click × on a chip to take the book off that
  shelf. **Add to shelf** opens a menu with checkboxes and **New shelf**.
- **Facts.** Format, number of pages or chapters, length in words, date added,
  last opened date, and file path.

## Narrow windows

In a window narrower than about 1180 pixels, the card slides over the bookcase,
and only when a book is selected. Close it with the close button or with `Esc`.
In a wide window the card stays on the right. When the library opens, it shows
the last book you read.

## Book menu

Right-click a spine, or click **More** (…) in the catalog card, to open the book
menu.

| Item | What it does |
|---|---|
| Read or Continue | Opens the book. |
| Edit details | Changes the title, authors (separated by commas) and cover. |
| Shelves | Adds the book to a shelf or takes it off. |
| Status | Sets the status. |
| Atmosphere | Sets the atmosphere for this book. |
| Change cover… | Chooses another cover image. |
| Start over | Resets the reading position. Your notes stay. |
| Copy file path | Copies the path of the book file. |
| Remove from library… | Removes the book from the library. The file stays on disk unless the library kept a copy. |

## Titles and authors

Titles of PDF files come from the PDF metadata when the metadata looks real.
Otherwise they come from the file name. The library drops download-site tags,
such as "(z-library.sk, 1lib.sk)", and the number in "(1)". A trailing
"(Author Name)" becomes the author. CamelCase file names get spaces.

You can edit titles and authors at any time with **Edit details**.

## Shelves and status

A shelf is a label. A book can be on several shelves, and moving a book between
shelves does not change its file. You can also manage shelves from a terminal
with `vibe-reader shelf`.

Opening a book marks it as reading. You can set the status to finished or
dropped in the catalog card or in the book menu. Group can sort the library by
status.

## Adding many books

When you add several files, a progress card appears in the corner of the window.
The files are read in the background.

A large PDF takes a few seconds the first time. After that, the reader keeps the
parsed book in a cache, so it opens at once.

## Mini library

Press `M`, or click the mini library button in the toolbar. The window shrinks to
a small strip, 760 by 340 pixels. It shows one shelf with recently opened books
and a **Continue** line for the last book you opened.

Press `M` again, or click the same button, to return to the full window.
Opening a book from the mini library also restores the full window.

To start the app in the mini library, turn on **Start in the mini library** in
Settings → Library.

Tiling window managers (niri, sway and Hyprland) may ignore the resize. The
layout still switches to the compact one.

## Remove a book

Press Delete, or use **Remove from library…** in the book menu. The library
forgets the book, with its notes and reading history. The file stays on disk.

From a terminal, `vibe-reader remove` does the same. It asks for confirmation and
runs only in a terminal.
