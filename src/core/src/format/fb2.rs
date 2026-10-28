//! FB2 (FictionBook 2): top-level sections of the main body become chapters, note bodies a
//! chapter of their own, and `<binary>` images are served as resources by their id.

use std::collections::HashMap;
use std::path::Path;

use anyhow::{Result, bail};
use quick_xml::Reader;
use quick_xml::events::Event;
use regex::Regex;

use super::xml::{attr, entity, local};
use super::{Chapter, Document, Format, Kind, Meta, TocEntry};
use crate::text::{self, ID_PREFIX, escape};

/// Chapter paths are synthetic; links between chapters point at them.
fn chapter_path(i: usize) -> String {
    format!("fb2/{i}")
}

/// Reads the file and decodes it by the encoding its XML declaration names.
fn source(path: &Path) -> Result<String> {
    let bytes = std::fs::read(path)?;
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(200)]).into_owned();
    let label = Regex::new(r#"encoding=["']([\w-]+)["']"#)?
        .captures(&head)
        .map(|c| c[1].to_owned());
    match label
        .as_deref()
        .and_then(|l| encoding_rs::Encoding::for_label(l.as_bytes()))
    {
        Some(enc) => Ok(enc.decode(&bytes).0.into_owned()),
        None => Ok(super::decode(&bytes)),
    }
}

#[derive(Default)]
struct Builder {
    chapters: Vec<(String, String)>,
    html: String,
    title: String,
    /// Main body, a notes body, or outside any body.
    body: usize,
    notes_body: bool,
    section_depth: usize,
    in_title: bool,
    title_lines: usize,
    title_text: String,
    /// Id of each open section, to anchor nested titles in the table of contents.
    section_ids: Vec<String>,
    toc: Vec<TocEntry>,
    next_id: usize,
}

impl Builder {
    fn flush(&mut self) {
        if !self.html.trim().is_empty() {
            let html = std::mem::take(&mut self.html);
            self.chapters.push((std::mem::take(&mut self.title), html));
        }
        self.html.clear();
        self.title.clear();
    }
}

pub fn open(path: &Path) -> Result<Document> {
    let xml = source(path)?;
    let mut reader = Reader::from_str(&xml);
    reader.config_mut().check_end_names = false;
    let mut meta = Meta::default();
    let mut b = Builder::default();
    let mut in_description = false;
    let mut in_binary = false;
    let mut meta_field: Option<String> = None;
    let mut author = Vec::new();
    let mut meta_text = String::new();

    loop {
        let event = reader.read_event()?;
        match event {
            Event::Start(e) => {
                let name = local(&e);
                match name.as_str() {
                    "description" => in_description = true,
                    "binary" => in_binary = true,
                    _ if in_description => {
                        if matches!(
                            name.as_str(),
                            "book-title" | "lang" | "first-name" | "middle-name" | "last-name"
                        ) {
                            meta_field = Some(name.clone());
                            meta_text.clear();
                        }
                    }
                    "body" => {
                        b.flush();
                        b.body += 1;
                        b.notes_body = b.body > 1 || attr(&e, "name").is_some();
                        if b.notes_body {
                            b.title = attr(&e, "name").unwrap_or_else(|| "Notes".into());
                            b.toc.push(TocEntry {
                                title: b.title.clone(),
                                chapter: b.chapters.len(),
                                level: 0,
                                anchor: None,
                                offset: 0,
                            });
                        }
                    }
                    "section" => {
                        b.section_depth += 1;
                        if b.section_depth == 1 && !b.notes_body {
                            b.flush();
                        }
                        let id = attr(&e, "id").unwrap_or_else(|| {
                            b.next_id += 1;
                            format!("fb2-s{}", b.next_id)
                        });
                        b.html.push_str(&format!("<section id=\"{}\">", escape(&id)));
                        b.section_ids.push(id);
                    }
                    "title" => {
                        b.in_title = true;
                        b.title_lines = 0;
                        b.title_text.clear();
                        let level = (b.section_depth + 1).min(4);
                        b.html.push_str(&format!("<h{level}>"));
                    }
                    "p" if b.in_title => {
                        if b.title_lines > 0 {
                            b.html.push_str("<br>");
                            b.title_text.push(' ');
                        }
                        b.title_lines += 1;
                    }
                    "a" => {
                        let href = attr(&e, "href").unwrap_or_default();
                        b.html.push_str(&format!("<a href=\"{}\">", escape(&href)));
                    }
                    "image" => image(&e, &mut b.html),
                    other => b.html.push_str(open_tag(other)),
                }
            }
            Event::Empty(e) => {
                let name = local(&e);
                match name.as_str() {
                    "image" if !in_description => image(&e, &mut b.html),
                    "empty-line" => b.html.push_str("<br>"),
                    _ => {}
                }
            }
            Event::End(e) => {
                let name = e.local_name().as_ref().to_owned();
                match name.as_str() {
                    "description" => in_description = false,
                    "binary" => in_binary = false,
                    _ if in_description => {
                        match (meta_field.take().as_deref(), meta_text.trim()) {
                            (Some("book-title"), t) => meta.title = t.to_owned(),
                            (Some("lang"), t) => meta.language = Some(t.to_owned()),
                            (Some(_), t) if !t.is_empty() => author.push(t.to_owned()),
                            _ => {}
                        }
                        if name == "author" && !author.is_empty() {
                            meta.authors.push(author.join(" "));
                            author.clear();
                        }
                    }
                    "body" => b.flush(),
                    "section" => {
                        b.html.push_str("</section>");
                        b.section_depth = b.section_depth.saturating_sub(1);
                        b.section_ids.pop();
                    }
                    "title" => {
                        b.in_title = false;
                        let level = (b.section_depth + 1).min(4);
                        b.html.push_str(&format!("</h{level}>"));
                        let title = b.title_text.split_whitespace().collect::<Vec<_>>().join(" ");
                        let chapter = b.chapters.len();
                        if b.title.is_empty() {
                            b.title = title.clone();
                            b.toc.push(TocEntry {
                                title,
                                chapter,
                                level: 0,
                                anchor: None,
                                offset: 0,
                            });
                        } else if b.section_depth >= 2 && !b.notes_body {
                            let anchor = b.section_ids.last().map(|id| format!("{ID_PREFIX}{id}"));
                            b.toc.push(TocEntry {
                                title,
                                chapter,
                                level: b.section_depth - 1,
                                anchor,
                                offset: 0,
                            });
                        }
                    }
                    "p" if b.in_title => {}
                    "a" => b.html.push_str("</a>"),
                    other => b.html.push_str(close_tag(other)),
                }
            }
            Event::Text(t) if !in_binary => {
                let text = t.xml10_content();
                if in_description {
                    meta_text.push_str(&text);
                } else if b.body > 0 {
                    if b.in_title {
                        b.title_text.push_str(&text);
                    }
                    b.html.push_str(&escape(&text));
                }
            }
            Event::GeneralRef(r) if !in_binary => {
                if let Some(ch) = entity(&r) {
                    if in_description {
                        meta_text.push(ch);
                    } else if b.body > 0 {
                        b.html.push_str(&escape(&ch.to_string()));
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    b.flush();
    if b.chapters.is_empty() {
        bail!("no text in this FB2 file");
    }

    // Footnote links point at ids in other chapters; give them the chapter's path.
    let id_re = Regex::new(r#"id="([^"]+)""#)?;
    let mut home: HashMap<String, usize> = HashMap::new();
    for (i, (_, html)) in b.chapters.iter().enumerate() {
        for c in id_re.captures_iter(html) {
            home.entry(c[1].to_owned()).or_insert(i);
        }
    }
    let href_re = Regex::new(r##"href="#([^"]+)""##)?;
    let chapters = b
        .chapters
        .into_iter()
        .enumerate()
        .map(|(i, (title, html))| {
            let html = href_re.replace_all(&html, |c: &regex::Captures| match home.get(&c[1]) {
                Some(&j) if j != i => format!("href=\"{}#{}\"", chapter_path(j), &c[1]),
                _ => c[0].to_owned(),
            });
            let prepared = text::prepare(&html, "");
            Chapter {
                title,
                path: chapter_path(i),
                html: prepared.html,
                text: prepared.text,
            }
        })
        .collect();
    Ok(Document {
        format: Format::Fb2,
        kind: Kind::Prose,
        meta,
        chapters,
        toc: b.toc,
    })
}

/// FB2 element to the HTML that shows it.
fn open_tag(name: &str) -> &'static str {
    match name {
        "p" | "v" => "<p>",
        "emphasis" => "<em>",
        "strong" => "<strong>",
        "strikethrough" => "<s>",
        "sub" => "<sub>",
        "sup" => "<sup>",
        "code" => "<code>",
        "subtitle" => "<h5>",
        "epigraph" | "cite" => "<blockquote>",
        "poem" | "stanza" => "<div>",
        "text-author" => "<p><em>",
        "table" => "<table>",
        "tr" => "<tr>",
        "td" => "<td>",
        "th" => "<th>",
        _ => "",
    }
}

fn close_tag(name: &str) -> &'static str {
    match name {
        "p" | "v" => "</p>",
        "emphasis" => "</em>",
        "strong" => "</strong>",
        "strikethrough" => "</s>",
        "sub" => "</sub>",
        "sup" => "</sup>",
        "code" => "</code>",
        "subtitle" => "</h5>",
        "epigraph" | "cite" => "</blockquote>",
        "poem" | "stanza" => "</div>",
        "text-author" => "</em></p>",
        "table" => "</table>",
        "tr" => "</tr>",
        "td" => "</td>",
        "th" => "</th>",
        _ => "",
    }
}

/// `<image l:href="#cover.jpg"/>` refers to a `<binary id="cover.jpg">`.
fn image(tag: &quick_xml::events::BytesStart, html: &mut String) {
    if let Some(href) = attr(tag, "href") {
        let id = href.trim_start_matches('#');
        html.push_str(&format!("<img src=\"{}\" alt=\"\">", escape(id)));
    }
}

/// Decodes the `<binary>` with this id.
pub fn resource(path: &Path, name: &str) -> Result<Option<Vec<u8>>> {
    let xml = source(path)?;
    let mut reader = Reader::from_str(&xml);
    let mut inside = false;
    let mut data = String::new();
    loop {
        match reader.read_event()? {
            Event::Start(e) if local(&e) == "binary" => inside = attr(&e, "id").as_deref() == Some(name),
            Event::Text(t) if inside => data.push_str(&t.xml10_content()),
            Event::End(e) if inside && e.local_name().as_ref() == "binary" => return Ok(base64(&data)),
            Event::Eof => return Ok(None),
            _ => {}
        }
    }
}

/// Standard base64, ignoring whitespace. `None` on invalid input.
fn base64(text: &str) -> Option<Vec<u8>> {
    let value = |c: u8| match c {
        b'A'..=b'Z' => Some(c - b'A'),
        b'a'..=b'z' => Some(c - b'a' + 26),
        b'0'..=b'9' => Some(c - b'0' + 52),
        b'+' => Some(62),
        b'/' => Some(63),
        _ => None,
    };
    let mut out = Vec::with_capacity(text.len() * 3 / 4);
    let (mut buf, mut bits) = (0u32, 0u32);
    for c in text.bytes().filter(|c| !c.is_ascii_whitespace() && *c != b'=') {
        buf = (buf << 6) | u32::from(value(c)?);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    const BOOK: &str = r##"<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
<description><title-info><author><first-name>Фёдор</first-name><last-name>Достоевский</last-name></author>
<book-title>Преступление и наказание</book-title><lang>ru</lang></title-info></description>
<body><title><p>Преступление и наказание</p></title>
<section><title><p>Часть первая</p><p>I</p></title>
<epigraph><p>Эпиграф</p></epigraph>
<p>В начале июля<a l:href="#n1" type="note">1</a>, в <emphasis>чрезвычайно</emphasis> жаркое время.</p>
<empty-line/><image l:href="#pic.png"/>
<section><title><p>Подглава</p></title><p>Вложенный текст.</p></section>
</section>
<section><title><p>Часть вторая</p></title><p>Дальше.</p></section>
</body>
<body name="notes"><section id="n1"><title><p>1</p></title><p>Примечание.</p></section></body>
<binary id="pic.png" content-type="image/png">iVBORw0KGgo=</binary>
</FictionBook>"##;

    #[test]
    fn reads_fb2() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("book.fb2");
        std::fs::write(&file, BOOK).unwrap();
        let doc = crate::format::open(&file).unwrap();
        assert_eq!(doc.meta.title, "Преступление и наказание");
        assert_eq!(doc.meta.authors, ["Фёдор Достоевский"]);
        assert_eq!(doc.meta.language.as_deref(), Some("ru"));
        // Body title, two parts, notes.
        let titles: Vec<&str> = doc.chapters.iter().map(|c| c.title.as_str()).collect();
        assert_eq!(
            titles,
            ["Преступление и наказание", "Часть первая I", "Часть вторая", "notes"]
        );
        let part = &doc.chapters[1];
        assert!(
            part.text.contains("В начале июля1, в чрезвычайно жаркое время."),
            "{}",
            part.text
        );
        assert!(part.text.contains("Вложенный текст."));
        assert!(part.html.contains(r#"href="/res/fb2/3#b-n1""#), "{}", part.html);
        assert!(part.html.contains(r#"src="/res/pic.png""#), "{}", part.html);
        let toc: Vec<(&str, usize, usize)> = doc.toc.iter().map(|e| (e.title.as_str(), e.chapter, e.level)).collect();
        assert_eq!(
            toc,
            [
                ("Преступление и наказание", 0, 0),
                ("Часть первая I", 1, 0),
                ("Подглава", 1, 1),
                ("Часть вторая", 2, 0),
                ("notes", 3, 0)
            ]
        );
        assert_eq!(doc.toc[2].anchor.as_deref(), Some("b-fb2-s2"));
        let sub = &doc.chapters[1].text;
        assert!(
            sub.chars()
                .skip(doc.toc[2].offset)
                .collect::<String>()
                .starts_with("Подглава"),
            "{}",
            doc.toc[2].offset
        );
        assert_eq!(
            crate::format::resource(&file, "pic.png").unwrap().unwrap(),
            b"\x89PNG\r\n\x1a\n"
        );
    }

    #[test]
    fn reads_windows_1251() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("old.fb2");
        let xml = BOOK.replace("encoding=\"utf-8\"", "encoding=\"windows-1251\"");
        std::fs::write(&file, encoding_rs::WINDOWS_1251.encode(&xml).0).unwrap();
        assert_eq!(
            crate::format::open(&file).unwrap().meta.title,
            "Преступление и наказание"
        );
    }

    #[test]
    fn decodes_base64() {
        assert_eq!(super::base64("aGVs\nbG8=").unwrap(), b"hello");
        assert!(super::base64("**").is_none());
    }
}
