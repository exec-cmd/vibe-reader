//! Spoiler-safe slices of book text for agents: chunks with a continuation cursor, and search.

use anyhow::Result;
use regex::{Regex, RegexBuilder};
use serde::Serialize;

use crate::locator::byte_index;
use crate::{Document, Locator};

/// Rough characters per token, used to turn `--max-tokens` into a character budget.
pub const CHARS_PER_TOKEN: usize = 4;

#[derive(Debug, Clone, Serialize)]
pub struct Chunk {
    pub chapter_title: String,
    pub from: Locator,
    pub to: Locator,
    /// Where the next chunk starts; none at the end of the book or at the limit.
    pub next: Option<Locator>,
    /// True when the text stopped at the reader's position (or the requested range end).
    pub limited: bool,
    pub text: String,
}

/// Up to `max_chars` of one chapter starting at `from`, never past `limit`.
/// Cuts at a line break, or a space, in the second half of the budget when it can.
pub fn chunk(doc: &Document, from: Locator, max_chars: usize, limit: Option<Locator>) -> Chunk {
    let empty = |from: Locator| Chunk {
        chapter_title: String::new(),
        from,
        to: from,
        next: None,
        limited: true,
        text: String::new(),
    };
    let Some(chapter) = doc.chapters.get(from.chapter) else {
        return empty(from);
    };
    if limit.is_some_and(|l| l <= from) {
        return Chunk {
            chapter_title: chapter.title.clone(),
            ..empty(from)
        };
    }
    let len = chapter.text.chars().count();
    let start = from.offset.min(len);
    let mut end = (start + max_chars.max(1)).min(len);
    let mut limited = false;
    if let Some(limit) = limit.filter(|l| l.chapter == from.chapter && l.offset < end) {
        end = limit.offset.max(start);
        limited = true;
    }
    if end < len && !limited {
        let window: Vec<char> = chapter.text.chars().skip(start).take(end - start).collect();
        let half = window.len() / 2;
        let cut = window
            .iter()
            .rposition(|&c| c == '\n')
            .filter(|&i| i >= half)
            .or_else(|| window.iter().rposition(|&c| c == ' ').filter(|&i| i >= half));
        if let Some(cut) = cut {
            end = start + cut + 1;
        }
    }
    let text = chapter.text[byte_index(&chapter.text, start)..byte_index(&chapter.text, end)].to_owned();
    let next = if limited {
        None
    } else if end < len {
        Some(Locator::new(from.chapter, end))
    } else if from.chapter + 1 < doc.chapters.len() {
        Some(Locator::new(from.chapter + 1, 0)).filter(|n| limit.is_none_or(|l| *n < l))
    } else {
        None
    };
    let limited = limited || (next.is_none() && end == len && from.chapter + 1 < doc.chapters.len());
    Chunk {
        chapter_title: chapter.title.clone(),
        from: Locator::new(from.chapter, start),
        to: Locator::new(from.chapter, end),
        next,
        limited,
        text,
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Hit {
    pub locator: Locator,
    pub chapter_title: String,
    pub snippet: String,
}

/// Case-insensitive search for a substring or a regex, before `limit` when given.
pub fn search(doc: &Document, query: &str, regex: bool, limit: Option<Locator>, max_hits: usize) -> Result<Vec<Hit>> {
    let pattern = if regex { query.to_owned() } else { regex::escape(query) };
    let re: Regex = RegexBuilder::new(&pattern).case_insensitive(true).build()?;
    let mut hits = Vec::new();
    for (i, chapter) in doc.chapters.iter().enumerate() {
        for m in re.find_iter(&chapter.text) {
            let offset = chapter.text[..m.start()].chars().count();
            let at = Locator::new(i, offset);
            if limit.is_some_and(|l| at >= l) || hits.len() >= max_hits {
                return Ok(hits);
            }
            hits.push(Hit {
                locator: at,
                chapter_title: chapter.title.clone(),
                snippet: snippet(&chapter.text, m.start(), m.end()),
            });
        }
    }
    Ok(hits)
}

/// Up to 60 characters around a byte range, on one line.
fn snippet(text: &str, start: usize, end: usize) -> String {
    let before: String = text[..start]
        .chars()
        .rev()
        .take(60)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    let after: String = text[end..].chars().take(60).collect();
    format!("{before}{}{after}", &text[start..end])
        .replace('\n', " ")
        .trim()
        .to_owned()
}

/// Text before `at`, up to `max_chars`, from the same chapter.
pub fn before(doc: &Document, at: Locator, max_chars: usize) -> String {
    let Some(chapter) = doc.chapters.get(at.chapter) else {
        return String::new();
    };
    let start = at.offset.saturating_sub(max_chars);
    chapter.text[byte_index(&chapter.text, start)..byte_index(&chapter.text, at.offset)].to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::format::{Chapter, Format, Kind, Meta};

    fn doc() -> Document {
        let chapter = |title: &str, text: &str| Chapter {
            title: title.into(),
            path: String::new(),
            html: String::new(),
            text: text.into(),
        };
        Document {
            format: Format::Txt,
            kind: Kind::Prose,
            meta: Meta::default(),
            chapters: vec![
                chapter("Один", "Первая строка.\nВторая строка тут."),
                chapter("Два", "Финал книги."),
            ],
            toc: Vec::new(),
        }
    }

    #[test]
    fn chunks_with_cursor() {
        let doc = doc();
        let first = chunk(&doc, Locator::new(0, 0), 20, None);
        assert_eq!(first.text, "Первая строка.\n");
        assert_eq!(first.next, Some(Locator::new(0, 15)));
        let second = chunk(&doc, first.next.unwrap(), 100, None);
        assert_eq!(second.text, "Вторая строка тут.");
        assert_eq!(second.next, Some(Locator::new(1, 0)));
        let last = chunk(&doc, Locator::new(1, 0), 100, None);
        assert!(last.next.is_none() && !last.limited);
    }

    #[test]
    fn stops_at_limit() {
        let doc = doc();
        let limit = Some(Locator::new(0, 6));
        let part = chunk(&doc, Locator::new(0, 0), 100, limit);
        assert_eq!(part.text, "Первая");
        assert!(part.limited && part.next.is_none());
        assert!(chunk(&doc, Locator::new(1, 0), 100, limit).text.is_empty());
        // The whole first chapter is allowed, the next one is not.
        let whole = chunk(&doc, Locator::new(0, 0), 100, Some(Locator::new(1, 0)));
        assert!(whole.limited && whole.next.is_none() && whole.text.ends_with("тут."));
    }

    #[test]
    fn searches_before_limit() {
        let doc = doc();
        assert_eq!(search(&doc, "СТРОКА", false, None, 10).unwrap().len(), 2);
        assert_eq!(
            search(&doc, "книги", false, Some(Locator::new(1, 0)), 10)
                .unwrap()
                .len(),
            0
        );
        let hits = search(&doc, r"Вт\w+", true, None, 10).unwrap();
        assert_eq!(hits[0].locator, Locator::new(0, 15));
        assert_eq!(before(&doc, Locator::new(0, 13), 6), "строка");
    }
}
