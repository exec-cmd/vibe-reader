//! Images people and agents attach to books: covers and illustrations.

use anyhow::{Context, Result, bail};

/// Largest accepted image.
pub const MAX_IMAGE: u64 = 10 * 1024 * 1024;

/// Raster formats by magic bytes; SVG only without scripts, event handlers or external references.
pub fn image_type(bytes: &[u8]) -> Result<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Ok("png");
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Ok("jpg");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Ok("gif");
    }
    if bytes.len() > 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Ok("webp");
    }
    let text = std::str::from_utf8(bytes).context("unsupported image type; use PNG, JPEG, WebP, GIF or SVG")?;
    let lower = text.to_lowercase();
    if !lower.contains("<svg") {
        bail!("unsupported image type; use PNG, JPEG, WebP, GIF or SVG");
    }
    let unsafe_svg = [
        "<script",
        "javascript:",
        "<foreignobject",
        "href=\"http",
        "href='http",
        "href=\"//",
        "@import",
        "url(http",
    ];
    if unsafe_svg.iter().any(|s| lower.contains(s)) || has_event_handler(&lower) {
        bail!("SVG with scripts, event handlers or external references is not accepted");
    }
    Ok("svg")
}

fn has_event_handler(svg: &str) -> bool {
    svg.match_indices(" on").any(|(i, _)| {
        let rest = &svg[i + 3..];
        let name_len = rest.chars().take_while(|c| c.is_ascii_alphabetic()).count();
        name_len > 0 && rest[name_len..].trim_start().starts_with('=')
    })
}

pub fn mime(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "jpg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/svg+xml",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checks_images() {
        assert_eq!(image_type(b"\x89PNG\r\n\x1a\nrest").unwrap(), "png");
        assert_eq!(
            image_type(br#"<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>"#).unwrap(),
            "svg"
        );
        assert!(image_type(b"<svg><script>alert(1)</script></svg>").is_err());
        assert!(image_type(br#"<svg><rect onload = "x()"/></svg>"#).is_err());
        assert!(image_type(br#"<svg><image href="https://evil/x.png"/></svg>"#).is_err());
        assert!(image_type(b"plain text").is_err());
    }
}
