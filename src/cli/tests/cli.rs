//! End-to-end runs of the `vibe-reader` binary against a temporary library.

use std::path::Path;
use std::process::{Command, Stdio};

use serde_json::Value;

struct Home(tempfile::TempDir);

impl Home {
    fn new() -> Self {
        Self(tempfile::tempdir().unwrap())
    }

    fn path(&self) -> &Path {
        self.0.path()
    }

    /// Runs the CLI with JSON output as agent `test`; returns (success, parsed stdout).
    fn run(&self, args: &[&str]) -> (bool, Value) {
        let out = Command::new(env!("CARGO_BIN_EXE_vibe-reader"))
            .args(args)
            .arg("--json")
            .env("VIBE_READER_HOME", self.path().join("home"))
            .env("VIBE_READER_AUTHOR", "test")
            .stdin(Stdio::null())
            .output()
            .unwrap();
        let json = serde_json::from_slice(&out.stdout)
            .unwrap_or_else(|_| panic!("not JSON: {}", String::from_utf8_lossy(&out.stdout)));
        (out.status.success(), json)
    }

    fn ok(&self, args: &[&str]) -> Value {
        let (ok, json) = self.run(args);
        assert!(ok, "{args:?} failed: {json}");
        json
    }

    fn book(&self) -> String {
        let file = self.path().join("story.txt");
        std::fs::write(
            &file,
            "Глава 1\n\nПервый абзац первой главы.\n\nВторой абзац.\n\nГлава 2\n\nТайна раскрывается здесь.",
        )
        .unwrap();
        self.ok(&["add", file.to_str().unwrap()])["book"]["id"].to_string()
    }
}

#[test]
fn reads_up_to_the_reader_position() {
    let home = Home::new();
    let id = home.book();
    assert_eq!(home.ok(&["list"])["books"].as_array().unwrap().len(), 1);

    // Nothing is readable before the reader starts.
    let first = home.ok(&["read", &id]);
    assert_eq!(first["content"], "");
    assert_eq!(first["stopped_at_reader_position"], true);
    assert_eq!(first["untrusted"], true);

    home.ok(&["progress", &id, "--set", "ch:2:0"]);
    let chapter = home.ok(&["read", &id, "--chapter", "1"]);
    assert!(chapter["content"].as_str().unwrap().contains("Второй абзац."));
    assert!(
        home.ok(&["search", &id, "тайна"])["hits"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        home.ok(&["search", &id, "тайна", "--allow-spoilers"])["hits"]
            .as_array()
            .unwrap()
            .len(),
        1
    );

    // The agent cursor continues where the last chunk ended.
    let part = home.ok(&["read", &id, "--chapter", "1", "--max-tokens", "5"]);
    let next = home.ok(&["read", &id, "--continue", "--max-tokens", "100"]);
    assert_eq!(next["from"], part["next"]);
}

#[test]
fn notes_undo_and_permissions() {
    let home = Home::new();
    let id = home.book();
    let note = home.ok(&["note", "add", &id, "заметка", "--locator", "ch:1:5"]);
    assert_eq!(note["author"], "test");
    assert_eq!(home.ok(&["note", "list", &id])["items"].as_array().unwrap().len(), 1);
    home.ok(&["undo"]);
    assert!(home.ok(&["note", "list", &id])["items"].as_array().unwrap().is_empty());

    let (ok, err) = home.run(&["remove", &id]);
    assert!(!ok && err["error"].as_str().unwrap().contains("interactive terminal"));

    let (ok, err) = home.run(&["sessions"]);
    assert!(!ok && err["error"].as_str().unwrap().contains("consent"));
}

#[test]
fn installs_skills() {
    let home = Home::new();
    let dir = home.path().join("skills");
    let out = home.ok(&["skills", "install", "--dir", dir.to_str().unwrap()]);
    assert_eq!(out["installed"].as_array().unwrap().len(), 5);
    let skill = std::fs::read_to_string(dir.join("reader-cli/SKILL.md")).unwrap();
    assert!(skill.starts_with("---\nname: reader-cli\n"));
}

#[test]
fn atmosphere_layers_and_presets() {
    let home = Home::new();
    let id = home.book();
    assert_eq!(home.ok(&["preset", "list"])["presets"].as_array().unwrap().len(), 7);
    home.ok(&["atmosphere", "set", "--book", &id, "--preset", "rain"]);
    home.ok(&[
        "atmosphere",
        "set",
        "--book",
        &id,
        "--chapter",
        "2",
        "--profile",
        r#"{"particles": {"kind": "snow"}}"#,
    ]);
    let here = home.ok(&["atmosphere", "get", "--book", &id, "--locator", "ch:2:0"]);
    assert_eq!(here["resolved"]["preset"], "rain");
    assert_eq!(here["resolved"]["particles"]["kind"], "snow");
    assert_eq!(
        home.ok(&["atmosphere", "get", "--book", &id, "--locator", "ch:1:0"])["resolved"]["particles"]["kind"],
        "rain"
    );
    // The book's spine takes the preset's color.
    assert_eq!(home.ok(&["show", &id])["book"]["color"], "#2c3e4c");

    let (ok, err) = home.run(&[
        "atmosphere",
        "set",
        "--book",
        &id,
        "--profile",
        r##"{"palette": {"dark": {"ink": "#222222"}}}"##,
    ]);
    assert!(!ok && err["error"].as_str().unwrap().contains("contrast"));
    let (ok, _) = home.run(&[
        "atmosphere",
        "set",
        "--book",
        &id,
        "--profile",
        r#"{"type": {"body": "Comic Sans"}}"#,
    ]);
    assert!(!ok);

    home.ok(&["atmosphere", "clear", "--book", &id, "--chapter", "2"]);
    assert_eq!(
        home.ok(&["atmosphere", "get", "--book", &id, "--locator", "ch:2:0"])["resolved"]["particles"]["kind"],
        "rain"
    );
    let (ok, err) = home.run(&["live", "position"]);
    assert!(!ok && err["error"].as_str().unwrap().contains("not running"));
}
