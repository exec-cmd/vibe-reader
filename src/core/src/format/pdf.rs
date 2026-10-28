//! PDF: text for agents and search, page by page. The window shows the pages themselves with pdf.js.

use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::Path;

use anyhow::{Result, anyhow};

use super::{Chapter, Document, Format, Kind, Meta};
use crate::text;

/// Each page is a chapter, so `ch:12` is page 12. When the text cannot be extracted (scans,
/// unusual encodings, damaged files) the pages stay empty: the window still shows them.
pub fn open(path: &Path) -> Result<Document> {
    let pages = match quietly(|| pdf_extract::extract_text_by_pages(path)) {
        Some(Ok(pages)) if !pages.is_empty() => pages,
        _ => vec![String::new(); page_count(path)?],
    };
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
        meta: info(path),
        chapters,
        toc: Vec::new(),
    })
}

/// Runs pdf-extract, which panics on some files, without letting a panic or its message escape.
fn quietly<T>(f: impl FnOnce() -> T) -> Option<T> {
    let hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(|_| {}));
    let result = catch_unwind(AssertUnwindSafe(f)).ok();
    std::panic::set_hook(hook);
    result
}

/// Page count without text extraction: the page tree when it parses, else `/Type /Page` objects.
fn page_count(path: &Path) -> Result<usize> {
    if let Some(Ok(doc)) = quietly(|| pdf_extract::Document::load(path)) {
        let n = doc.get_pages().len();
        if n > 0 {
            return Ok(n);
        }
    }
    let bytes = std::fs::read(path)?;
    if !bytes.starts_with(b"%PDF") {
        return Err(anyhow!("this is not a PDF file"));
    }
    let re = regex::bytes::Regex::new(r"/Type\s*/Page\b[^s]").expect("valid regex");
    Ok(re.find_iter(&bytes).count().max(1))
}

/// Title and author from the document information dictionary, when they look real.
fn info(path: &Path) -> Meta {
    let read = || -> Option<Meta> {
        let doc = pdf_extract::Document::load(path).ok()?;
        let info = match doc.trailer.get(b"Info").ok()? {
            pdf_extract::Object::Reference(id) => doc.get_dictionary(*id).ok()?,
            pdf_extract::Object::Dictionary(d) => d,
            _ => return None,
        };
        let field = |key: &[u8]| {
            info.get(key)
                .ok()
                .and_then(|o| pdf_extract::decode_text_string(o).ok())
                .map(|s| s.trim().to_owned())
        };
        // A junk title means the producer left defaults; its author field is junk too then.
        let title = field(b"Title").filter(|t| plausible(t))?;
        let authors = field(b"Author")
            .filter(|a| plausible(a))
            .map(|a| split_authors(&a))
            .unwrap_or_default();
        Some(Meta {
            title,
            authors,
            language: None,
        })
    };
    quietly(read).flatten().unwrap_or_default()
}

/// Producers often leave file names or placeholders in the title field.
fn plausible(s: &str) -> bool {
    let lower = s.to_lowercase();
    let file_name = regex::Regex::new(r"\.[a-z0-9]{2,4}$")
        .expect("valid regex")
        .is_match(&lower);
    s.chars().count() > 2
        && !file_name
        && ![
            "untitled",
            "microsoft word",
            ".doc",
            ".indd",
            ".tex",
            ".dvi",
            ".pdf",
            "unknown",
            "anonymous",
        ]
        .iter()
        .any(|bad| lower.contains(bad))
}

fn split_authors(s: &str) -> Vec<String> {
    s.split([',', ';', '&'])
        .flat_map(|a| a.split(" and "))
        .map(str::trim)
        .filter(|a| !a.is_empty())
        .map(str::to_owned)
        .collect()
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
    fn keeps_pages_without_text() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("broken.pdf");
        std::fs::write(
            &file,
            b"%PDF-1.4 1 0 obj << /Type /Page >> endobj 2 0 obj << /Type /Page >> endobj",
        )
        .unwrap();
        let doc = crate::format::open(&file).unwrap();
        assert_eq!(doc.chapters.len(), 2);
        let other = dir.path().join("fake.pdf");
        std::fs::write(&other, b"not a pdf").unwrap();
        assert!(crate::format::open(&other).is_err());
    }

    #[test]
    fn filters_junk_metadata() {
        assert!(super::plausible("Python. К вершинам мастерства"));
        assert!(!super::plausible("Демидович_5.pmd"));
        assert!(!super::plausible("lineynaya_algebra.djvu"));
        assert!(!super::plausible("Microsoft Word - draft"));
    }

    #[test]
    fn reflows_lines() {
        assert_eq!(super::reflow("Hello\nwor-\nld\n\nNext"), "Hello world\n\nNext");
    }
}
