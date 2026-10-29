//! Skills, configuration, health checks and undo.

use std::fs;
use std::io::IsTerminal;
use std::path::PathBuf;
use std::process::Command;

use anyhow::{Context, Result, bail};
use serde_json::json;
use vibe_reader_core::{Config, Format, Paths};

use crate::output::Out;
use crate::{ConfigCmd, Ctx, SkillsCmd};

/// Bundled Agent Skills: name and SKILL.md contents.
pub const SKILLS: &[(&str, &str)] = &[
    ("reader-cli", include_str!("../skills/reader-cli/SKILL.md")),
    ("reader-analyze", include_str!("../skills/reader-analyze/SKILL.md")),
    ("reader-discuss", include_str!("../skills/reader-discuss/SKILL.md")),
    (
        "reader-atmosphere",
        include_str!("../skills/reader-atmosphere/SKILL.md"),
    ),
    ("books-helper", include_str!("../skills/books-helper/SKILL.md")),
];

fn default_skills_dir() -> Result<PathBuf> {
    Ok(dirs_home()?.join(".claude").join("skills"))
}

fn dirs_home() -> Result<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from).context("HOME is not set")
}

/// The `description:` line of a SKILL.md front matter.
fn description(skill: &str) -> &str {
    skill
        .lines()
        .find_map(|l| l.strip_prefix("description:"))
        .map_or("", str::trim)
}

pub fn skills(cmd: &SkillsCmd) -> Result<Out> {
    match cmd {
        SkillsCmd::List => {
            let list: Vec<_> = SKILLS
                .iter()
                .map(|(name, body)| json!({ "name": name, "description": description(body) }))
                .collect();
            let text = SKILLS
                .iter()
                .map(|(name, body)| format!("{name}: {}", description(body)))
                .collect::<Vec<_>>()
                .join("\n");
            Ok(Out::new(json!({ "skills": list }), text))
        }
        SkillsCmd::Install { dir, force } => {
            let dir = match dir {
                Some(dir) => dir.clone(),
                None => default_skills_dir()?,
            };
            let mut installed = Vec::new();
            let mut skipped = Vec::new();
            for (name, body) in SKILLS {
                let file = dir.join(name).join("SKILL.md");
                if file.exists() && !force && fs::read_to_string(&file).is_ok_and(|old| old != *body) {
                    skipped.push(*name);
                    continue;
                }
                fs::create_dir_all(file.parent().expect("has parent"))?;
                fs::write(&file, body)?;
                installed.push(*name);
            }
            let mut text = format!("Installed {} Skills into {}.", installed.len(), dir.display());
            if !skipped.is_empty() {
                text.push_str(&format!(
                    "\nKept locally changed Skills: {}. Use --force to overwrite.",
                    skipped.join(", ")
                ));
            }
            Ok(Out::new(
                json!({ "dir": dir, "installed": installed, "skipped": skipped }),
                text,
            ))
        }
    }
}

pub fn config(paths: &Paths, action: Option<&ConfigCmd>) -> Result<Out> {
    let file = paths.config_file();
    match action {
        Some(ConfigCmd::Path) => Ok(Out::new(json!({ "path": file }), file.display().to_string())),
        Some(ConfigCmd::Edit) => {
            if !std::io::stdin().is_terminal() {
                bail!("config edit runs only in an interactive terminal; the reader decides what agents may see");
            }
            if !file.exists() {
                Config::default().save(paths)?;
            }
            let editor = std::env::var("VISUAL")
                .or_else(|_| std::env::var("EDITOR"))
                .unwrap_or_else(|_| "nano".into());
            let status = Command::new(&editor)
                .arg(&file)
                .status()
                .with_context(|| format!("cannot start {editor}"))?;
            if !status.success() {
                bail!("{editor} exited with {status}");
            }
            Config::load(paths)?;
            Ok(Out::new(json!({ "path": file }), format!("Saved {}.", file.display())))
        }
        None => {
            let config = Config::load(paths)?.redacted();
            let text = format!("# {}\n\n{}", file.display(), toml::to_string_pretty(&config)?);
            Ok(Out::new(json!({ "path": file, "config": config }), text))
        }
    }
}

pub fn doctor(ctx: &Ctx) -> Result<Out> {
    let paths = ctx.lib.paths();
    let mut checks = Vec::new();
    let mut check =
        |name: &str, ok: bool, detail: String| checks.push(json!({ "check": name, "ok": ok, "detail": detail }));

    check("data folder", paths.data.is_dir(), paths.data.display().to_string());
    check(
        "database",
        true,
        format!("{} (schema {})", paths.database().display(), ctx.lib.schema_version()?),
    );
    match Config::load(paths) {
        Ok(_) => check("config", true, paths.config_file().display().to_string()),
        Err(e) => check("config", false, format!("{e:#}")),
    }
    let books = ctx.lib.books()?;
    let missing: Vec<String> = books
        .iter()
        .filter(|b| !b.path.is_file())
        .map(|b| format!("{} ({})", b.title, b.path.display()))
        .collect();
    check(
        "book files",
        missing.is_empty(),
        if missing.is_empty() {
            format!("{} books", books.len())
        } else {
            format!("missing: {}", missing.join("; "))
        },
    );
    let formats: Vec<&str> = Format::ALL
        .iter()
        .filter(|f| f.supported())
        .map(|f| f.as_str())
        .collect();
    check("formats", true, formats.join(", "));
    match crate::library::gui_binary() {
        Some(gui) => check("reader window", true, gui.display().to_string()),
        None => check(
            "reader window",
            false,
            "vibe-reader-gui not found next to vibe-reader or in PATH".into(),
        ),
    }
    check(
        "live link",
        true,
        if vibe_reader_core::ipc::running(&paths.socket()) {
            "window running"
        } else {
            "window not running"
        }
        .to_owned(),
    );
    let skills_dir = default_skills_dir()?;
    let installed = SKILLS
        .iter()
        .filter(|(name, _)| skills_dir.join(name).join("SKILL.md").is_file())
        .count();
    check(
        "skills",
        installed == SKILLS.len(),
        format!(
            "{installed}/{} in {} (`vibe-reader skills install`)",
            SKILLS.len(),
            skills_dir.display()
        ),
    );

    let text = checks
        .iter()
        .map(|c| {
            format!(
                "[{}] {}: {}",
                if c["ok"].as_bool() == Some(true) { "ok" } else { "!!" },
                c["check"].as_str().unwrap_or_default(),
                c["detail"].as_str().unwrap_or_default()
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    Ok(Out::new(json!({ "checks": checks }), text))
}

pub fn undo(ctx: &Ctx) -> Result<Out> {
    match ctx.lib.undo(&ctx.author)? {
        Some(done) => {
            crate::look::notify(ctx.lib.paths());
            let what = if done.action == "insert" {
                "removed the new"
            } else {
                "restored the deleted"
            };
            Ok(Out::new(
                json!({ "undone": done }),
                format!(
                    "Undid the newest change by {}: {what} row {} in {}.",
                    ctx.author, done.id, done.table
                ),
            ))
        }
        None => Ok(Out::new(
            json!({ "undone": null }),
            format!("Nothing to undo for {}.", ctx.author),
        )),
    }
}
