//! Authored records: annotations, agent memory, art and atmospheres, with a journal for undo.
//!
//! Rules: records are soft-deleted; edits replace a row with a new one; an author can only
//! change or delete its own records, except `user`, who can change everything.

use anyhow::{Result, bail};
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};

use super::{Library, now};
use crate::{Locator, Span};

/// The author name of the person reading; every other author is an agent.
pub const USER: &str = "user";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AnnotationKind {
    Note,
    Highlight,
    Bookmark,
}

impl AnnotationKind {
    pub fn as_str(self) -> &'static str {
        match self {
            AnnotationKind::Note => "note",
            AnnotationKind::Highlight => "highlight",
            AnnotationKind::Bookmark => "bookmark",
        }
    }

    fn parse(s: &str) -> Self {
        match s {
            "highlight" => AnnotationKind::Highlight,
            "bookmark" => AnnotationKind::Bookmark,
            _ => AnnotationKind::Note,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Annotation {
    pub id: i64,
    pub book_id: i64,
    pub kind: AnnotationKind,
    pub start: Locator,
    pub end: Locator,
    pub quote: String,
    pub body: String,
    pub author: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct MemoryEntry {
    pub id: i64,
    pub key: String,
    pub value: String,
    pub locator: Option<Locator>,
    pub author: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Placement {
    /// A full page with the image, inserted at the locator.
    Page,
    /// At the start of the chapter.
    Chapter,
    /// In the margin next to the locator.
    Margin,
    /// The book cover on the shelf.
    Cover,
}

impl Placement {
    pub fn as_str(self) -> &'static str {
        match self {
            Placement::Page => "page",
            Placement::Chapter => "chapter",
            Placement::Margin => "margin",
            Placement::Cover => "cover",
        }
    }

    pub fn parse(s: &str) -> Result<Self> {
        Ok(match s {
            "page" => Placement::Page,
            "chapter" => Placement::Chapter,
            "margin" => Placement::Margin,
            "cover" => Placement::Cover,
            _ => bail!("placement must be page, chapter, margin or cover"),
        })
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Art {
    pub id: i64,
    pub book_id: i64,
    pub locator: Locator,
    pub placement: Placement,
    /// File name inside the art folder.
    pub file: String,
    pub mime: String,
    pub author: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    Book,
    Chapter,
    Range,
}

impl Scope {
    pub fn as_str(self) -> &'static str {
        match self {
            Scope::Book => "book",
            Scope::Chapter => "chapter",
            Scope::Range => "range",
        }
    }

    fn parse(s: &str) -> Self {
        match s {
            "chapter" => Scope::Chapter,
            "range" => Scope::Range,
            _ => Scope::Book,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Atmosphere {
    pub id: i64,
    pub book_id: i64,
    pub scope: Scope,
    /// Chapter start for `chapter`, the span for `range`, none for `book`.
    pub span: Option<Span>,
    /// The profile as JSON, validated before it was stored.
    pub profile: serde_json::Value,
    pub author: String,
    pub created_at: i64,
}

/// What `undo` reverted.
#[derive(Debug, Clone, Serialize)]
pub struct Undone {
    pub table: String,
    pub id: i64,
    /// `insert` was removed, `delete` was restored.
    pub action: String,
}

const TABLES: &[&str] = &["annotations", "memory", "art", "atmospheres"];

impl Library {
    fn log(&self, author: &str, table: &str, row: i64, action: &str, replaces: Option<i64>) -> Result<()> {
        self.conn().execute(
            "INSERT INTO journal (author, at, tbl, row_id, action, replaces) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![author, now(), table, row, action, replaces],
        )?;
        Ok(())
    }

    /// Soft-deletes a live row after checking that `author` may change it.
    fn retire(&self, table: &str, id: i64, author: &str) -> Result<()> {
        debug_assert!(TABLES.contains(&table));
        let owner: Option<String> = self
            .conn()
            .query_row(
                &format!("SELECT author FROM {table} WHERE id = ?1 AND deleted_at IS NULL"),
                [id],
                |r| r.get(0),
            )
            .optional()?;
        match owner {
            None => bail!("no {} with id {id}", singular(table)),
            Some(owner) if owner != author && author != USER => {
                bail!(
                    "{} {id} belongs to {owner}; only its author or the reader can change it",
                    singular(table)
                )
            }
            Some(_) => {}
        }
        self.conn().execute(
            &format!("UPDATE {table} SET deleted_at = ?2 WHERE id = ?1"),
            params![id, now()],
        )?;
        Ok(())
    }

    /// Reverts the newest journal entry written by `author`.
    pub fn undo(&self, author: &str) -> Result<Option<Undone>> {
        let entry = self
            .conn()
            .query_row(
                "SELECT id, tbl, row_id, action, replaces FROM journal WHERE author = ?1 ORDER BY id DESC LIMIT 1",
                [author],
                |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, i64>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, Option<i64>>(4)?,
                    ))
                },
            )
            .optional()?;
        let Some((journal_id, table, row, action, replaces)) = entry else {
            return Ok(None);
        };
        if !TABLES.contains(&table.as_str()) {
            bail!("corrupt journal entry {journal_id}");
        }
        let tx = self.conn().unchecked_transaction()?;
        if action == "insert" {
            tx.execute(
                &format!("UPDATE {table} SET deleted_at = ?2 WHERE id = ?1"),
                params![row, now()],
            )?;
            if let Some(old) = replaces {
                tx.execute(&format!("UPDATE {table} SET deleted_at = NULL WHERE id = ?1"), [old])?;
            }
        } else {
            tx.execute(&format!("UPDATE {table} SET deleted_at = NULL WHERE id = ?1"), [row])?;
        }
        tx.execute("DELETE FROM journal WHERE id = ?1", [journal_id])?;
        tx.commit()?;
        Ok(Some(Undone { table, id: row, action }))
    }

    // ---- annotations ----

    #[allow(clippy::too_many_arguments)]
    pub fn annotate(
        &self,
        book: i64,
        kind: AnnotationKind,
        span: Span,
        quote: &str,
        body: &str,
        author: &str,
    ) -> Result<i64> {
        self.insert_annotation(book, kind, span, quote, body, author, None)
    }

    #[allow(clippy::too_many_arguments)]
    fn insert_annotation(
        &self,
        book: i64,
        kind: AnnotationKind,
        span: Span,
        quote: &str,
        body: &str,
        author: &str,
        replaces: Option<i64>,
    ) -> Result<i64> {
        self.conn().execute(
            "INSERT INTO annotations (book_id, kind, start, end, quote, body, author, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![book, kind.as_str(), span.start.to_string(), span.end.to_string(), quote, body, author, now()],
        )?;
        let id = self.conn().last_insert_rowid();
        self.log(author, "annotations", id, "insert", replaces)?;
        Ok(id)
    }

    pub fn annotation(&self, id: i64) -> Result<Annotation> {
        self.query_annotations("a.id = ?1", params![id])?
            .pop()
            .ok_or_else(|| anyhow::anyhow!("no annotation with id {id}"))
    }

    /// Live annotations of a book in reading order.
    pub fn annotations(&self, book: i64, kind: Option<AnnotationKind>) -> Result<Vec<Annotation>> {
        let mut list = self.query_annotations(
            "a.book_id = ?1 AND (?2 IS NULL OR a.kind = ?2)",
            params![book, kind.map(|k| k.as_str())],
        )?;
        list.sort_by_key(|a| (a.start, a.id));
        Ok(list)
    }

    fn query_annotations(&self, filter: &str, args: impl rusqlite::Params) -> Result<Vec<Annotation>> {
        let sql = format!(
            "SELECT a.id, a.book_id, a.kind, a.start, a.end, a.quote, a.body, a.author, a.created_at
             FROM annotations a WHERE a.deleted_at IS NULL AND {filter}"
        );
        let mut stmt = self.conn().prepare(&sql)?;
        let rows = stmt.query_map(args, |r| {
            let loc =
                |i: usize| -> rusqlite::Result<Locator> { Ok(r.get::<_, String>(i)?.parse().unwrap_or_default()) };
            Ok(Annotation {
                id: r.get(0)?,
                book_id: r.get(1)?,
                kind: AnnotationKind::parse(&r.get::<_, String>(2)?),
                start: loc(3)?,
                end: loc(4)?,
                quote: r.get(5)?,
                body: r.get(6)?,
                author: r.get(7)?,
                created_at: r.get(8)?,
            })
        })?;
        rows.map(|r| Ok(r?)).collect()
    }

    /// Replaces the text of an annotation; returns the id of the new version.
    pub fn edit_annotation(&self, id: i64, body: &str, author: &str) -> Result<i64> {
        let old = self.annotation(id)?;
        self.retire("annotations", id, author)?;
        let span = Span {
            start: old.start,
            end: old.end,
        };
        self.insert_annotation(old.book_id, old.kind, span, &old.quote, body, &old.author, Some(id))
            .and_then(|new| {
                // The journal entry belongs to whoever edited, so their `undo` reverts the edit.
                self.conn().execute(
                    "UPDATE journal SET author = ?1 WHERE row_id = ?2 AND tbl = 'annotations'",
                    params![author, new],
                )?;
                Ok(new)
            })
    }

    pub fn delete_annotation(&self, id: i64, author: &str) -> Result<()> {
        self.retire("annotations", id, author)?;
        self.log(author, "annotations", id, "delete", None)
    }

    // ---- memory ----

    /// Stores a fact about a book under `key`, replacing the author's previous value.
    pub fn remember(&self, book: i64, key: &str, value: &str, locator: Option<Locator>, author: &str) -> Result<i64> {
        let old: Option<i64> = self
            .conn()
            .query_row(
                "SELECT id FROM memory WHERE book_id = ?1 AND key = ?2 AND author = ?3 AND deleted_at IS NULL",
                params![book, key, author],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(old) = old {
            self.retire("memory", old, author)?;
        }
        self.conn().execute(
            "INSERT INTO memory (book_id, key, value, locator, author, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![book, key, value, locator.map(|l| l.to_string()), author, now()],
        )?;
        let id = self.conn().last_insert_rowid();
        self.log(author, "memory", id, "insert", old)?;
        Ok(id)
    }

    /// Live memory entries of a book, optionally only one key, ordered by key.
    pub fn memories(&self, book: i64, key: Option<&str>) -> Result<Vec<MemoryEntry>> {
        let mut stmt = self.conn().prepare(
            "SELECT id, key, value, locator, author, created_at FROM memory
             WHERE book_id = ?1 AND deleted_at IS NULL AND (?2 IS NULL OR key = ?2) ORDER BY key, id",
        )?;
        let rows = stmt.query_map(params![book, key], |r| {
            Ok(MemoryEntry {
                id: r.get(0)?,
                key: r.get(1)?,
                value: r.get(2)?,
                locator: r.get::<_, Option<String>>(3)?.and_then(|l| l.parse().ok()),
                author: r.get(4)?,
                created_at: r.get(5)?,
            })
        })?;
        rows.map(|r| Ok(r?)).collect()
    }

    pub fn forget(&self, id: i64, author: &str) -> Result<()> {
        self.retire("memory", id, author)?;
        self.log(author, "memory", id, "delete", None)
    }

    // ---- art ----

    pub fn add_art(
        &self,
        book: i64,
        at: Locator,
        placement: Placement,
        file: &str,
        mime: &str,
        author: &str,
    ) -> Result<i64> {
        self.conn().execute(
            "INSERT INTO art (book_id, locator, placement, file, mime, author, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![book, at.to_string(), placement.as_str(), file, mime, author, now()],
        )?;
        let id = self.conn().last_insert_rowid();
        self.log(author, "art", id, "insert", None)?;
        Ok(id)
    }

    pub fn arts(&self, book: i64) -> Result<Vec<Art>> {
        let mut stmt = self.conn().prepare(
            "SELECT id, book_id, locator, placement, file, mime, author, created_at FROM art WHERE book_id = ?1 AND deleted_at IS NULL ORDER BY id",
        )?;
        let rows = stmt.query_map([book], |r| {
            Ok(Art {
                id: r.get(0)?,
                book_id: r.get(1)?,
                locator: r.get::<_, String>(2)?.parse().unwrap_or_default(),
                placement: Placement::parse(&r.get::<_, String>(3)?).unwrap_or(Placement::Chapter),
                file: r.get(4)?,
                mime: r.get(5)?,
                author: r.get(6)?,
                created_at: r.get(7)?,
            })
        })?;
        let mut list: Vec<Art> = rows.collect::<rusqlite::Result<_>>()?;
        list.sort_by_key(|a| (a.locator, a.id));
        Ok(list)
    }

    /// Detaches an image from the book. The file stays in the art folder so `undo` can bring it back.
    pub fn remove_art(&self, id: i64, author: &str) -> Result<()> {
        self.retire("art", id, author)?;
        self.log(author, "art", id, "delete", None)
    }

    // ---- atmospheres ----

    /// Stores a validated profile for a scope; replaces the live profile of the same scope and span.
    pub fn set_atmosphere(
        &self,
        book: i64,
        scope: Scope,
        span: Option<Span>,
        profile: &serde_json::Value,
        author: &str,
    ) -> Result<i64> {
        let (start, end) = (span.map(|s| s.start.to_string()), span.map(|s| s.end.to_string()));
        let old: Option<(i64, String)> = self
            .conn()
            .query_row(
                "SELECT id, author FROM atmospheres WHERE book_id = ?1 AND scope = ?2 AND start IS ?3 AND end IS ?4 AND deleted_at IS NULL",
                params![book, scope.as_str(), start, end],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        if let Some((old, _)) = &old {
            self.retire("atmospheres", *old, author)?;
        }
        self.conn().execute(
            "INSERT INTO atmospheres (book_id, scope, start, end, profile, author, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![book, scope.as_str(), start, end, profile.to_string(), author, now()],
        )?;
        let id = self.conn().last_insert_rowid();
        self.log(author, "atmospheres", id, "insert", old.map(|(id, _)| id))?;
        Ok(id)
    }

    pub fn atmospheres(&self, book: i64) -> Result<Vec<Atmosphere>> {
        let mut stmt = self.conn().prepare(
            "SELECT id, book_id, scope, start, end, profile, author, created_at FROM atmospheres WHERE book_id = ?1 AND deleted_at IS NULL ORDER BY id",
        )?;
        let rows = stmt.query_map([book], |r| {
            let start: Option<String> = r.get(3)?;
            let end: Option<String> = r.get(4)?;
            let span = match (start.and_then(|s| s.parse().ok()), end.and_then(|e| e.parse().ok())) {
                (Some(start), Some(end)) => Some(Span { start, end }),
                _ => None,
            };
            Ok(Atmosphere {
                id: r.get(0)?,
                book_id: r.get(1)?,
                scope: Scope::parse(&r.get::<_, String>(2)?),
                span,
                profile: serde_json::from_str(&r.get::<_, String>(5)?).unwrap_or_default(),
                author: r.get(6)?,
                created_at: r.get(7)?,
            })
        })?;
        rows.map(|r| Ok(r?)).collect()
    }

    pub fn clear_atmosphere(&self, id: i64, author: &str) -> Result<()> {
        self.retire("atmospheres", id, author)?;
        self.log(author, "atmospheres", id, "delete", None)
    }
}

fn singular(table: &str) -> &str {
    match table {
        "annotations" => "annotation",
        "atmospheres" => "atmosphere",
        "memory" => "memory entry",
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::tests::library;

    fn span(s: &str) -> Span {
        s.parse().unwrap()
    }

    #[test]
    fn annotations_edit_delete_undo() {
        let (_dir, library, book) = library();
        let note = library
            .annotate(
                book.id,
                AnnotationKind::Note,
                span("ch:1:0..ch:1:5"),
                "Часть",
                "мысль",
                "claude",
            )
            .unwrap();
        library
            .annotate(book.id, AnnotationKind::Bookmark, span("ch:1:0..ch:1:0"), "", "", USER)
            .unwrap();
        assert_eq!(
            library.annotations(book.id, Some(AnnotationKind::Note)).unwrap().len(),
            1
        );

        // Agents cannot touch the reader's records; the reader can touch everything.
        let bookmark = library.annotations(book.id, Some(AnnotationKind::Bookmark)).unwrap()[0].id;
        assert!(library.delete_annotation(bookmark, "claude").is_err());

        let edited = library.edit_annotation(note, "другая мысль", "claude").unwrap();
        assert_eq!(library.annotation(edited).unwrap().body, "другая мысль");
        assert!(library.annotation(note).is_err());

        let undone = library.undo("claude").unwrap().unwrap();
        assert_eq!((undone.id, undone.action.as_str()), (edited, "insert"));
        assert_eq!(library.annotation(note).unwrap().body, "мысль");

        library.delete_annotation(note, USER).unwrap();
        assert!(library.annotation(note).is_err());
        library.undo(USER).unwrap();
        assert_eq!(library.annotation(note).unwrap().body, "мысль");
    }

    #[test]
    fn memory_replaces_per_author() {
        let (_dir, library, book) = library();
        library
            .remember(book.id, "Раскольников", "студент", None, "claude")
            .unwrap();
        library
            .remember(
                book.id,
                "Раскольников",
                "бывший студент",
                Some(Locator::new(0, 3)),
                "claude",
            )
            .unwrap();
        library
            .remember(book.id, "Раскольников", "герой", None, "codex")
            .unwrap();
        let all = library.memories(book.id, Some("Раскольников")).unwrap();
        assert_eq!(all.len(), 2);
        assert!(
            all.iter()
                .any(|m| m.value == "бывший студент" && m.locator == Some(Locator::new(0, 3)))
        );
        library.undo("claude").unwrap();
        assert!(
            library
                .memories(book.id, None)
                .unwrap()
                .iter()
                .any(|m| m.value == "студент")
        );
    }

    #[test]
    fn atmosphere_and_art() {
        let (_dir, library, book) = library();
        let profile = serde_json::json!({"preset": "rain"});
        library
            .set_atmosphere(book.id, Scope::Book, None, &profile, "claude")
            .unwrap();
        library
            .set_atmosphere(
                book.id,
                Scope::Book,
                None,
                &serde_json::json!({"preset": "storm"}),
                "claude",
            )
            .unwrap();
        let live = library.atmospheres(book.id).unwrap();
        assert_eq!(live.len(), 1);
        assert_eq!(live[0].profile["preset"], "storm");
        library.undo("claude").unwrap();
        assert_eq!(library.atmospheres(book.id).unwrap()[0].profile["preset"], "rain");

        let art = library
            .add_art(
                book.id,
                Locator::new(1, 0),
                Placement::Chapter,
                "a.png",
                "image/png",
                "claude",
            )
            .unwrap();
        assert_eq!(library.arts(book.id).unwrap().len(), 1);
        library.remove_art(art, "claude").unwrap();
        assert!(library.arts(book.id).unwrap().is_empty());
    }
}
