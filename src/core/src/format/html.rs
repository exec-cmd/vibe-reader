use std::path::Path;

use anyhow::Result;
use regex::Regex;

use super::{Chapter, Document, Format, Kind, Meta, decode};
use crate::text;

pub fn open(path: &Path) -> Result<Document> {
    let raw = decode(&std::fs::read(path)?);
    let title = Regex::new(r"(?is)<title[^>]*>(.*?)</title>")?
        .captures(&raw)
        .map(|c| text::prepare(&c[1], "").text)
        .unwrap_or_default();
    let prepared = text::prepare(&raw, "");
    Ok(Document {
        format: Format::Html,
        kind: Kind::Prose,
        meta: Meta {
            title,
            ..Meta::default()
        },
        chapters: vec![Chapter {
            title: String::new(),
            path: String::new(),
            html: prepared.html,
            text: prepared.text,
        }],
        toc: Vec::new(),
    })
}
