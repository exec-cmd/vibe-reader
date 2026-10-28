//! Atmosphere profiles: a declarative look for a book, a chapter or a scene.
//!
//! A profile is TOML or JSON with a fixed schema; free CSS is not part of it. Profiles stack:
//! the reader's default preset, then the book, the chapter and the range around the position.
//! A layer with `base` starts over from that preset; any other field overrides the layers below.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::config::FONTS;
use crate::store::{Atmosphere, Scope};
use crate::{Locator, Paths};

pub const SCHEMA_VERSION: u32 = 1;
/// WCAG AA for body text.
pub const MIN_TEXT_CONTRAST: f64 = 4.5;
/// Links and accents must stay visible against the paper.
pub const MIN_ACCENT_CONTRAST: f64 = 2.5;

const BUILTIN: &[(&str, &str, Option<&str>)] = &[
    ("study", include_str!("../presets/study.toml"), None),
    (
        "terminal",
        include_str!("../presets/terminal.toml"),
        Some(include_str!("../presets/terminal.css")),
    ),
    ("noir", include_str!("../presets/noir.toml"), None),
    ("soft", include_str!("../presets/soft.toml"), None),
    ("rain", include_str!("../presets/rain.toml"), None),
    ("storm", include_str!("../presets/storm.toml"), None),
    ("mountain", include_str!("../presets/mountain.toml"), None),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Light,
    Dark,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Profile {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<u32>,
    /// Start from this preset.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base: Option<String>,
    /// Force light or dark; otherwise the reader's appearance setting decides.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<Mode>,
    /// Only in preset files.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preset: Option<PresetMeta>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub palette: Option<BTreeMap<Mode, Palette>>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub typeface: Option<Typeface>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background: Option<Background>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub particles: Option<Particles>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chapter: Option<ChapterStyle>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effects: Option<Effects>,
    /// Reserved for ambient sound; accepted and ignored.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sound: Option<Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PresetMeta {
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub modes: Vec<Mode>,
}

/// Colors as `#rgb` or `#rrggbb`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Palette {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paper: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paper_2: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ink: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub muted: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accent: Option<String>,
    /// Spine color in the library.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spine: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Typeface {
    /// Headings; a bundled font.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display: Option<String>,
    /// Body text; a bundled font.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BackgroundKind {
    None,
    Lamp,
    Grid,
    Blinds,
    Fog,
    Clouds,
    Ridges,
    Texture,
    Gradient,
    Image,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Background {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<BackgroundKind>,
    /// For `image`: an art file of the book, from `vibe-reader art list`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    /// How much the background is dimmed behind the text, 0 to 0.9.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dim: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ParticleKind {
    None,
    Dust,
    Rain,
    Downpour,
    Snow,
    Bokeh,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Particles {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<ParticleKind>,
    /// 0 to 1.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub density: Option<f64>,
    /// 0.1 to 3.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed: Option<f64>,
    /// A faint flash, at most once in 6 seconds.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lightning: Option<bool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Heading {
    Plain,
    Centered,
    Rule,
    Caps,
    Italic,
    Terminal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Illustration {
    None,
    Hills,
    Blinds,
    Orbs,
    Rain,
    Bolt,
    Ridge,
    Terminal,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChapterStyle {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heading: Option<Heading>,
    /// A built-in drawing at the chapter start; art added with `vibe-reader art add` takes its place.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub illustration: Option<Illustration>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Effects {
    /// Film grain, 0 to 1.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grain: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vignette: Option<f64>,
    /// Soft warm light from above, 0 to 1.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub glow: Option<f64>,
}

/// A preset available to profiles: built in or from `<config>/presets/`.
#[derive(Debug, Clone, Serialize)]
pub struct Preset {
    pub id: String,
    pub builtin: bool,
    pub profile: Profile,
    /// Optional stylesheet for layouts the schema cannot express.
    pub css: Option<String>,
}

/// The look in effect at one place, ready for the UI.
#[derive(Debug, Clone, Serialize)]
pub struct Resolved {
    pub mode: Mode,
    pub preset: String,
    pub palette: Palette,
    #[serde(rename = "type")]
    pub typeface: Typeface,
    pub background: Background,
    pub particles: Particles,
    pub chapter: ChapterStyle,
    pub effects: Effects,
    pub css: Option<String>,
}

/// Parses a profile from TOML or JSON text and checks every field.
pub fn parse(text: &str) -> Result<Profile> {
    let profile: Profile = if text.trim_start().starts_with('{') {
        serde_json::from_str(text).context("invalid JSON profile")?
    } else {
        toml::from_str(text).context("invalid TOML profile")?
    };
    validate(&profile)?;
    Ok(profile)
}

pub fn validate(p: &Profile) -> Result<()> {
    if let Some(v) = p.version
        && v != SCHEMA_VERSION
    {
        bail!("unsupported profile version {v}; this vibe-reader reads version {SCHEMA_VERSION}");
    }
    for (mode, palette) in p.palette.iter().flatten() {
        for (name, color) in palette.colors() {
            if let Some(color) = color {
                rgb(color).with_context(|| format!("palette.{}.{name}", mode_name(*mode)))?;
            }
        }
    }
    if let Some(t) = &p.typeface {
        for font in [&t.display, &t.body].into_iter().flatten() {
            if !FONTS.contains(&font.as_str()) {
                bail!("font \"{font}\" is not bundled; use one of: {}", FONTS.join(", "));
            }
        }
    }
    let range = |name: &str, value: Option<f64>, min: f64, max: f64| -> Result<()> {
        match value {
            Some(v) if !(min..=max).contains(&v) => bail!("{name} must be between {min} and {max}"),
            _ => Ok(()),
        }
    };
    if let Some(b) = &p.background {
        range("background.dim", b.dim, 0.0, 0.9)?;
        if b.kind == Some(BackgroundKind::Image) && b.image.is_none() {
            bail!("background.kind = \"image\" needs background.image (a file from `vibe-reader art list`)");
        }
        if let Some(image) = &b.image
            && (image.contains('/') || image.contains('\\'))
        {
            bail!("background.image is an art file name, not a path");
        }
    }
    if let Some(pt) = &p.particles {
        range("particles.density", pt.density, 0.0, 1.0)?;
        range("particles.speed", pt.speed, 0.1, 3.0)?;
    }
    if let Some(e) = &p.effects {
        range("effects.grain", e.grain, 0.0, 1.0)?;
        range("effects.vignette", e.vignette, 0.0, 1.0)?;
        range("effects.glow", e.glow, 0.0, 1.0)?;
    }
    if let Some(meta) = &p.preset
        && meta.modes.is_empty()
    {
        bail!("preset.modes needs at least one of \"light\", \"dark\"");
    }
    Ok(())
}

fn mode_name(mode: Mode) -> &'static str {
    match mode {
        Mode::Light => "light",
        Mode::Dark => "dark",
    }
}

impl Palette {
    fn colors(&self) -> [(&'static str, &Option<String>); 7] {
        [
            ("paper", &self.paper),
            ("paper_2", &self.paper_2),
            ("ink", &self.ink),
            ("muted", &self.muted),
            ("rule", &self.rule),
            ("accent", &self.accent),
            ("spine", &self.spine),
        ]
    }
}

/// `#rgb` or `#rrggbb` to channel values.
pub fn rgb(color: &str) -> Result<[u8; 3]> {
    let hex = color
        .strip_prefix('#')
        .with_context(|| format!("\"{color}\" is not a #rrggbb color"))?;
    let expand: String = match hex.len() {
        3 => hex.chars().flat_map(|c| [c, c]).collect(),
        6 => hex.to_owned(),
        _ => bail!("\"{color}\" is not a #rrggbb color"),
    };
    let byte = |i: usize| {
        u8::from_str_radix(&expand[i..i + 2], 16).with_context(|| format!("\"{color}\" is not a #rrggbb color"))
    };
    Ok([byte(0)?, byte(2)?, byte(4)?])
}

/// WCAG contrast ratio between two colors.
pub fn contrast(a: &str, b: &str) -> Result<f64> {
    let luminance = |c: [u8; 3]| {
        let lin = |v: u8| {
            let s = f64::from(v) / 255.0;
            if s <= 0.03928 {
                s / 12.92
            } else {
                ((s + 0.055) / 1.055).powf(2.4)
            }
        };
        0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
    };
    let (la, lb) = (luminance(rgb(a)?), luminance(rgb(b)?));
    Ok((la.max(lb) + 0.05) / (la.min(lb) + 0.05))
}

/// Built-in presets plus `<config>/presets/*.toml` (with an optional `*.css` next to each).
pub fn presets(paths: &Paths) -> Result<Vec<Preset>> {
    let mut list = Vec::new();
    for (id, toml_text, css) in BUILTIN {
        let profile = parse(toml_text).with_context(|| format!("built-in preset {id}"))?;
        list.push(Preset {
            id: (*id).to_owned(),
            builtin: true,
            profile,
            css: css.map(str::to_owned),
        });
    }
    if let Ok(entries) = fs::read_dir(paths.presets()) {
        let mut files: Vec<_> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|e| e == "toml"))
            .collect();
        files.sort();
        for file in files {
            let id = crate::format::stem(&file);
            let Ok(profile) = fs::read_to_string(&file)
                .map_err(anyhow::Error::from)
                .and_then(|t| parse(&t))
            else {
                continue;
            };
            let css = fs::read_to_string(file.with_extension("css")).ok();
            list.retain(|p: &Preset| p.id != id);
            list.push(Preset {
                id,
                builtin: false,
                profile,
                css,
            });
        }
    }
    Ok(list)
}

/// Checks a preset file and copies it (and its stylesheet) into `<config>/presets/`.
pub fn install(paths: &Paths, file: &Path, css: Option<&Path>) -> Result<String> {
    let profile = parse(&fs::read_to_string(file)?)?;
    if profile.preset.is_none() {
        bail!("a preset needs a [preset] section with name and modes");
    }
    resolve_layers(&presets(paths)?, &[serde_json::to_value(&profile)?], None)?;
    let id = crate::format::stem(file);
    fs::create_dir_all(paths.presets())?;
    fs::copy(file, paths.presets().join(format!("{id}.toml")))?;
    if let Some(css) = css {
        fs::copy(css, paths.presets().join(format!("{id}.css")))?;
    }
    Ok(id)
}

/// Layers that apply at `at`, lowest first: book, chapter, then ranges containing the place.
pub fn layers_at(stored: &[Atmosphere], at: Locator) -> Vec<Value> {
    let mut picked: Vec<&Atmosphere> = stored
        .iter()
        .filter(|a| match (a.scope, a.span) {
            (Scope::Book, _) => true,
            (Scope::Chapter, Some(span)) => span.start.chapter == at.chapter,
            (Scope::Range, Some(span)) => span.start <= at && at < span.end,
            _ => false,
        })
        .collect();
    let rank = |s: Scope| match s {
        Scope::Book => 0,
        Scope::Chapter => 1,
        Scope::Range => 2,
    };
    picked.sort_by_key(|a| (rank(a.scope), a.id));
    picked.into_iter().map(|a| a.profile.clone()).collect()
}

/// Stacks layers over the default preset and checks the result is readable.
/// `wanted` is the reader's light or dark preference; presets that lack it use their own mode.
pub fn resolve(presets: &[Preset], default_preset: &str, layers: &[Value], wanted: Option<Mode>) -> Result<Resolved> {
    let mut all = vec![serde_json::json!({ "base": default_preset })];
    all.extend_from_slice(layers);
    resolve_layers(presets, &all, wanted)
}

fn resolve_layers(presets: &[Preset], layers: &[Value], wanted: Option<Mode>) -> Result<Resolved> {
    let find = |id: &str| {
        presets
            .iter()
            .find(|p| p.id == id)
            .with_context(|| format!("no preset \"{id}\"; see `vibe-reader preset list`"))
    };
    let mut merged = serde_json::to_value(&find("study")?.profile)?;
    let mut preset_id = "study".to_owned();
    let mut css = find("study")?.css.clone();
    for layer in layers {
        if let Some(base) = layer.get("base").and_then(Value::as_str) {
            let preset = find(base)?;
            merged = serde_json::to_value(&preset.profile)?;
            preset_id = preset.id.clone();
            css = preset.css.clone();
        }
        merge(&mut merged, layer);
    }
    let profile: Profile = serde_json::from_value(merged)?;
    let modes = profile
        .preset
        .as_ref()
        .map(|m| m.modes.clone())
        .unwrap_or_else(|| vec![Mode::Light, Mode::Dark]);
    let mode = profile
        .mode
        .or(wanted.filter(|w| modes.contains(w)))
        .or_else(|| modes.first().copied())
        .unwrap_or(Mode::Light);
    let palette = profile
        .palette
        .as_ref()
        .and_then(|p| p.get(&mode))
        .cloned()
        .with_context(|| format!("the profile has no {} palette", mode_name(mode)))?;
    let paper = palette.paper.as_deref().context("palette has no paper color")?;
    let ink = palette.ink.as_deref().context("palette has no ink color")?;
    let text = contrast(ink, paper)?;
    if text < MIN_TEXT_CONTRAST {
        bail!(
            "text contrast {text:.2}:1 between ink {ink} and paper {paper} is below {MIN_TEXT_CONTRAST}:1; the text would be hard to read"
        );
    }
    if let Some(accent) = palette.accent.as_deref() {
        let c = contrast(accent, paper)?;
        if c < MIN_ACCENT_CONTRAST {
            bail!("accent contrast {c:.2}:1 against paper {paper} is below {MIN_ACCENT_CONTRAST}:1");
        }
    }
    Ok(Resolved {
        mode,
        preset: preset_id,
        palette,
        typeface: profile.typeface.unwrap_or_default(),
        background: profile.background.unwrap_or_default(),
        particles: profile.particles.unwrap_or_default(),
        chapter: profile.chapter.unwrap_or_default(),
        effects: profile.effects.unwrap_or_default(),
        css,
    })
}

/// Deep merge of JSON objects; `layer` wins. `base` and `preset` are layer metadata and do not carry over.
fn merge(target: &mut Value, layer: &Value) {
    let (Value::Object(target), Value::Object(layer)) = (target, layer) else {
        return;
    };
    for (key, value) in layer {
        if key == "base" || key == "preset" {
            continue;
        }
        match (target.get_mut(key), value) {
            (Some(existing @ Value::Object(_)), Value::Object(_)) => merge(existing, value),
            _ => {
                target.insert(key.clone(), value.clone());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn builtin() -> Vec<Preset> {
        let dir = tempfile::tempdir().unwrap();
        presets(&Paths::under(dir.path().into())).unwrap()
    }

    #[test]
    fn builtin_presets_are_valid_and_readable() {
        let presets = builtin();
        assert_eq!(presets.len(), 7);
        for preset in &presets {
            let meta = preset.profile.preset.as_ref().expect("presets have [preset]");
            for mode in &meta.modes {
                let r =
                    resolve(&presets, &preset.id, &[], Some(*mode)).unwrap_or_else(|e| panic!("{}: {e:#}", preset.id));
                assert_eq!(r.mode, *mode, "{}", preset.id);
            }
        }
    }

    #[test]
    fn rejects_bad_profiles() {
        assert!(parse("unknown = 1").is_err());
        assert!(parse("[type]\nbody = \"Comic Sans\"").is_err());
        assert!(parse("[particles]\ndensity = 3.0").is_err());
        assert!(parse("[palette.light]\nink = \"red\"").is_err());
        assert!(parse("[background]\nkind = \"image\"").is_err());
        assert!(parse("version = 2").is_err());
        assert!(parse(r#"{"particles": {"kind": "snow"}}"#).is_ok());
    }

    #[test]
    fn rejects_unreadable_text() {
        let low = parse("[palette.light]\npaper = \"#ffffff\"\nink = \"#dddddd\"").unwrap();
        let err = resolve(
            &builtin(),
            "study",
            &[serde_json::to_value(low).unwrap()],
            Some(Mode::Light),
        )
        .unwrap_err();
        assert!(format!("{err:#}").contains("contrast"));
        assert!((contrast("#000", "#fff").unwrap() - 21.0).abs() < 0.01);
    }

    #[test]
    fn layers_override_in_order() {
        let presets = builtin();
        let book = serde_json::json!({ "base": "rain" });
        let chapter = serde_json::json!({ "particles": { "kind": "snow" } });
        let r = resolve(&presets, "study", &[book.clone(), chapter], Some(Mode::Light)).unwrap();
        assert_eq!(r.preset, "rain");
        // Rain exists only in the dark mode.
        assert_eq!(r.mode, Mode::Dark);
        assert_eq!(r.particles.kind, Some(ParticleKind::Snow));
        assert!(
            r.particles.speed.is_some(),
            "other particle fields come from the preset"
        );
    }
}
