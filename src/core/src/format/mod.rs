//! Book formats. Every format turns a file into the same [`Document`].

#[cfg(feature = "epub")]
mod epub;
#[cfg(feature = "fb2")]
mod fb2;
mod html;
#[cfg(feature = "markdown")]
mod markdown;
#[cfg(feature = "pdf")]
mod pdf;
mod txt;
#[cfg(any(feature = "epub", feature = "fb2"))]
mod xml;

use std::fmt;
use std::path::Path;
use std::str::FromStr;

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    Epub,
    Fb2,
    Html,
    Markdown,
    Pdf,
    Txt,
}

impl Format {
    pub const ALL: [Format; 6] = [
        Format::Epub,
        Format::Fb2,
        Format::Html,
        Format::Markdown,
        Format::Pdf,
        Format::Txt,
    ];

    pub fn detect(path: &Path) -> Option<Format> {
        let ext = path.extension()?.to_str()?.to_ascii_lowercase();
        Some(match ext.as_str() {
            "epub" => Format::Epub,
            "fb2" => Format::Fb2,
            "html" | "htm" | "xhtml" => Format::Html,
            "md" | "markdown" => Format::Markdown,
            "pdf" => Format::Pdf,
            "txt" | "text" => Format::Txt,
            _ => return None,
        })
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Format::Epub => "epub",
            Format::Fb2 => "fb2",
            Format::Html => "html",
            Format::Markdown => "markdown",
            Format::Pdf => "pdf",
            Format::Txt => "txt",
        }
    }

    /// Whether this build can open the format (FB2 and PDF are optional features).
    pub fn supported(self) -> bool {
        match self {
            Format::Epub => cfg!(feature = "epub"),
            Format::Markdown => cfg!(feature = "markdown"),
            Format::Fb2 => cfg!(feature = "fb2"),
            Format::Pdf => cfg!(feature = "pdf"),
            Format::Html | Format::Txt => true,
        }
    }
}

impl fmt::Display for Format {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for Format {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self> {
        Format::ALL
            .into_iter()
            .find(|f| f.as_str() == s)
            .with_context(|| format!("unknown format {s}"))
    }
}

/// Prose opens in page mode, technical texts in continuous scroll.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Prose,
    Tech,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Prose => "prose",
            Kind::Tech => "tech",
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Meta {
    pub title: String,
    pub authors: Vec<String>,
    pub language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TocEntry {
    pub title: String,
    /// Zero-based chapter index.
    pub chapter: usize,
    /// Nesting depth, 0 for top level.
    pub level: usize,
    /// Prefixed element id inside the chapter, when the entry points into it.
    pub anchor: Option<String>,
    /// Offset of the anchor in the chapter's normalized text; 0 without an anchor.
    #[serde(default)]
    pub offset: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub title: String,
    /// Path of the chapter file inside the book, used to resolve links between chapters.
    pub path: String,
    pub html: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    pub format: Format,
    pub kind: Kind,
    pub meta: Meta,
    pub chapters: Vec<Chapter>,
    pub toc: Vec<TocEntry>,
}

impl Document {
    pub fn texts(&self) -> Vec<&str> {
        self.chapters.iter().map(|c| c.text.as_str()).collect()
    }

    /// Characters per chapter, the base for progress percentages.
    pub fn chapter_chars(&self) -> Vec<usize> {
        self.chapters.iter().map(|c| c.text.chars().count()).collect()
    }

    pub fn words(&self) -> usize {
        self.chapters.iter().map(|c| c.text.split_whitespace().count()).sum()
    }

    /// Fills empty titles and the table of contents for formats without one.
    fn finish(mut self, path: &Path) -> Self {
        if self.meta.title.trim().is_empty() {
            let (title, authors) = title_from_file(&stem(path));
            self.meta.title = title;
            if self.meta.authors.is_empty() {
                self.meta.authors = authors;
            }
        }
        for (i, chapter) in self.chapters.iter_mut().enumerate() {
            if chapter.title.trim().is_empty() {
                chapter.title = self
                    .toc
                    .iter()
                    .find(|entry| entry.chapter == i)
                    .map(|entry| entry.title.clone())
                    .or_else(|| chapter.text.lines().next().map(|line| line.chars().take(80).collect()))
                    .unwrap_or_default();
            }
        }
        if self.toc.is_empty() {
            self.toc = self
                .chapters
                .iter()
                .enumerate()
                .map(|(chapter, c)| TocEntry {
                    title: c.title.clone(),
                    chapter,
                    level: 0,
                    anchor: None,
                    offset: 0,
                })
                .collect();
        }
        for entry in &mut self.toc {
            if let (Some(anchor), Some(chapter)) = (&entry.anchor, self.chapters.get(entry.chapter)) {
                entry.offset = anchor_offset(&chapter.html, anchor).unwrap_or(0);
            }
        }
        if self.kind == Kind::Prose && looks_technical(&self.chapters) {
            self.kind = Kind::Tech;
        }
        self
    }
}

/// The `data-o` of the element with this id, or of the first block after it.
fn anchor_offset(html: &str, anchor: &str) -> Option<usize> {
    let at = html.find(&format!("id=\"{anchor}\""))?;
    let rest = &html[at..];
    let start = rest.find("data-o=\"")? + 8;
    rest[start..].split('"').next()?.parse().ok()
}

fn looks_technical(chapters: &[Chapter]) -> bool {
    chapters.iter().map(|c| c.html.matches("<pre").count()).sum::<usize>() >= 5
}

/// Title and authors from a file name like `Title (Author One, Author Two) (site.org, other.net)`.
/// Trailing groups that name download sites are dropped; a last group of names becomes the authors.
pub fn title_from_file(stem: &str) -> (String, Vec<String>) {
    let mut rest = stem.trim().replace(" (auth.)", "").replace("(auth.)", "");
    let group = regex::Regex::new(r"\s*\(([^()]*)\)\s*$").expect("valid regex");
    let site = regex::Regex::new(r"\w\.(?:[a-z]{2,6})\b").expect("valid regex");
    let mut authors = Vec::new();
    while let Some(c) = group.captures(&rest) {
        let inner = c[1].trim().to_owned();
        let start = c.get(0).expect("whole match").start();
        let numeric = inner.chars().all(|c| c.is_ascii_digit());
        if site.is_match(&inner) || inner.is_empty() || numeric || inner.contains("etc.") && inner.len() < 12 {
            rest.truncate(start);
            continue;
        }
        let names = inner.chars().any(char::is_alphabetic) && !inner.chars().any(|c| c.is_ascii_digit());
        if names && authors.is_empty() && start > 0 {
            authors = inner
                .split([',', ';'])
                .map(|a| {
                    a.trim()
                        .trim_end_matches("(auth.)")
                        .trim()
                        .trim_end_matches("etc.")
                        .trim()
                        .to_owned()
                })
                .filter(|a| !a.is_empty())
                .collect();
            rest.truncate(start);
        }
        break;
    }
    // "ТеорияВероятностей" and "Linear_Algebra" read as words.
    let camel = regex::Regex::new(r"(\p{Ll})(\p{Lu})").expect("valid regex");
    let title = camel.replace_all(&rest.replace('_', " "), "$1 $2").trim().to_owned();
    (if title.is_empty() { stem.to_owned() } else { title }, authors)
}

pub fn stem(path: &Path) -> String {
    path.file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Parses a book file.
pub fn open(path: &Path) -> Result<Document> {
    let format = Format::detect(path).with_context(|| format!("unsupported file type: {}", path.display()))?;
    if !format.supported() {
        bail!("this build has no {format} support");
    }
    let doc = match format {
        #[cfg(feature = "epub")]
        Format::Epub => epub::open(path),
        #[cfg(feature = "markdown")]
        Format::Markdown => markdown::open(path),
        #[cfg(feature = "fb2")]
        Format::Fb2 => fb2::open(path),
        #[cfg(feature = "pdf")]
        Format::Pdf => pdf::open(path),
        Format::Html => html::open(path),
        Format::Txt => txt::open(path),
        #[allow(unreachable_patterns)]
        _ => unreachable!("checked by Format::supported"),
    }
    .with_context(|| format!("cannot read {}", path.display()))?;
    Ok(doc.finish(path))
}

/// Reads a file referenced from inside a book (an image, a stylesheet), by its path in the book.
pub fn resource(path: &Path, name: &str) -> Result<Option<Vec<u8>>> {
    let name = crate::text::join_path("", name);
    match Format::detect(path) {
        #[cfg(feature = "epub")]
        Some(Format::Epub) => epub::resource(path, &name),
        #[cfg(feature = "fb2")]
        Some(Format::Fb2) => fb2::resource(path, &name),
        // Markdown and HTML reference files next to them; join_path keeps `name` inside that folder.
        Some(Format::Markdown | Format::Html) => {
            let file = path.parent().unwrap_or(Path::new(".")).join(name);
            Ok(std::fs::read(file).ok())
        }
        _ => Ok(None),
    }
}

/// The book's own cover image and its MIME type, for EPUB and FB2. PDF covers are drawn by the window.
pub fn cover(path: &Path) -> Result<Option<(Vec<u8>, String)>> {
    match Format::detect(path) {
        #[cfg(feature = "epub")]
        Some(Format::Epub) => epub::cover(path),
        #[cfg(feature = "fb2")]
        Some(Format::Fb2) => fb2::cover(path),
        _ => Ok(None),
    }
}

/// Decodes text that is UTF-8 (with or without BOM) or, failing that, Windows-1251.
// shortcut: the fallback guesses Windows-1251, the common legacy encoding of Russian books; add detection if other encodings show up.
pub fn decode(bytes: &[u8]) -> String {
    let bytes = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes);
    match std::str::from_utf8(bytes) {
        Ok(text) => text.to_owned(),
        Err(_) => encoding_rs::WINDOWS_1251.decode(bytes).0.into_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_cp1251() {
        let (bytes, _, _) = encoding_rs::WINDOWS_1251.encode("Привет");
        assert_eq!(decode(&bytes), "Привет");
        assert_eq!(decode("\u{feff}Да".as_bytes()), "Да");
    }

    #[test]
    fn titles_from_file_names() {
        assert_eq!(
            title_from_file("Naive Set Theory (Paul R. Halmos) (z-library.sk, 1lib.sk, z-lib.sk)"),
            ("Naive Set Theory".to_owned(), vec!["Paul R. Halmos".to_owned()])
        );
        assert_eq!(
            title_from_file("Метод координат (Гельфанд Израиль Моисеевич etc.) (z-library.sk, 1lib.sk, z-lib.sk)"),
            (
                "Метод координат".to_owned(),
                vec!["Гельфанд Израиль Моисеевич".to_owned()]
            )
        );
        assert_eq!(
            title_from_file("Rust в действии ( etc.) (z-library.sk, 1lib.sk, z-lib.sk)").0,
            "Rust в действии"
        );
        assert_eq!(title_from_file("Матан"), ("Матан".to_owned(), vec![]));
        assert_eq!(
            title_from_file("ЗадачиПоЛинейнойАлгебре").0,
            "Задачи По Линейной Алгебре"
        );
        assert_eq!(
            title_from_file(
                "Complex Numbers from A to ... Z, 2nd Edition (Titu Andreescu, Dorin Andrica (auth.)) (z-library.sk, 1lib.sk, z-lib.sk)"
            ),
            (
                "Complex Numbers from A to ... Z, 2nd Edition".to_owned(),
                vec!["Titu Andreescu".to_owned(), "Dorin Andrica".to_owned()]
            )
        );
        assert_eq!(
            title_from_file("Грокаем алгоритмы. 2-е изд. (Адитья Бхаргава) (z-library.sk, 1lib.sk, z-lib.sk)(1)").1,
            ["Адитья Бхаргава"]
        );
        assert_eq!(title_from_file("Go идиомы, 2-е изд (Джон Боднер)").1, ["Джон Боднер"]);
    }

    #[test]
    fn detects_formats() {
        assert_eq!(Format::detect(Path::new("a/B.EPUB")), Some(Format::Epub));
        assert_eq!(Format::detect(Path::new("notes.md")), Some(Format::Markdown));
        assert_eq!(Format::detect(Path::new("x.doc")), None);
    }
}
