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
    pub translate: Translate,
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
    /// Strength of atmosphere effects: 0 is off, 1 as designed, up to 2.
    pub effects: f32,
    /// Ambient sound of the atmosphere, generated in the window.
    pub sound: bool,
    /// Sound volume, 0 to 1.
    pub volume: f32,
    /// Page turn animation: `curl`, `slide` or `none`.
    pub page_turn: String,
    /// Hide the reader controls while reading; they return when the mouse moves.
    pub autohide: bool,
    /// Window opacity: 1 is solid, lower values let the desktop show through.
    pub opacity: f32,
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
            effects: 1.0,
            sound: false,
            volume: 0.5,
            page_turn: "curl".into(),
            autohide: true,
            opacity: 1.0,
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

/// The translator in the reader window. Keys are kept here and never shown to agents.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Translate {
    /// `google`, `deepl` or `openrouter`.
    pub provider: String,
    /// Language code to translate into; `auto` uses the interface language.
    pub target: String,
    pub google_key: String,
    pub deepl_key: String,
    pub openrouter_key: String,
    /// Any chat model available on OpenRouter.
    pub openrouter_model: String,
}

impl Default for Translate {
    fn default() -> Self {
        Self {
            provider: "deepl".into(),
            target: "auto".into(),
            google_key: String::new(),
            deepl_key: String::new(),
            openrouter_key: String::new(),
            openrouter_model: "openai/gpt-4o-mini".into(),
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
        let file = paths.config_file();
        fs::write(&file, toml::to_string_pretty(self)?)?;
        // The file holds translator API keys.
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&file, fs::Permissions::from_mode(0o600))?;
        }
        Ok(())
    }

    /// A copy safe to print: API keys are replaced by `set`.
    pub fn redacted(&self) -> Self {
        let mut copy = self.clone();
        let t = &mut copy.translate;
        for key in [&mut t.google_key, &mut t.deepl_key, &mut t.openrouter_key] {
            if !key.is_empty() {
                *key = "set".into();
            }
        }
        copy
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

    #[test]
    fn keys_are_redacted_and_private() {
        let dir = tempfile::tempdir().unwrap();
        let paths = Paths::under(dir.path().into());
        let mut config = Config::default();
        config.translate.deepl_key = "secret".into();
        config.save(&paths).unwrap();
        assert_eq!(config.redacted().translate.deepl_key, "set");
        assert_eq!(config.redacted().translate.google_key, "");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(paths.config_file()).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o600);
        }
    }
}
