//! `config.toml`: reader preferences and what agents may see.

use std::fs;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::Paths;

/// Fonts bundled with the reader window (`src/gui/ui/fonts/`). Atmosphere profiles may use only these.
pub const FONTS: &[&str] = &[
    "Literata",
    "Spectral",
    "Cormorant Garamond",
    "Playfair Display",
    "Onest",
    "JetBrains Mono",
];

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub reader: Reader,
    pub typography: Typography,
    pub library: LibraryView,
    pub pdf: Pdf,
    pub agent: Agent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct LibraryView {
    /// Grouping of the shelf view: `shelf`, `author`, `format`, `status` or `none`.
    pub group: String,
    /// `recent`, `title`, `author`, `progress` or `added`.
    pub sort: String,
    /// Open the library in the compact window.
    pub start_mini: bool,
    /// Keep a copy of imported files in the library folder.
    pub copy_on_import: bool,
}

impl Default for LibraryView {
    fn default() -> Self {
        Self {
            group: "shelf".into(),
            sort: "recent".into(),
            start_mini: false,
            copy_on_import: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Pdf {
    /// `spread` (two pages), `single` or `scroll`.
    pub layout: String,
    /// `page` fits the whole page, `width` fits the width.
    pub fit: String,
    /// Darken pages in dark mode.
    pub invert_dark: bool,
}

impl Default for Pdf {
    fn default() -> Self {
        Self {
            layout: "spread".into(),
            fit: "page".into(),
            invert_dark: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Reader {
    /// `auto` follows the system language; `en` or `ru` force one.
    pub locale: String,
    /// Preset used when a book has no atmosphere of its own.
    pub preset: String,
    /// `auto`, `light` or `dark`.
    pub mode: String,
    pub vim: bool,
    /// Turn off particles and transitions regardless of the system setting.
    pub reduce_motion: bool,
    /// Layout of reflowable books: `spread` (two pages when wide), `pages` or `scroll`.
    pub layout: String,
    /// Particles and light effects of atmospheres.
    pub particles: bool,
}

impl Default for Reader {
    fn default() -> Self {
        Self {
            locale: "auto".into(),
            preset: "study".into(),
            mode: "auto".into(),
            vim: false,
            reduce_motion: false,
            layout: "spread".into(),
            particles: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Typography {
    /// `auto` follows the atmosphere; otherwise a bundled font, `system`, or any installed family.
    pub font: String,
    pub size: f32,
    /// Line length in `em`.
    pub width: f32,
    pub line_height: f32,
    pub justify: bool,
    pub hyphens: bool,
}

impl Default for Typography {
    fn default() -> Self {
        Self {
            font: "Literata".into(),
            size: 19.0,
            width: 34.0,
            line_height: 1.6,
            justify: true,
            hyphens: true,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Agent {
    pub consent: Consent,
}

/// Parts of the reader profile that agents may read. Everything is off until the reader turns it on.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Consent {
    /// When and how much the reader reads: sessions, time of day, volume.
    pub habits: bool,
    /// Which books and authors the reader picks, across the library.
    pub genres: bool,
    /// Reading speed.
    pub speed: bool,
}

impl Config {
    /// Reads the config file, or returns defaults when it does not exist.
    pub fn load(paths: &Paths) -> Result<Self> {
        let file = paths.config_file();
        match fs::read_to_string(&file) {
            Ok(text) => toml::from_str(&text).with_context(|| format!("invalid {}", file.display())),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(e).with_context(|| format!("cannot read {}", file.display())),
        }
    }

    pub fn save(&self, paths: &Paths) -> Result<()> {
        fs::create_dir_all(&paths.config)?;
        fs::write(paths.config_file(), toml::to_string_pretty(self)?)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_and_partial_files() {
        let dir = tempfile::tempdir().unwrap();
        let paths = Paths::under(dir.path().into());
        assert!(!Config::load(&paths).unwrap().agent.consent.speed);
        std::fs::create_dir_all(&paths.config).unwrap();
        std::fs::write(paths.config_file(), "[agent.consent]\nspeed = true\n").unwrap();
        let config = Config::load(&paths).unwrap();
        assert!(config.agent.consent.speed && !config.agent.consent.habits);
        assert_eq!(config.reader.preset, "study");
    }
}
