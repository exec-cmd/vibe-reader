// Placeholder until phase 4 (see docs/progress.md).

use std::path::Path;

use anyhow::{Result, bail};

use super::Document;

pub fn open(_path: &Path) -> Result<Document> {
    bail!("fb2 support is not finished yet")
}

#[allow(dead_code)]
pub fn resource(_path: &Path, _name: &str) -> Result<Option<Vec<u8>>> {
    Ok(None)
}
