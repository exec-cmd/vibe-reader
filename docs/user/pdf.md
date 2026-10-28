[Русская версия](ru/pdf.md)

# PDF

PDF books open in the same reader window as other books. This page describes
what is specific to PDF.

## Layouts

| Layout | What you see |
|---|---|
| Spread | Two pages side by side. The first page stands alone, as in a printed book. In a tall, narrow window it shows one page. |
| One page | One page at a time. |
| Scroll | All pages in one continuous column. |

Choose the layout with the layout button in the toolbar, or press `L` to cycle
through the layouts. The default comes from Settings → PDF.

## Zoom

The zoom controls are in the toolbar: zoom out, a zoom menu, and zoom in. The
menu has **Whole page**, **Page width** and a percentage from 50 to 300 %.

You can also zoom with:

- Ctrl+wheel;
- `Ctrl+=` and `Ctrl+-`, or `+` and `-`;
- `0` to reset the zoom.

A zoomed page scrolls before the reader turns to the next page.

The default fit comes from Settings → PDF → Page size.

## Outline

The **Contents** tab shows the PDF's own bookmarks, with their page numbers. If
the PDF has no bookmarks, the tab says so. In that case, use the **Pages** tab or
the page number field in the toolbar.

## Thumbnails

The **Pages** tab shows a thumbnail of every page. Click a thumbnail to jump to
that page.

## Selecting text

Select text to see the small bar with **Highlight**, **Note**, **Copy** and
**Find in book**. Selection works through the text layer of the PDF. Scanned PDFs
without a text layer have no text to select.

## Notes and highlights

Highlights, notes and bookmarks work as in other books. See
[reading](reading.md).

Notes that an AI agent leaves on a PDF appear in the window. The window finds
each note by the text it quotes.

## Search

Use the **Find** tab, or press `Ctrl+F`. For PDF, the results arrive page by
page while the search runs. Click a result to jump to it. The match stays marked
for a few seconds.

## Dark pages

In dark mode, PDF pages are inverted, so a white page does not glare at night.
To keep the original colors, turn off **Dark pages in dark mode** in
Settings → PDF, or set `invert_dark = false` under `[pdf]` in `config.toml`.

## Page numbers in commands

In the command line, a PDF locator `ch:N` means page N. See [CLI](cli.md).
Agents get the text of a PDF that the core extracts.

## Security

PDF.js runs without `eval`, without XFA forms and without document scripts.
vibe-reader does not build an annotation layer, so links and actions inside a
PDF do nothing. Everything stays on your computer.
