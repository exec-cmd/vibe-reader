//! Sanitized chapter HTML and the normalized text that locators count in.
//!
//! Normalization rules, mirrored by `src/gui/ui/offsets.js`:
//! - offsets count Unicode scalar values;
//! - outside `<pre>`, runs of ASCII whitespace collapse to one space, and leading spaces of a line drop;
//! - every block element starts on a new line, and `<br>` ends one;
//! - each block element gets `data-o` with the offset of its first character.

use std::borrow::Cow;
use std::collections::HashSet;

use ammonia::{Builder, UrlRelative, UrlRelativeEvaluate};
use quick_xml::events::{BytesRef, BytesStart, Event};
use quick_xml::{Reader, Writer};

/// URL prefix under which the GUI serves files from inside the open book.
pub const RESOURCE_PREFIX: &str = "/res/";
/// Prefix added to book `id` attributes so they never collide with UI ids.
pub const ID_PREFIX: &str = "b-";

const BLOCKS: &[&str] = &[
    "address",
    "article",
    "aside",
    "blockquote",
    "caption",
    "dd",
    "details",
    "div",
    "dl",
    "dt",
    "figcaption",
    "figure",
    "footer",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hgroup",
    "hr",
    "li",
    "nav",
    "ol",
    "p",
    "pre",
    "section",
    "summary",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "ul",
];

const MATHML: &[&str] = &[
    "math",
    "maction",
    "annotation",
    "menclose",
    "merror",
    "mfenced",
    "mfrac",
    "mi",
    "mmultiscripts",
    "mn",
    "mo",
    "mover",
    "mpadded",
    "mphantom",
    "mprescripts",
    "mroot",
    "mrow",
    "ms",
    "mspace",
    "msqrt",
    "mstyle",
    "msub",
    "msubsup",
    "msup",
    "mtable",
    "mtd",
    "mtext",
    "mtr",
    "munder",
    "munderover",
    "semantics",
];

/// Chapter content ready for the webview and for agents.
#[derive(Debug, Clone, Default)]
pub struct Prepared {
    pub html: String,
    pub text: String,
}

/// Sanitizes `raw` and annotates it with block offsets.
///
/// `base` is the directory of the chapter inside the book (`OEBPS/text/`), used to resolve
/// relative links and images to `/res/<path>`.
pub fn prepare(raw: &str, base: &str) -> Prepared {
    let mut builder = Builder::default();
    builder
        .add_tags(["section", "s"])
        .add_tags(MATHML)
        .add_generic_attributes(["id", "lang", "dir"])
        .add_tag_attributes("math", ["display", "xmlns"])
        .add_tag_attributes("mo", ["stretchy", "fence", "separator"])
        .add_tag_attributes("mtd", ["columnspan", "rowspan"])
        .add_tag_attributes("code", ["class"])
        .add_tag_attributes("span", ["class"])
        .add_tag_attributes("div", ["class"])
        .attribute_filter(|_, attr, value| match attr {
            "class" => keep_classes(value),
            _ => Some(value.into()),
        })
        // shortcut: drops inline SVG entirely, including SVG-wrapped cover images; convert <svg><image> to <img> if covers matter.
        .clean_content_tags(HashSet::from([
            "script", "style", "title", "head", "noscript", "template", "svg",
        ]))
        .url_schemes(HashSet::from(["http", "https", "mailto"]))
        .url_relative(UrlRelative::Custom(Box::new(Rewriter(base.to_owned()))))
        .id_prefix(Some(ID_PREFIX));
    let clean = builder.clean(raw).to_string();
    let mut normalizer = Normalizer::default();
    match normalizer.annotate(&clean) {
        Ok(html) => Prepared {
            html,
            text: normalizer.out,
        },
        // Unreachable for serializer output; keep the page readable without offsets.
        Err(_) => Prepared {
            html: clean,
            text: normalizer.out,
        },
    }
}

/// Plain text to HTML paragraphs, used by TXT and as a fallback.
pub fn paragraphs_to_html(text: &str) -> String {
    let mut html = String::new();
    for para in text.split("\n\n").map(str::trim).filter(|p| !p.is_empty()) {
        html.push_str("<p>");
        html.push_str(&escape(para).replace('\n', "<br>"));
        html.push_str("</p>\n");
    }
    html
}

pub fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Classes that the UI understands: code languages and math markers.
fn keep_classes(value: &str) -> Option<Cow<'_, str>> {
    let kept: Vec<&str> = value
        .split_whitespace()
        .filter(|class| class.starts_with("language-") || class.starts_with("math"))
        .collect();
    (!kept.is_empty()).then(|| kept.join(" ").into())
}

struct Rewriter(String);

impl UrlRelativeEvaluate<'_> for Rewriter {
    fn evaluate<'url>(&self, url: &'url str) -> Option<Cow<'url, str>> {
        Some(rewrite_url(&self.0, url).into())
    }
}

fn rewrite_url(base: &str, url: &str) -> String {
    let (path, fragment) = url.split_once('#').unwrap_or((url, ""));
    let fragment = if fragment.is_empty() {
        String::new()
    } else {
        format!("#{ID_PREFIX}{fragment}")
    };
    if path.is_empty() {
        return fragment;
    }
    format!("{RESOURCE_PREFIX}{}{fragment}", join_path(base, path))
}

/// Resolves `rel` against directory `base` inside an archive, dropping `.` and `..`.
pub fn join_path(base: &str, rel: &str) -> String {
    let mut parts: Vec<&str> = if rel.starts_with('/') {
        Vec::new()
    } else {
        base.split('/').collect()
    };
    for part in rel.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            part => parts.push(part),
        }
    }
    parts.retain(|p| !p.is_empty());
    parts.join("/")
}

#[derive(Default)]
struct Normalizer {
    out: String,
    len: usize,
    pending_space: bool,
    need_newline: bool,
}

impl Normalizer {
    /// Streams over sanitized HTML, adds `data-o` to blocks and collects the text.
    fn annotate(&mut self, html: &str) -> quick_xml::Result<String> {
        let mut reader = Reader::from_str(html);
        reader.config_mut().check_end_names = false;
        let mut writer = Writer::new(Vec::with_capacity(html.len() + html.len() / 8));
        let mut pre_depth = 0usize;
        loop {
            match reader.read_event()? {
                Event::Start(tag) => {
                    let name = tag.local_name().as_ref().to_owned();
                    let name = name.as_str();
                    if name == "pre" {
                        pre_depth += 1;
                    }
                    let tag = self.open(tag, name);
                    // `hr` is the only void block and never gets an end tag.
                    if name == "hr" {
                        self.need_newline = true;
                    }
                    writer.write_event(Event::Start(tag))?;
                }
                Event::Empty(tag) => {
                    let name = tag.local_name().as_ref().to_owned();
                    let tag = self.open(tag, &name);
                    if is_block(&name) {
                        self.need_newline = true;
                    }
                    writer.write_event(Event::Empty(tag))?;
                }
                Event::End(tag) => {
                    let name = tag.local_name();
                    if name.as_ref() == "pre" {
                        pre_depth = pre_depth.saturating_sub(1);
                    }
                    if is_block(name.as_ref()) {
                        self.need_newline = true;
                    }
                    writer.write_event(Event::End(tag))?;
                }
                Event::Text(text) => {
                    self.text(&text.html_content(), pre_depth > 0);
                    writer.write_event(Event::Text(text))?;
                }
                Event::GeneralRef(entity) => {
                    if let Some(ch) = resolve_entity(&entity) {
                        self.text(ch.encode_utf8(&mut [0; 4]), pre_depth > 0);
                    }
                    writer.write_event(Event::GeneralRef(entity))?;
                }
                Event::Eof => break,
                other => writer.write_event(other)?,
            }
        }
        Ok(String::from_utf8(writer.into_inner()).expect("input was UTF-8"))
    }

    fn open<'a>(&mut self, mut tag: BytesStart<'a>, name: &str) -> BytesStart<'a> {
        if name == "br" {
            self.need_newline = true;
        } else if is_block(name) {
            self.start_block();
            tag.push_attribute(("data-o", self.len.to_string().as_str()));
        }
        tag
    }

    fn start_block(&mut self) {
        if !self.out.is_empty() && !self.out.ends_with('\n') {
            self.push('\n');
        }
        self.pending_space = false;
        self.need_newline = false;
    }

    fn text(&mut self, text: &str, in_pre: bool) {
        for ch in text.chars() {
            if !in_pre && is_space(ch) {
                self.pending_space = true;
                continue;
            }
            if self.need_newline {
                self.start_block();
            }
            if self.pending_space && !self.out.is_empty() && !self.out.ends_with([' ', '\n']) {
                self.push(' ');
            }
            self.pending_space = false;
            self.push(ch);
        }
    }

    fn push(&mut self, ch: char) {
        self.out.push(ch);
        self.len += 1;
    }
}

fn is_block(name: &str) -> bool {
    BLOCKS.contains(&name)
}

/// The html5ever serializer only emits these named entities.
fn resolve_entity(entity: &BytesRef) -> Option<char> {
    if let Ok(Some(ch)) = entity.resolve_char_ref() {
        return Some(ch);
    }
    match entity.as_ref() {
        "amp" => Some('&'),
        "lt" => Some('<'),
        "gt" => Some('>'),
        "quot" => Some('"'),
        "nbsp" => Some('\u{a0}'),
        _ => None,
    }
}

/// HTML collapses only ASCII whitespace; NBSP stays as content.
fn is_space(ch: char) -> bool {
    matches!(ch, ' ' | '\t' | '\n' | '\r' | '\x0c')
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Shared vectors; `offsets.js` must produce the same text and offsets.
    const CASES: &[(&str, &str)] = &[
        ("<p>Hello   <b>big</b>\n world</p>", "Hello big world"),
        ("<p>One</p><p>Two</p>", "One\nTwo"),
        ("<div><p>a</p>tail</div>", "a\ntail"),
        ("<p>line<br>next</p>", "line\nnext"),
        (
            "<pre>fn main() {\n    x\n}</pre><p>after</p>",
            "fn main() {\n    x\n}\nafter",
        ),
        ("<p>  lead</p>", "lead"),
        ("<p>a\u{a0}b</p>", "a\u{a0}b"),
        ("<h1>Т</h1><ul><li>один</li><li>два</li></ul>", "Т\nодин\nдва"),
    ];

    #[test]
    fn normalizes_text() {
        for (html, text) in CASES {
            assert_eq!(prepare(html, "").text, *text, "input: {html}");
        }
    }

    #[test]
    fn annotates_block_offsets() {
        let out = prepare("<p>One</p><p>Двa</p>", "");
        assert!(out.html.contains(r#"<p data-o="0">One</p>"#), "{}", out.html);
        assert!(out.html.contains(r#"<p data-o="4">Двa</p>"#), "{}", out.html);
    }

    #[test]
    fn strips_scripts_and_handlers() {
        let out = prepare(
            r#"<p onclick="x()">a<script>alert(1)</script><img src="x.png" onerror="y()"></p>"#,
            "OEBPS/",
        );
        assert!(!out.html.contains("script") && !out.html.contains("onclick") && !out.html.contains("onerror"));
        assert!(out.html.contains(r#"src="/res/OEBPS/x.png""#), "{}", out.html);
    }

    #[test]
    fn rewrites_links_and_ids() {
        let out = prepare(
            r##"<p id="n1"><a href="../text/ch2.xhtml#n2">x</a><a href="#n1">y</a></p>"##,
            "OEBPS/images",
        );
        assert!(out.html.contains(r#"id="b-n1""#), "{}", out.html);
        assert!(
            out.html.contains(r#"href="/res/OEBPS/text/ch2.xhtml#b-n2""#),
            "{}",
            out.html
        );
        assert!(out.html.contains(r##"href="#b-n1""##), "{}", out.html);
    }

    #[test]
    fn keeps_mathml_and_code_language() {
        let out = prepare(
            r#"<math display="block"><mi>x</mi></math><pre><code class="language-rust evil">x</code></pre>"#,
            "",
        );
        assert!(out.html.contains("<mi>x</mi>"), "{}", out.html);
        assert!(out.html.contains(r#"class="language-rust""#), "{}", out.html);
    }

    #[test]
    fn joins_paths() {
        assert_eq!(join_path("OEBPS/text", "../img/a.png"), "OEBPS/img/a.png");
        assert_eq!(join_path("", "a.png"), "a.png");
        assert_eq!(join_path("x/", "/abs.png"), "abs.png");
    }
}
