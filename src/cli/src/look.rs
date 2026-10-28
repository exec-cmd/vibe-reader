//! Atmosphere profiles, presets, and the live link to the reader window.

use std::fs;

use anyhow::{Context, Result, bail};
use serde_json::{Value, json};
use vibe_reader_core::atmosphere::{self, Mode};
use vibe_reader_core::store::Scope;
use vibe_reader_core::{Book, Locator, Paths, Span, ipc};

use crate::output::Out;
use crate::{AtmosphereCmd, Ctx, LiveCmd, PresetCmd, Where};

/// Tells a running window to reload notes, art and atmosphere. Silent when no window runs.
pub fn notify(paths: &Paths) {
    let _ = ipc::request(&paths.socket(), &json!({ "cmd": "reload" }));
}

fn scope(book: &Book, at: &Where) -> Result<(Scope, Option<Span>)> {
    match (at.chapter, &at.range) {
        (Some(_), Some(_)) => bail!("give --chapter or --range, not both"),
        (Some(0), None) => bail!("chapters start at 1"),
        (Some(n), None) => {
            if n > book.chapters() {
                bail!("the book has {} chapters", book.chapters());
            }
            let start = Locator::new(n - 1, 0);
            Ok((Scope::Chapter, Some(Span { start, end: start })))
        }
        (None, Some(range)) => Ok((Scope::Range, Some(range.parse()?))),
        (None, None) => Ok((Scope::Book, None)),
    }
}

fn describe(scope: Scope, span: Option<Span>) -> String {
    match (scope, span) {
        (Scope::Chapter, Some(s)) => format!("chapter {}", s.start.chapter + 1),
        (Scope::Range, Some(s)) => format!("range {s}"),
        _ => "the whole book".into(),
    }
}

pub fn atmosphere_cmd(ctx: &Ctx, cmd: AtmosphereCmd) -> Result<Out> {
    let paths = ctx.lib.paths().clone();
    let presets = atmosphere::presets(&paths)?;
    match cmd {
        AtmosphereCmd::Get { book, at, locator } => {
            let book = ctx.lib.find(&book)?;
            let stored = ctx.lib.atmospheres(book.id)?;
            let here: Locator = match (locator, at.chapter, &at.range) {
                (Some(l), _, _) => l.parse()?,
                (None, Some(n), _) if n > 0 => Locator::new(n - 1, 0),
                (None, _, Some(r)) => r.parse::<Span>()?.start,
                _ => book.position.unwrap_or_default(),
            };
            let layers = atmosphere::layers_at(&stored, here);
            let resolved = atmosphere::resolve(&presets, &ctx.config.reader.preset, &layers, None)?;
            let mut text = format!(
                "# Atmosphere of \"{}\" at `{here}`\n\nIn effect: preset {}, {} mode\n",
                book.title,
                resolved.preset,
                if resolved.mode == Mode::Dark { "dark" } else { "light" }
            );
            if stored.is_empty() {
                text.push_str(&format!(
                    "No profiles stored; the default preset `{}` applies.\n",
                    ctx.config.reader.preset
                ));
            }
            for a in &stored {
                text.push_str(&format!(
                    "- {} [{}] by {}: `{}`\n",
                    a.id,
                    describe(a.scope, a.span),
                    a.author,
                    a.profile
                ));
            }
            Ok(Out::new(
                json!({ "book": book.id, "at": here, "stored": stored, "resolved": resolved }),
                text,
            ))
        }
        AtmosphereCmd::Set {
            book,
            at,
            preset,
            file,
            profile: inline,
        } => {
            let book = ctx.lib.find(&book)?;
            let (scope, span) = scope(&book, &at)?;
            let mut profile: Value = match (preset, file, inline) {
                (Some(name), None, None) => json!({ "base": name }),
                (None, Some(file), None) => serde_json::to_value(atmosphere::parse(
                    &fs::read_to_string(&file).with_context(|| format!("cannot read {}", file.display()))?,
                )?)?,
                (None, None, Some(text)) => serde_json::to_value(atmosphere::parse(&text)?)?,
                _ => bail!("give exactly one of --preset, --file or --profile"),
            };
            if let Value::Object(map) = &mut profile {
                map.remove("preset");
            }
            // The full stack must resolve and stay readable before anything is stored.
            let here = span.map_or(Locator::default(), |s| s.start);
            let mut layers = atmosphere::layers_at(&ctx.lib.atmospheres(book.id)?, here);
            layers.push(profile.clone());
            let resolved = atmosphere::resolve(&presets, &ctx.config.reader.preset, &layers, None)?;
            let id = ctx.lib.set_atmosphere(book.id, scope, span, &profile, &ctx.author)?;
            if scope == Scope::Book
                && let Some(spine) = &resolved.palette.spine
            {
                ctx.lib.set_color(book.id, spine)?;
            }
            notify(&paths);
            Ok(Out::new(
                json!({ "id": id, "book": book.id, "scope": scope, "span": span, "resolved": resolved }),
                format!(
                    "Set the atmosphere of {} in \"{}\" (preset {}). `vibe-reader undo` reverts it.",
                    describe(scope, span),
                    book.title,
                    resolved.preset
                ),
            ))
        }
        AtmosphereCmd::Clear { book, at } => {
            let book = ctx.lib.find(&book)?;
            let (scope, span) = scope(&book, &at)?;
            let target = ctx
                .lib
                .atmospheres(book.id)?
                .into_iter()
                .find(|a| a.scope == scope && a.span == span)
                .with_context(|| format!("no atmosphere stored for {}", describe(scope, span)))?;
            ctx.lib.clear_atmosphere(target.id, &ctx.author)?;
            notify(&paths);
            Ok(Out::new(
                json!({ "cleared": target.id }),
                format!("Cleared the atmosphere of {}.", describe(scope, span)),
            ))
        }
    }
}

pub fn preset_cmd(paths: &Paths, cmd: PresetCmd) -> Result<Out> {
    let presets = atmosphere::presets(paths)?;
    match cmd {
        PresetCmd::List => {
            let list: Vec<Value> = presets
                .iter()
                .map(|p| {
                    let meta = p.profile.preset.clone().unwrap_or_default();
                    json!({ "id": p.id, "name": meta.name, "description": meta.description, "modes": meta.modes, "builtin": p.builtin })
                })
                .collect();
            let text = presets
                .iter()
                .map(|p| {
                    let meta = p.profile.preset.clone().unwrap_or_default();
                    let modes: Vec<&str> = meta
                        .modes
                        .iter()
                        .map(|m| if *m == Mode::Dark { "dark" } else { "light" })
                        .collect();
                    format!(
                        "{:<10} {} [{}]{} — {}",
                        p.id,
                        meta.name,
                        modes.join(", "),
                        if p.builtin { "" } else { " (yours)" },
                        meta.description
                    )
                })
                .collect::<Vec<_>>()
                .join("\n");
            Ok(Out::new(json!({ "presets": list }), text))
        }
        PresetCmd::Show { name } => {
            let preset = presets
                .iter()
                .find(|p| p.id == name)
                .with_context(|| format!("no preset \"{name}\"; see `vibe-reader preset list`"))?;
            let text = format!("# {name}\n\n```toml\n{}```\n", toml::to_string_pretty(&preset.profile)?);
            Ok(Out::new(
                json!({ "id": preset.id, "profile": preset.profile, "css": preset.css }),
                text,
            ))
        }
        PresetCmd::Validate { file } => {
            let profile = atmosphere::parse(
                &fs::read_to_string(&file).with_context(|| format!("cannot read {}", file.display()))?,
            )?;
            let modes = profile
                .preset
                .as_ref()
                .map(|m| m.modes.clone())
                .unwrap_or_else(|| vec![Mode::Light, Mode::Dark]);
            let layer = serde_json::to_value(&profile)?;
            let mut checked = Vec::new();
            for mode in modes {
                // A plain profile is checked on top of the default preset, as it would be applied.
                atmosphere::resolve(&presets, "study", std::slice::from_ref(&layer), Some(mode))?;
                checked.push(mode);
            }
            Ok(Out::new(
                json!({ "valid": true, "modes": checked }),
                format!("{} is valid.", file.display()),
            ))
        }
        PresetCmd::Install { file, css } => {
            let id = atmosphere::install(paths, &file, css.as_deref())?;
            Ok(Out::new(
                json!({ "installed": id }),
                format!("Installed preset \"{id}\" into {}.", paths.presets().display()),
            ))
        }
    }
}

pub fn live(paths: &Paths, cmd: LiveCmd) -> Result<Out> {
    let socket = paths.socket();
    let (message, done): (Value, String) = match cmd {
        LiveCmd::Position => (json!({ "cmd": "position" }), String::new()),
        LiveCmd::Selection => (json!({ "cmd": "selection" }), String::new()),
        LiveCmd::Goto { locator } => {
            let at: Locator = locator.parse()?;
            (
                json!({ "cmd": "goto", "locator": at }),
                format!("Moved the window to `{at}`."),
            )
        }
        LiveCmd::Highlight { range } => {
            let span: Span = range.parse()?;
            (
                json!({ "cmd": "highlight", "range": span.to_string() }),
                format!("Showing `{span}` in the window."),
            )
        }
    };
    let reply = ipc::request(&socket, &message)?;
    let text = if done.is_empty() { live_text(&reply) } else { done };
    Ok(Out::new(reply, text))
}

fn live_text(reply: &Value) -> String {
    let title = reply["book"]["title"].as_str().unwrap_or("no book");
    let mut text = format!("Window: {title}");
    if let Some(position) = reply["position"].as_str() {
        text.push_str(&format!(" at `{position}`"));
    }
    if let Some(sel) = reply.get("selection").filter(|s| !s.is_null()) {
        text.push_str(&format!(
            "\nSelection `{}..{}`:\n{}",
            sel["start"].as_str().unwrap_or_default(),
            sel["end"].as_str().unwrap_or_default(),
            crate::output::untrusted(sel["text"].as_str().unwrap_or_default())
        ));
    }
    text
}

pub fn gui_status(paths: &Paths) -> Result<Out> {
    match ipc::request(&paths.socket(), &json!({ "cmd": "status" })) {
        Ok(reply) => {
            let text = live_text(&reply);
            Ok(Out::new(
                json!({ "running": true, "status": reply }),
                format!("The reader window is running. {text}"),
            ))
        }
        Err(_) => Ok(Out::new(
            json!({ "running": false }),
            "The reader window is not running. Start it with `vibe-reader open`.",
        )),
    }
}

/// The window's current selection, when a window runs and shows the same book.
pub fn live_selection(paths: &Paths, book: i64) -> Option<Value> {
    let reply = ipc::request(&paths.socket(), &json!({ "cmd": "selection" })).ok()?;
    (reply["book"]["id"].as_i64() == Some(book))
        .then(|| reply["selection"].clone())
        .filter(|s| !s.is_null())
}
