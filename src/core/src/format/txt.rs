use std::path::Path;

use anyhow::Result;
use regex::Regex;

use super::{Chapter, Document, Format, Kind, Meta, decode};
use crate::text;

/// A line alone that starts a chapter: "Глава 3", "CHAPTER IV", "Часть первая".
const HEADING: &str = r"(?m)^[ \t]*(?:Глава|ГЛАВА|Часть|ЧАСТЬ|Chapter|CHAPTER|Part|PART)\b[^\n]{0,60}$";

pub fn open(path: &Path) -> Result<Document> {
    let raw = decode(&std::fs::read(path)?).replace("\r\n", "\n");
    let heading = Regex::new(HEADING)?;
    let mut starts: Vec<usize> = heading.find_iter(&raw).map(|m| m.start()).collect();
    if starts.first() != Some(&0) {
        starts.insert(0, 0);
    }
    let blank_lines = raw.matches("\n\n").count();
    let separated = blank_lines * 4 >= raw.lines().count();

    let mut chapters = Vec::new();
    for (i, &start) in starts.iter().enumerate() {
        let end = starts.get(i + 1).copied().unwrap_or(raw.len());
        let body = raw[start..end].trim();
        if body.is_empty() {
            continue;
        }
        let (title, rest) = match heading.find(body) {
            Some(m) if m.start() == 0 => (m.as_str().trim().to_owned(), body[m.end()..].trim()),
            _ => (String::new(), body),
        };
        // Books with one paragraph per line have few blank lines; treat every line as a paragraph then.
        let paras = if separated {
            rest.to_owned()
        } else {
            rest.replace('\n', "\n\n")
        };
        let mut html = String::new();
        if !title.is_empty() {
            html.push_str(&format!("<h2>{}</h2>\n", text::escape(&title)));
        }
        html.push_str(&text::paragraphs_to_html(&paras));
        let prepared = text::prepare(&html, "");
        chapters.push(Chapter {
            title,
            path: String::new(),
            html: prepared.html,
            text: prepared.text,
        });
    }
    Ok(Document {
        format: Format::Txt,
        kind: Kind::Prose,
        meta: Meta::default(),
        chapters,
        toc: Vec::new(),
    })
}

#[cfg(test)]
mod tests {

    #[test]
    fn splits_chapters_and_paragraphs() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("book.txt");
        std::fs::write(&file, "Пролог.\n\nГлава 1\n\nОдин.\n\nДва.\n\nГлава 2\nТри.").unwrap();
        let doc = super::super::open(&file).unwrap();
        assert_eq!(doc.meta.title, "book");
        assert_eq!(doc.chapters.len(), 3);
        assert_eq!(doc.chapters[1].title, "Глава 1");
        assert_eq!(doc.chapters[1].text, "Глава 1\nОдин.\nДва.");
        assert_eq!(doc.chapters[0].title, "Пролог.");
    }
}
