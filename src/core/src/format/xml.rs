//! Small helpers over quick-xml shared by the EPUB and FB2 readers.

use quick_xml::XmlVersion;
use quick_xml::events::{BytesRef, BytesStart};

pub fn attr(tag: &BytesStart, name: &str) -> Option<String> {
    tag.attributes()
        .flatten()
        .find(|a| a.key.local_name().as_ref() == name)
        .and_then(|a| a.normalized_value(XmlVersion::Implicit1_0).ok().map(|v| v.into_owned()))
}

pub fn local(tag: &BytesStart) -> String {
    tag.local_name().as_ref().to_owned()
}

/// Character of an entity reference: the five XML entities, `&nbsp;` and numeric references.
pub fn entity(entity: &BytesRef) -> Option<char> {
    if let Ok(Some(ch)) = entity.resolve_char_ref() {
        return Some(ch);
    }
    match entity.as_ref() {
        "amp" => Some('&'),
        "lt" => Some('<'),
        "gt" => Some('>'),
        "quot" => Some('"'),
        "apos" => Some('\''),
        "nbsp" => Some('\u{a0}'),
        _ => None,
    }
}

/// Decodes `%20`-style escapes in archive paths.
pub fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && let Some(byte) = s.get(i + 1..i + 3).and_then(|hex| u8::from_str_radix(hex, 16).ok())
        {
            out.push(byte);
            i += 3;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
