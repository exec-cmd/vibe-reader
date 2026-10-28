//! PDF: text for agents and search, page by page. The window shows the pages themselves with pdf.js.

use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::Path;

use anyhow::{Result, anyhow};

use super::{Chapter, Document, Format, Kind, Meta};
use crate::text;

/// Each page is a chapter, so `ch:12` is page 12.
pub fn open(path: &Path) -> Result<Document> {
    // pdf-extract panics on some malformed files; a broken PDF must not take the app down.
    let pages = catch_unwind(AssertUnwindSafe(|| pdf_extract::extract_text_by_pages(path)))
        .map_err(|_| anyhow!("cannot extract text from this PDF"))?
        .map_err(|e| anyhow!("cannot extract text from this PDF: {e}"))?;
    let chapters = pages
        .iter()
        .enumerate()
        .map(|(i, page)| {
            let prepared = text::prepare(&text::paragraphs_to_html(&reflow(page)), "");
            Chapter {
                title: format!("Page {}", i + 1),
                path: String::new(),
                html: prepared.html,
                text: prepared.text,
            }
        })
        .collect();
    Ok(Document {
        format: Format::Pdf,
        kind: Kind::Tech,
        meta: Meta::default(),
        chapters,
        toc: Vec::new(),
    })
}

/// Joins hard-wrapped lines into paragraphs; blank lines stay paragraph breaks.
fn reflow(page: &str) -> String {
    let mut out = String::new();
    for line in page.lines().map(str::trim) {
        if line.is_empty() {
            if !out.ends_with("\n\n") {
                out.push_str("\n\n");
            }
        } else {
            if !out.is_empty() && !out.ends_with('\n') {
                // A hyphen at a line end usually splits a word.
                if out.ends_with('-') {
                    out.pop();
                } else {
                    out.push(' ');
                }
            }
            out.push_str(line);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use pdf_extract::content::{Content, Operation};
    use pdf_extract::{Document as Pdf, Object, Stream, dictionary};

    /// Writes a two-page PDF with Helvetica text.
    fn sample(path: &std::path::Path) {
        let mut doc = Pdf::with_version("1.5");
        let pages_id = doc.new_object_id();
        let font_id = doc.add_object(dictionary! { "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica" });
        let resources_id = doc.add_object(dictionary! { "Font" => dictionary! { "F1" => font_id } });
        let mut kids = Vec::new();
        for text in ["First page text", "Second page text"] {
            let content = Content {
                operations: vec![
                    Operation::new("BT", vec![]),
                    Operation::new("Tf", vec!["F1".into(), 24.into()]),
                    Operation::new("Td", vec![72.into(), 700.into()]),
                    Operation::new("Tj", vec![Object::string_literal(text)]),
                    Operation::new("ET", vec![]),
                ],
            };
            let content_id = doc.add_object(Stream::new(dictionary! {}, content.encode().unwrap()));
            let page_id =
                doc.add_object(dictionary! { "Type" => "Page", "Parent" => pages_id, "Contents" => content_id });
            kids.push(page_id.into());
        }
        let pages = dictionary! { "Type" => "Pages", "Kids" => kids, "Count" => 2, "Resources" => resources_id, "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()] };
        doc.objects.insert(pages_id, Object::Dictionary(pages));
        let catalog_id = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
        doc.trailer.set("Root", catalog_id);
        doc.save(path).unwrap();
    }

    #[test]
    fn reads_pages() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("paper.pdf");
        sample(&file);
        let doc = crate::format::open(&file).unwrap();
        assert_eq!(doc.chapters.len(), 2);
        assert_eq!(doc.chapters[1].title, "Page 2");
        assert!(
            doc.chapters[1].text.contains("Second page text"),
            "{:?}",
            doc.chapters[1].text
        );
        assert_eq!(doc.meta.title, "paper");
    }

    #[test]
    fn rejects_garbage() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("broken.pdf");
        std::fs::write(&file, b"%PDF-1.4 not really").unwrap();
        assert!(crate::format::open(&file).is_err());
    }

    #[test]
    fn reflows_lines() {
        assert_eq!(super::reflow("Hello\nwor-\nld\n\nNext"), "Hello world\n\nNext");
    }
}
