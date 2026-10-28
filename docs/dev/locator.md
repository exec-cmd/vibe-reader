# Locators and normalized text

A locator is the one address of a place in a book that every part of vibe-reader
shares: notes, highlights, bookmarks, atmosphere ranges, art, agent memory, the
CLI and the live window.

## Format

| Form | Meaning |
|---|---|
| `ch:3` | Start of chapter 3 (same as `ch:3:0`) |
| `ch:3:120` | Chapter 3, character 120 of its normalized text |
| `ch:3:120..ch:4:0` | A span |

Chapters count from 1 in text form and from 0 in code (`Locator::chapter`).
A chapter is one spine item for EPUB, one top-level heading for Markdown with
several of them, one detected heading for TXT, and one file for HTML.

Code: `src/core/src/locator.rs`.

## Normalized text

Offsets count Unicode scalar values (Rust `char`, JavaScript code points) in
the chapter text produced by `text::prepare` (`src/core/src/text.rs`):

1. HTML is sanitized with ammonia first, so the text matches what the webview shows.
2. Outside `<pre>`, runs of ASCII whitespace collapse to one space; a line never starts with a space. NBSP is content, not whitespace.
3. Each block element (`p`, `h1`–`h6`, `li`, `div`, `pre`, table cells and so on) starts on a new line; `<br>` ends a line.
4. Inside `<pre>` text is kept verbatim.

`text::prepare` also adds `data-o="<offset>"` to every block element. The UI
turns a DOM point into an offset by taking the nearest preceding `data-o` and
replaying the same rules up to the point (`src/gui/ui/offsets.js`), so it never
needs the whole chapter text. The cases in `text::tests::CASES` define the
rules; change both implementations together.

## PDF locators

For PDF the chapter is the page: `ch:N` is page N. The offset counts characters
of that page's text as pdf.js extracts it, normalized by `normalize()` in
`offsets.js` (a line break after each text item that ends a line). The text
layer is the page's one block, stamped `data-o="0"`. A page without a text
layer (a scanned PDF) has no offsets, so it cannot take selections or notes.
Notes that the CLI leaves on a PDF are found in the window by their quote, not
by offset.

## Anchor quotes

Each stored locator keeps the next 40 characters of text as a quote.
`Locator::resolve` re-finds the place after the book file changed: an exact
match first, then the occurrence of the quote closest to the old offset in the
same chapter, then in any chapter, then the old locator clamped to the book.

## Spoiler boundary

The reader's position (`positions` table) is the limit for agent reads.
`excerpt::chunk` and `excerpt::search` take an optional limit, and the CLI
passes the position unless `--allow-spoilers` is given or the book is finished.
