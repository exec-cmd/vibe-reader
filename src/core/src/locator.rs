//! Format-independent addresses inside a book: chapter, offset in normalized text, anchor quote.

use std::fmt;
use std::str::FromStr;

use anyhow::{Context, Error, bail};
use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// Length of the anchor quote stored next to a locator, in characters.
pub const QUOTE_LEN: usize = 40;

/// A point in a book. Written as `ch:N` or `ch:N:OFFSET`, chapters start at 1.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default)]
pub struct Locator {
    /// Zero-based chapter index.
    pub chapter: usize,
    /// Offset in the chapter's normalized text, in characters.
    pub offset: usize,
}

impl Locator {
    pub fn new(chapter: usize, offset: usize) -> Self {
        Self { chapter, offset }
    }

    /// Text of `QUOTE_LEN` characters starting at this locator.
    pub fn quote(&self, chapter_text: &str) -> String {
        chapter_text.chars().skip(self.offset).take(QUOTE_LEN).collect()
    }

    /// Finds the place again after the file changed: exact match, then the quote closest
    /// to the old offset in the same chapter, then in any chapter, then the clamped locator.
    pub fn resolve(&self, chapters: &[&str], quote: &str) -> Locator {
        let Some(last) = chapters.len().checked_sub(1) else {
            return Locator::default();
        };
        let clamped = {
            let chapter = self.chapter.min(last);
            let len = chapters[chapter].chars().count();
            Locator::new(chapter, self.offset.min(len))
        };
        if quote.is_empty() {
            return clamped;
        }
        if let Some(text) = chapters.get(self.chapter) {
            if self.quote(text) == quote {
                return *self;
            }
            if let Some(offset) = nearest(text, quote, self.offset) {
                return Locator::new(self.chapter, offset);
            }
        }
        chapters
            .iter()
            .enumerate()
            .find_map(|(i, text)| nearest(text, quote, 0).map(|offset| Locator::new(i, offset)))
            .unwrap_or(clamped)
    }
}

/// Character offset of the occurrence of `needle` closest to `near`.
fn nearest(text: &str, needle: &str, near: usize) -> Option<usize> {
    text.match_indices(needle)
        .map(|(byte, _)| text[..byte].chars().count())
        .min_by_key(|offset| offset.abs_diff(near))
}

impl fmt::Display for Locator {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "ch:{}:{}", self.chapter + 1, self.offset)
    }
}

impl FromStr for Locator {
    type Err = Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let rest = s
            .trim()
            .strip_prefix("ch:")
            .context("locator must look like ch:3 or ch:3:120")?;
        let (chapter, offset) = rest.split_once(':').unwrap_or((rest, "0"));
        let chapter: usize = chapter.parse().context("chapter must be a number")?;
        if chapter == 0 {
            bail!("chapters start at 1");
        }
        let offset = offset.parse().context("offset must be a number")?;
        Ok(Locator::new(chapter - 1, offset))
    }
}

impl Serialize for Locator {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_str(self)
    }
}

impl<'de> Deserialize<'de> for Locator {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        String::deserialize(deserializer)?
            .parse()
            .map_err(serde::de::Error::custom)
    }
}

/// A span between two locators, written `A..B`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Span {
    pub start: Locator,
    pub end: Locator,
}

impl FromStr for Span {
    type Err = Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let (start, end) = s.split_once("..").context("range must look like ch:1:0..ch:1:500")?;
        let (start, end): (Locator, Locator) = (start.parse()?, end.parse()?);
        if end < start {
            bail!("range end is before its start");
        }
        Ok(Span { start, end })
    }
}

impl fmt::Display for Span {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}..{}", self.start, self.end)
    }
}

/// Byte index of the `chars`-th character, or the end of the string.
pub fn byte_index(text: &str, chars: usize) -> usize {
    text.char_indices().nth(chars).map_or(text.len(), |(i, _)| i)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_prints() {
        assert_eq!("ch:3".parse::<Locator>().unwrap(), Locator::new(2, 0));
        assert_eq!("ch:3:120".parse::<Locator>().unwrap().to_string(), "ch:3:120");
        assert!("ch:0".parse::<Locator>().is_err());
        assert!("3:1".parse::<Locator>().is_err());
        let span: Span = "ch:1:5..ch:2".parse().unwrap();
        assert_eq!(span.to_string(), "ch:1:5..ch:2:0");
        assert!("ch:2..ch:1".parse::<Span>().is_err());
    }

    #[test]
    fn resolves_after_edit() {
        let old = ["Начало. Он шёл медленно, как бы в нерешимости."];
        let at = Locator::new(0, 8);
        let quote = at.quote(old[0]);
        assert_eq!(at.resolve(&old, &quote), at);

        let edited = ["Новое вступление. Начало. Он шёл медленно, как бы в нерешимости."];
        assert_eq!(at.resolve(&edited, &quote), Locator::new(0, 26));

        let moved = ["Другое.", "Он шёл медленно, как бы в нерешимости."];
        assert_eq!(at.resolve(&moved, &quote), Locator::new(1, 0));

        let gone = ["Совсем другой текст."];
        assert_eq!(Locator::new(4, 999).resolve(&gone, &quote), Locator::new(0, 20));
    }
}
