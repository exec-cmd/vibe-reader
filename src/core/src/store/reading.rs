//! Reading state: the reader's position, agent cursors and reading sessions.

use anyhow::Result;
use rusqlite::{OptionalExtension, params};
use serde::Serialize;

use super::{Library, now};
use crate::Locator;

#[derive(Debug, Clone, Serialize)]
pub struct Position {
    pub locator: Locator,
    pub quote: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Session {
    pub id: i64,
    pub book_id: i64,
    pub title: String,
    pub started_at: i64,
    pub ended_at: i64,
    pub start: Locator,
    pub end: Locator,
    pub chars: usize,
    pub words: usize,
}

impl Session {
    pub fn seconds(&self) -> i64 {
        (self.ended_at - self.started_at).max(0)
    }
}

impl Library {
    pub fn position(&self, book: i64) -> Result<Option<Position>> {
        Ok(self
            .conn()
            .query_row(
                "SELECT locator, quote, updated_at FROM positions WHERE book_id = ?1",
                [book],
                |r| Ok((r.get::<_, String>(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()?
            .and_then(|(locator, quote, updated_at)| {
                Some(Position {
                    locator: locator.parse().ok()?,
                    quote,
                    updated_at,
                })
            }))
    }

    pub fn set_position(&self, book: i64, at: Locator, quote: &str) -> Result<()> {
        self.conn().execute(
            "INSERT INTO positions (book_id, locator, quote, updated_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT (book_id) DO UPDATE SET locator = ?2, quote = ?3, updated_at = ?4",
            params![book, at.to_string(), quote, now()],
        )?;
        Ok(())
    }

    pub fn cursor(&self, book: i64, agent: &str) -> Result<Option<Locator>> {
        let cursor: Option<String> = self
            .conn()
            .query_row(
                "SELECT locator FROM agent_cursors WHERE book_id = ?1 AND agent = ?2",
                params![book, agent],
                |r| r.get(0),
            )
            .optional()?;
        Ok(cursor.and_then(|c| c.parse().ok()))
    }

    pub fn set_cursor(&self, book: i64, agent: &str, at: Locator) -> Result<()> {
        self.conn().execute(
            "INSERT INTO agent_cursors (book_id, agent, locator, updated_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT (book_id, agent) DO UPDATE SET locator = ?3, updated_at = ?4",
            params![book, agent, at.to_string(), now()],
        )?;
        Ok(())
    }

    /// Starts a session at `at`; the GUI extends it with [`Library::extend_session`] while the reader reads.
    pub fn start_session(&self, book: i64, at: Locator) -> Result<i64> {
        let t = now();
        self.conn().execute(
            "INSERT INTO sessions (book_id, started_at, ended_at, start_locator, end_locator) VALUES (?1, ?2, ?2, ?3, ?3)",
            params![book, t, at.to_string()],
        )?;
        Ok(self.conn().last_insert_rowid())
    }

    pub fn extend_session(&self, id: i64, at: Locator, chars: usize, words: usize) -> Result<()> {
        self.conn().execute(
            "UPDATE sessions SET ended_at = ?2, end_locator = ?3, chars = ?4, words = ?5 WHERE id = ?1",
            params![id, now(), at.to_string(), chars, words],
        )?;
        Ok(())
    }

    /// Imports a finished session as-is; used by tests and imports.
    pub fn insert_session(&self, s: &Session) -> Result<i64> {
        self.conn().execute(
            "INSERT INTO sessions (book_id, started_at, ended_at, start_locator, end_locator, chars, words) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![s.book_id, s.started_at, s.ended_at, s.start.to_string(), s.end.to_string(), s.chars, s.words],
        )?;
        Ok(self.conn().last_insert_rowid())
    }

    /// Sessions that started at or after `since`, oldest first, optionally for one book.
    pub fn sessions(&self, since: i64, book: Option<i64>) -> Result<Vec<Session>> {
        let mut stmt = self.conn().prepare(
            "SELECT s.id, s.book_id, b.title, s.started_at, s.ended_at, s.start_locator, s.end_locator, s.chars, s.words
             FROM sessions s JOIN books b ON b.id = s.book_id
             WHERE s.started_at >= ?1 AND (?2 IS NULL OR s.book_id = ?2) ORDER BY s.started_at",
        )?;
        let rows = stmt.query_map(params![since, book], |r| {
            let loc =
                |i: usize| -> rusqlite::Result<Locator> { Ok(r.get::<_, String>(i)?.parse().unwrap_or_default()) };
            Ok(Session {
                id: r.get(0)?,
                book_id: r.get(1)?,
                title: r.get(2)?,
                started_at: r.get(3)?,
                ended_at: r.get(4)?,
                start: loc(5)?,
                end: loc(6)?,
                chars: r.get(7)?,
                words: r.get(8)?,
            })
        })?;
        rows.map(|r| Ok(r?)).collect()
    }
}

#[cfg(test)]
mod tests {
    use crate::Locator;
    use crate::store::tests::library;

    #[test]
    fn positions_cursors_sessions() {
        let (_dir, library, book) = library();
        assert!(library.position(book.id).unwrap().is_none());
        library
            .set_position(book.id, Locator::new(1, 5), "благополучно")
            .unwrap();
        let book = library.book(book.id).unwrap();
        assert_eq!(book.position, Some(Locator::new(1, 5)));
        assert!(book.progress > 0.5 && book.progress < 1.0);

        library.set_cursor(book.id, "claude", Locator::new(0, 10)).unwrap();
        assert_eq!(library.cursor(book.id, "claude").unwrap(), Some(Locator::new(0, 10)));
        assert_eq!(library.cursor(book.id, "codex").unwrap(), None);

        let id = library.start_session(book.id, Locator::new(0, 0)).unwrap();
        library.extend_session(id, Locator::new(1, 5), 120, 20).unwrap();
        let sessions = library.sessions(0, Some(book.id)).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].words, 20);
        assert_eq!(sessions[0].end, Locator::new(1, 5));
    }
}
