use std::path::Path;

use anyhow::Result;
use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd, html};

use super::{Chapter, Document, Format, Kind, Meta, decode};
use crate::text;

pub fn open(path: &Path) -> Result<Document> {
    let source = decode(&std::fs::read(path)?);
    let options = Options::ENABLE_TABLES
        | Options::ENABLE_FOOTNOTES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_MATH
        | Options::ENABLE_HEADING_ATTRIBUTES
        | Options::ENABLE_YAML_STYLE_METADATA_BLOCKS;
    let events: Vec<Event> = Parser::new_ext(&source, options).collect();

    // Long documents with several top-level headings become one chapter per heading.
    let h1 = |e: &Event| {
        matches!(
            e,
            Event::Start(Tag::Heading {
                level: HeadingLevel::H1,
                ..
            })
        )
    };
    let split = events.iter().filter(|e| h1(e)).count() >= 2;
    let mut parts: Vec<Vec<Event>> = vec![Vec::new()];
    let mut in_metadata = false;
    for event in events {
        match &event {
            Event::Start(Tag::MetadataBlock(_)) => in_metadata = true,
            Event::End(TagEnd::MetadataBlock(_)) => in_metadata = false,
            _ if in_metadata => {}
            _ => {
                if split && h1(&event) && parts.last().is_some_and(|p| !p.is_empty()) {
                    parts.push(Vec::new());
                }
                parts.last_mut().expect("never empty").push(event);
            }
        }
    }

    let chapters: Vec<Chapter> = parts
        .into_iter()
        .filter(|p| !p.is_empty())
        .map(|events| {
            let mut out = String::new();
            html::push_html(&mut out, events.into_iter());
            let prepared = text::prepare(&out, "");
            Chapter {
                title: String::new(),
                path: String::new(),
                html: prepared.html,
                text: prepared.text,
            }
        })
        .collect();
    let title = chapters
        .first()
        .and_then(|c| c.text.lines().next())
        .unwrap_or_default()
        .to_owned();
    let title = if split { String::new() } else { title };
    Ok(Document {
        format: Format::Markdown,
        kind: Kind::Tech,
        meta: Meta {
            title,
            ..Meta::default()
        },
        chapters,
        toc: Vec::new(),
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn renders_code_math_and_splits() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("notes.md");
        std::fs::write(&file, "---\ntitle: x\n---\n# One\n\n```rust\nfn a() {}\n```\n\n$e=mc^2$\n\n# Two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n").unwrap();
        let doc = super::super::open(&file).unwrap();
        assert_eq!(doc.chapters.len(), 2);
        assert_eq!(doc.chapters[0].title, "One");
        assert!(
            doc.chapters[0].html.contains(r#"class="language-rust""#),
            "{}",
            doc.chapters[0].html
        );
        assert!(doc.chapters[0].html.contains("math"), "{}", doc.chapters[0].html);
        assert!(doc.chapters[1].html.contains("<table"));
        assert!(!doc.chapters[0].text.contains("title: x"));
    }
}
