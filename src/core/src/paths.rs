//! Where vibe-reader keeps its data, configuration and runtime files.

use std::env;
use std::path::PathBuf;

use anyhow::{Context, Result};

/// Environment variable that moves all vibe-reader files under one directory.
pub const HOME_ENV: &str = "VIBE_READER_HOME";

/// Resolved directories of one vibe-reader installation.
#[derive(Debug, Clone)]
pub struct Paths {
    pub data: PathBuf,
    pub config: PathBuf,
    pub runtime: PathBuf,
}

impl Paths {
    /// XDG directories, or `$VIBE_READER_HOME/{data,config,run}` when the variable is set.
    pub fn resolve() -> Result<Self> {
        if let Some(home) = env::var_os(HOME_ENV) {
            return Ok(Self::under(PathBuf::from(home)));
        }
        let data = dirs::data_dir().context("no data directory")?.join("vibe-reader");
        let config = dirs::config_dir().context("no config directory")?.join("vibe-reader");
        let runtime = dirs::runtime_dir()
            .map(|dir| dir.join("vibe-reader"))
            .unwrap_or_else(|| data.join("run"));
        Ok(Self { data, config, runtime })
    }

    /// Layout used for `VIBE_READER_HOME` and tests.
    pub fn under(home: PathBuf) -> Self {
        Self {
            data: home.join("data"),
            config: home.join("config"),
            runtime: home.join("run"),
        }
    }

    pub fn database(&self) -> PathBuf {
        self.data.join("library.db")
    }

    pub fn art(&self) -> PathBuf {
        self.data.join("art")
    }

    /// Cover thumbnails cached or chosen for the library.
    pub fn covers(&self) -> PathBuf {
        self.data.join("covers")
    }

    pub fn config_file(&self) -> PathBuf {
        self.config.join("config.toml")
    }

    /// Files here replace the UI files built into the GUI.
    pub fn ui_overrides(&self) -> PathBuf {
        self.config.join("ui")
    }

    pub fn presets(&self) -> PathBuf {
        self.config.join("presets")
    }

    pub fn socket(&self) -> PathBuf {
        self.runtime.join("vibe-reader.sock")
    }
}
