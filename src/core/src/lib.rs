//! Core library of vibe-reader: book parsing, locators and library storage.

pub mod atmosphere;
pub mod config;
pub mod excerpt;
pub mod format;
pub mod ipc;
pub mod locator;
pub mod paths;
pub mod store;
pub mod text;

pub use config::Config;
pub use format::{Document, Format, Kind};
pub use locator::{Locator, Span};
pub use paths::Paths;
pub use store::{Book, Library, Status};
