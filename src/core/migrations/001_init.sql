-- Times are Unix seconds. Locators are strings like ch:3:120 (see docs/dev/locator.md).

CREATE TABLE books (
    id            INTEGER PRIMARY KEY,
    path          TEXT NOT NULL UNIQUE,
    format        TEXT NOT NULL,
    kind          TEXT NOT NULL,
    title         TEXT NOT NULL,
    authors       TEXT NOT NULL DEFAULT '[]',
    language      TEXT,
    status        TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'reading', 'finished', 'dropped')),
    color         TEXT NOT NULL,
    chars         INTEGER NOT NULL,
    words         INTEGER NOT NULL,
    chapter_chars TEXT NOT NULL,
    file_size     INTEGER NOT NULL,
    file_mtime    INTEGER NOT NULL,
    copied        INTEGER NOT NULL DEFAULT 0,
    added_at      INTEGER NOT NULL,
    opened_at     INTEGER
);

CREATE TABLE shelves (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
);

CREATE TABLE shelf_books (
    shelf_id INTEGER NOT NULL REFERENCES shelves (id) ON DELETE CASCADE,
    book_id  INTEGER NOT NULL REFERENCES books (id) ON DELETE CASCADE,
    PRIMARY KEY (shelf_id, book_id)
);

-- The reader's place in each book.
CREATE TABLE positions (
    book_id    INTEGER PRIMARY KEY REFERENCES books (id) ON DELETE CASCADE,
    locator    TEXT NOT NULL,
    quote      TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
);

-- Where `read --continue` resumes, per agent, separate from the reader's position.
CREATE TABLE agent_cursors (
    book_id    INTEGER NOT NULL REFERENCES books (id) ON DELETE CASCADE,
    agent      TEXT NOT NULL,
    locator    TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (book_id, agent)
);

CREATE TABLE sessions (
    id            INTEGER PRIMARY KEY,
    book_id       INTEGER NOT NULL REFERENCES books (id) ON DELETE CASCADE,
    started_at    INTEGER NOT NULL,
    ended_at      INTEGER NOT NULL,
    start_locator TEXT NOT NULL,
    end_locator   TEXT NOT NULL,
    chars         INTEGER NOT NULL DEFAULT 0,
    words         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX sessions_by_time ON sessions (started_at);

-- Records below carry an author ('user' or an agent name) and are soft-deleted.
CREATE TABLE annotations (
    id         INTEGER PRIMARY KEY,
    book_id    INTEGER NOT NULL REFERENCES books (id) ON DELETE CASCADE,
    kind       TEXT NOT NULL CHECK (kind IN ('note', 'highlight', 'bookmark')),
    start      TEXT NOT NULL,
    end        TEXT NOT NULL,
    quote      TEXT NOT NULL DEFAULT '',
    body       TEXT NOT NULL DEFAULT '',
    author     TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
);
CREATE INDEX annotations_by_book ON annotations (book_id);

CREATE TABLE memory (
    id         INTEGER PRIMARY KEY,
    book_id    INTEGER NOT NULL REFERENCES books (id) ON DELETE CASCADE,
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    locator    TEXT,
    author     TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
);
CREATE INDEX memory_by_book ON memory (book_id, key);

CREATE TABLE art (
    id         INTEGER PRIMARY KEY,
    book_id    INTEGER NOT NULL REFERENCES books (id) ON DELETE CASCADE,
    locator    TEXT NOT NULL,
    placement  TEXT NOT NULL CHECK (placement IN ('page', 'chapter', 'margin', 'cover')),
    file       TEXT NOT NULL,
    mime       TEXT NOT NULL,
    author     TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
);

CREATE TABLE atmospheres (
    id         INTEGER PRIMARY KEY,
    book_id    INTEGER NOT NULL REFERENCES books (id) ON DELETE CASCADE,
    scope      TEXT NOT NULL CHECK (scope IN ('book', 'chapter', 'range')),
    start      TEXT,
    end        TEXT,
    profile    TEXT NOT NULL,
    author     TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
);

-- Every write to the four record tables, newest last; `undo` reverts the newest entry of an author.
CREATE TABLE journal (
    id       INTEGER PRIMARY KEY,
    author   TEXT NOT NULL,
    at       INTEGER NOT NULL,
    tbl      TEXT NOT NULL,
    row_id   INTEGER NOT NULL,
    action   TEXT NOT NULL CHECK (action IN ('insert', 'delete')),
    replaces INTEGER
);
