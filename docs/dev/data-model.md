# Data model

All state lives in one SQLite file, `<data>/library.db` (see
[configuration](../user/configuration.md) for paths). SQLite is compiled into
the binaries (`rusqlite` with `bundled`).

## Migrations

`src/core/migrations/NNN_name.sql` files are embedded in the core and applied
in order; `PRAGMA user_version` records how many ran. Add a migration as a new
file and a new line in `MIGRATIONS` (`src/core/src/store/mod.rs`). Never edit a
released migration. A database with a newer version than the binary knows is
refused.

## Tables

| Table | Content |
|---|---|
| `books` | Path (canonical, unique), format, kind (`prose`/`tech`), title, authors (JSON array), status, spine color, character, word and per-chapter counts, file size and mtime, `copied` flag. |
| `shelves`, `shelf_books` | Virtual shelves. A book can sit on many shelves; files never move. |
| `positions` | The reader's place per book: locator, anchor quote, time. |
| `agent_cursors` | Where `read --continue` resumes, per book and agent. |
| `sessions` | Reading sessions written by the window: start and end time and locators, characters and words read. |
| `annotations` | Notes, highlights and bookmarks: span, quoted text, body, author. |
| `memory` | Facts an agent keeps about a book, by key, with an optional locator. |
| `art` | Images attached to a book: locator, placement (`page`, `chapter`, `margin`, `cover`), file in `<data>/art/`. |
| `atmospheres` | Atmosphere profiles (JSON) for a book, a chapter or a range. |
| `journal` | Every write to the four record tables above, for `undo`. |

Counts in `books` are refreshed when `Library::document` notices that the file
size or mtime changed.

## Authors, soft deletes and undo

`annotations`, `memory`, `art` and `atmospheres` are records with an `author`
(`user` for the reader, anything else is an agent) and `deleted_at`.

- Deleting a record sets `deleted_at`. Queries return only live rows.
- Changing a record retires the old row and inserts a new one. Memory and
  atmosphere writes replace the previous live row of the same key or scope.
- An author can change and delete only its own records; `user` can change all.
- Each insert or delete adds a `journal` row; an insert that replaced another
  row remembers it in `replaces`. `Library::undo(author)` reverts the newest
  journal row of that author: it retires an inserted row and revives the row it
  replaced, or revives a deleted row.

Books and shelves are not records: removing them is permanent, which is why the
CLI allows it only at an interactive terminal.

## Reader inbox

What the window sends to agents is memory by author `user` for the open book,
under the `reader.` prefix (`store::FROM_READER`):

| Key | Sent by | Note |
|---|---|---|
| `reader.place` | Remember this page | Same key replaces the live row. |
| `reader.saved.<ms>` | Send the selection or the page | Book text: `context` wraps it as untrusted. |
| `reader.message.<ms>` | Message to the agent | Free text from the reader. |

`context` lists them under "Sent by the reader from the window" (`from_reader`).
Agents cannot delete them: only the author can.
