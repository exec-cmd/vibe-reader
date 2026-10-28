//! The library database: books, shelves, reading state and authored records.

mod reading;
mod records;

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, bail};
use rusqlite::{Connection, Row, params};
use serde::Serialize;

pub use reading::{Position, Session};
pub use records::{Annotation, AnnotationKind, Art, Atmosphere, MemoryEntry, Placement, Scope, Undone};

use crate::format::{self, Document, Format, Kind};
use crate::{Locator, Paths};

const MIGRATIONS: &[&str] = &[include_str!("../../migrations/001_init.sql")];

/// Spine colors for books without an atmosphere; picked by a hash of the title.
const SPINE_COLORS: &[&str] = &[
    "#7a3e30", "#2e4052", "#b08040", "#4f6146", "#6b3f5e", "#8c5a3c", "#3c5a6b", "#9a4a3a", "#5a5240", "#384a3a",
];

pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs() as i64)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Unread,
    Reading,
    Finished,
    Dropped,
}

impl Status {
    pub fn as_str(self) -> &'static str {
        match self {
            Status::Unread => "unread",
            Status::Reading => "reading",
            Status::Finished => "finished",
            Status::Dropped => "dropped",
        }
    }

    pub fn parse(s: &str) -> Result<Self> {
        Ok(match s {
            "unread" => Status::Unread,
            "reading" => Status::Reading,
            "finished" => Status::Finished,
            "dropped" => Status::Dropped,
            _ => bail!("status must be reading, finished or dropped"),
        })
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Book {
    pub id: i64,
    pub path: PathBuf,
    pub format: Format,
    pub kind: Kind,
    pub title: String,
    pub authors: Vec<String>,
    pub language: Option<String>,
    pub status: Status,
    pub color: String,
    pub chars: usize,
    pub words: usize,
    pub chapter_chars: Vec<usize>,
    pub copied: bool,
    pub added_at: i64,
    pub opened_at: Option<i64>,
    pub shelves: Vec<String>,
    pub position: Option<Locator>,
    /// Share of the book before the reader's position, 0.0 to 1.0.
    pub progress: f64,
}

impl Book {
    pub fn chapters(&self) -> usize {
        self.chapter_chars.len()
    }

    /// Share of the book before `at`.
    pub fn progress_at(&self, at: Locator) -> f64 {
        if self.chars == 0 {
            return 0.0;
        }
        let before: usize = self.chapter_chars.iter().take(at.chapter).sum();
        let here = self.chapter_chars.get(at.chapter).map_or(0, |len| at.offset.min(*len));
        ((before + here) as f64 / self.chars as f64).min(1.0)
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Shelf {
    pub id: i64,
    pub name: String,
    pub books: usize,
}

pub struct Library {
    conn: Connection,
    paths: Paths,
}

const BOOK_COLUMNS: &str = "b.id, b.path, b.format, b.kind, b.title, b.authors, b.language, b.status, b.color, b.chars, \
     b.words, b.chapter_chars, b.copied, b.added_at, b.opened_at, p.locator, \
     (SELECT json_group_array(s.name) FROM shelf_books sb JOIN shelves s ON s.id = sb.shelf_id WHERE sb.book_id = b.id)";

impl Library {
    /// Opens (and creates or migrates) the library at `paths`.
    pub fn open(paths: &Paths) -> Result<Self> {
        fs::create_dir_all(&paths.data).with_context(|| format!("cannot create {}", paths.data.display()))?;
        let conn = Connection::open(paths.database())?;
        conn.pragma_update(None, "foreign_keys", true)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        let library = Self {
            conn,
            paths: paths.clone(),
        };
        library.migrate()?;
        Ok(library)
    }

    fn migrate(&self) -> Result<()> {
        let version: usize = self.conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
        if version > MIGRATIONS.len() {
            bail!("the library was created by a newer vibe-reader (schema {version})");
        }
        for (i, sql) in MIGRATIONS.iter().enumerate().skip(version) {
            let tx = self.conn.unchecked_transaction()?;
            tx.execute_batch(sql)?;
            tx.pragma_update(None, "user_version", i + 1)?;
            tx.commit()?;
        }
        Ok(())
    }

    pub fn schema_version(&self) -> Result<usize> {
        Ok(self.conn.pragma_query_value(None, "user_version", |r| r.get(0))?)
    }

    pub fn paths(&self) -> &Paths {
        &self.paths
    }

    // ---- books ----

    /// Adds a book by path, or returns the existing entry for the same file. `copy` stores a copy in the data folder.
    pub fn add(&self, file: &Path, copy: bool) -> Result<(Book, bool)> {
        let mut file = fs::canonicalize(file).with_context(|| format!("no such file: {}", file.display()))?;
        if let Some(book) = self.book_by_path(&file)? {
            return Ok((book, false));
        }
        let doc = format::open(&file)?;
        if copy {
            let target = self.unique_copy_path(&file)?;
            fs::copy(&file, &target)?;
            file = target;
        }
        let (size, mtime) = file_stamp(&file)?;
        let color = SPINE_COLORS[doc
            .meta
            .title
            .bytes()
            .fold(0usize, |h, b| h.wrapping_mul(31).wrapping_add(b as usize))
            % SPINE_COLORS.len()];
        self.conn.execute(
            "INSERT INTO books (path, format, kind, title, authors, language, color, chars, words, chapter_chars, file_size, file_mtime, copied, added_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                file.to_string_lossy(),
                doc.format.as_str(),
                doc.kind.as_str(),
                doc.meta.title,
                serde_json::to_string(&doc.meta.authors)?,
                doc.meta.language,
                color,
                doc.chapter_chars().iter().sum::<usize>(),
                doc.words(),
                serde_json::to_string(&doc.chapter_chars())?,
                size,
                mtime,
                copy,
                now(),
            ],
        )?;
        Ok((self.book(self.conn.last_insert_rowid())?, true))
    }

    fn unique_copy_path(&self, file: &Path) -> Result<PathBuf> {
        let dir = self.paths.data.join("books");
        fs::create_dir_all(&dir)?;
        let name = file.file_name().context("file has no name")?;
        let mut target = dir.join(name);
        let mut n = 1;
        while target.exists() {
            target = dir.join(format!("{n}-{}", name.to_string_lossy()));
            n += 1;
        }
        Ok(target)
    }

    /// Removes a book with its notes and reading history. A copied file is deleted too.
    pub fn remove(&self, id: i64) -> Result<Book> {
        let book = self.book(id)?;
        self.conn.execute("DELETE FROM books WHERE id = ?1", [id])?;
        if book.copied {
            let _ = fs::remove_file(&book.path);
        }
        Ok(book)
    }

    pub fn book(&self, id: i64) -> Result<Book> {
        self.query_books("WHERE b.id = ?1", params![id])?
            .pop()
            .with_context(|| format!("no book with id {id}"))
    }

    fn book_by_path(&self, path: &Path) -> Result<Option<Book>> {
        Ok(self
            .query_books("WHERE b.path = ?1", params![path.to_string_lossy()])?
            .pop())
    }

    /// All books, most recently opened first.
    pub fn books(&self) -> Result<Vec<Book>> {
        self.query_books("ORDER BY coalesce(b.opened_at, 0) DESC, b.added_at DESC", [])
    }

    pub fn shelf_books(&self, shelf: &str) -> Result<Vec<Book>> {
        self.query_books(
            "JOIN shelf_books sb ON sb.book_id = b.id JOIN shelves s ON s.id = sb.shelf_id WHERE s.name = ?1 ORDER BY b.title",
            params![shelf],
        )
    }

    /// Finds a book by id, exact path, or a unique case-insensitive part of its title.
    pub fn find(&self, query: &str) -> Result<Book> {
        if let Ok(id) = query.parse::<i64>() {
            return self.book(id);
        }
        if let Ok(path) = fs::canonicalize(query)
            && let Some(book) = self.book_by_path(&path)?
        {
            return Ok(book);
        }
        let needle = query.to_lowercase();
        let mut found: Vec<Book> = self
            .books()?
            .into_iter()
            .filter(|b| b.title.to_lowercase().contains(&needle))
            .collect();
        if let Some(exact) = found.iter().position(|b| b.title.to_lowercase() == needle) {
            return Ok(found.swap_remove(exact));
        }
        match found.len() {
            0 => bail!("no book matches \"{query}\""),
            1 => Ok(found.remove(0)),
            _ => {
                let list: Vec<String> = found.iter().map(|b| format!("{} ({})", b.title, b.id)).collect();
                bail!("\"{query}\" matches several books: {}; use an id", list.join(", "))
            }
        }
    }

    fn query_books(&self, tail: &str, args: impl rusqlite::Params) -> Result<Vec<Book>> {
        let sql = format!("SELECT {BOOK_COLUMNS} FROM books b LEFT JOIN positions p ON p.book_id = b.id {tail}");
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(args, book_from_row)?;
        rows.map(|r| Ok(r?)).collect()
    }

    /// Parses the book file, refreshing stored counts when the file changed since it was added.
    pub fn document(&self, book: &Book) -> Result<Document> {
        let doc = format::open(&book.path)?;
        let (size, mtime) = file_stamp(&book.path)?;
        let stored: (i64, i64) = self.conn.query_row(
            "SELECT file_size, file_mtime FROM books WHERE id = ?1",
            [book.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        if stored != (size, mtime) {
            self.conn.execute(
                "UPDATE books SET chars = ?2, words = ?3, chapter_chars = ?4, file_size = ?5, file_mtime = ?6 WHERE id = ?1",
                params![
                    book.id,
                    doc.chapter_chars().iter().sum::<usize>(),
                    doc.words(),
                    serde_json::to_string(&doc.chapter_chars())?,
                    size,
                    mtime
                ],
            )?;
        }
        Ok(doc)
    }

    pub fn set_status(&self, id: i64, status: Status) -> Result<()> {
        self.conn.execute(
            "UPDATE books SET status = ?2 WHERE id = ?1",
            params![id, status.as_str()],
        )?;
        Ok(())
    }

    /// Marks a book as just opened; an unread book becomes `reading`.
    pub fn touch(&self, id: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE books SET opened_at = ?2, status = CASE status WHEN 'unread' THEN 'reading' ELSE status END WHERE id = ?1",
            params![id, now()],
        )?;
        Ok(())
    }

    /// The book the reader opened or moved in last.
    pub fn current(&self) -> Result<Option<Book>> {
        Ok(self
            .query_books(
                "WHERE b.opened_at IS NOT NULL OR p.updated_at IS NOT NULL
                 ORDER BY max(coalesce(b.opened_at, 0), coalesce(p.updated_at, 0)) DESC LIMIT 1",
                [],
            )?
            .pop())
    }

    // ---- shelves ----

    pub fn shelves(&self) -> Result<Vec<Shelf>> {
        let mut stmt = self.conn.prepare(
            "SELECT s.id, s.name, count(sb.book_id) FROM shelves s LEFT JOIN shelf_books sb ON sb.shelf_id = s.id GROUP BY s.id ORDER BY s.name",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(Shelf {
                id: r.get(0)?,
                name: r.get(1)?,
                books: r.get(2)?,
            })
        })?;
        rows.map(|r| Ok(r?)).collect()
    }

    pub fn create_shelf(&self, name: &str) -> Result<()> {
        let name = name.trim();
        if name.is_empty() {
            bail!("shelf name is empty");
        }
        self.conn
            .execute(
                "INSERT INTO shelves (name, created_at) VALUES (?1, ?2)",
                params![name, now()],
            )
            .with_context(|| format!("shelf \"{name}\" already exists"))?;
        Ok(())
    }

    pub fn rename_shelf(&self, from: &str, to: &str) -> Result<()> {
        let n = self
            .conn
            .execute("UPDATE shelves SET name = ?2 WHERE name = ?1", params![from, to.trim()])?;
        if n == 0 {
            bail!("no shelf \"{from}\"");
        }
        Ok(())
    }

    /// Deletes the shelf only; its books stay in the library.
    pub fn delete_shelf(&self, name: &str) -> Result<()> {
        if self.conn.execute("DELETE FROM shelves WHERE name = ?1", [name])? == 0 {
            bail!("no shelf \"{name}\"");
        }
        Ok(())
    }

    /// Puts a book on a shelf, creating the shelf when needed.
    pub fn shelve(&self, shelf: &str, book: i64) -> Result<()> {
        self.conn.execute(
            "INSERT OR IGNORE INTO shelves (name, created_at) VALUES (?1, ?2)",
            params![shelf.trim(), now()],
        )?;
        self.conn.execute(
            "INSERT OR IGNORE INTO shelf_books (shelf_id, book_id) SELECT id, ?2 FROM shelves WHERE name = ?1",
            params![shelf.trim(), book],
        )?;
        Ok(())
    }

    pub fn unshelve(&self, shelf: &str, book: i64) -> Result<()> {
        self.conn.execute(
            "DELETE FROM shelf_books WHERE book_id = ?2 AND shelf_id = (SELECT id FROM shelves WHERE name = ?1)",
            params![shelf, book],
        )?;
        Ok(())
    }

    pub(crate) fn conn(&self) -> &Connection {
        &self.conn
    }
}

fn book_from_row(r: &Row) -> rusqlite::Result<Book> {
    let json = |i: usize| -> rusqlite::Result<String> { r.get(i) };
    let parse_err = |i: usize, e: anyhow::Error| {
        rusqlite::Error::FromSqlConversionFailure(i, rusqlite::types::Type::Text, e.into())
    };
    let format: String = r.get(2)?;
    let kind: String = r.get(3)?;
    let status: String = r.get(7)?;
    let position: Option<String> = r.get(15)?;
    let position = position.and_then(|p| p.parse::<Locator>().ok());
    let mut book = Book {
        id: r.get(0)?,
        path: PathBuf::from(r.get::<_, String>(1)?),
        format: format.parse().map_err(|e| parse_err(2, e))?,
        kind: if kind == "tech" { Kind::Tech } else { Kind::Prose },
        title: r.get(4)?,
        authors: serde_json::from_str(&json(5)?).unwrap_or_default(),
        language: r.get(6)?,
        status: Status::parse(&status).map_err(|e| parse_err(7, e))?,
        color: r.get(8)?,
        chars: r.get(9)?,
        words: r.get(10)?,
        chapter_chars: serde_json::from_str(&json(11)?).unwrap_or_default(),
        copied: r.get(12)?,
        added_at: r.get(13)?,
        opened_at: r.get(14)?,
        shelves: serde_json::from_str(&json(16)?).unwrap_or_default(),
        position,
        progress: 0.0,
    };
    book.progress = position.map_or(0.0, |p| book.progress_at(p));
    if book.status == Status::Finished {
        book.progress = 1.0;
    }
    Ok(book)
}

fn file_stamp(path: &Path) -> Result<(i64, i64)> {
    let meta = fs::metadata(path).with_context(|| format!("cannot read {}", path.display()))?;
    let mtime = meta
        .modified()?
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs() as i64);
    Ok((meta.len() as i64, mtime))
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub fn library() -> (tempfile::TempDir, Library, Book) {
        let dir = tempfile::tempdir().unwrap();
        let paths = Paths::under(dir.path().join("home"));
        let library = Library::open(&paths).unwrap();
        let file = dir.path().join("book.epub");
        crate::format::epub::tests::sample(&file);
        let (book, new) = library.add(&file, false).unwrap();
        assert!(new);
        (dir, library, book)
    }

    #[test]
    fn adds_finds_and_shelves() {
        let (dir, library, book) = library();
        assert_eq!(library.add(&dir.path().join("book.epub"), false).unwrap().0.id, book.id);
        assert_eq!(book.chapters(), 2);
        assert_eq!(library.find("наказание").unwrap().id, book.id);
        assert_eq!(library.find(&book.id.to_string()).unwrap().id, book.id);
        assert!(library.find("нет такой").is_err());

        library.shelve("Классика", book.id).unwrap();
        assert_eq!(library.book(book.id).unwrap().shelves, ["Классика"]);
        library.rename_shelf("Классика", "Русская классика").unwrap();
        assert_eq!(library.shelf_books("Русская классика").unwrap().len(), 1);
        library.delete_shelf("Русская классика").unwrap();
        assert!(library.book(book.id).unwrap().shelves.is_empty());

        library.touch(book.id).unwrap();
        assert_eq!(library.current().unwrap().unwrap().status, Status::Reading);
        library.remove(book.id).unwrap();
        assert!(library.books().unwrap().is_empty());
    }

    #[test]
    fn copies_files() {
        let (dir, library, _) = library();
        let md = dir.path().join("notes.md");
        fs::write(&md, "# Notes\n\ntext").unwrap();
        let (book, _) = library.add(&md, true).unwrap();
        assert!(book.copied && book.path.starts_with(&library.paths().data));
        library.remove(book.id).unwrap();
        assert!(!book.path.exists());
    }
}
