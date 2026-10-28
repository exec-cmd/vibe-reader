//! Notes, bookmarks, highlights, export and agent memory.

use std::fs;
use std::path::Path;

use anyhow::{Result, bail};
use serde_json::json;
use vibe_reader_core::store::{Annotation, AnnotationKind};
use vibe_reader_core::{Book, Document, Locator, Span};

use crate::output::{Out, date};
use crate::{BookmarkCmd, Ctx, HighlightCmd, MemoryCmd, NoteCmd};

fn span_of(locator: Option<&str>, range: Option<&str>) -> Result<Span> {
    match (range, locator) {
        (Some(range), _) => range.parse(),
        (None, Some(locator)) => {
            let at: Locator = locator.parse()?;
            Ok(Span { start: at, end: at })
        }
        (None, None) => bail!("give --locator or --range"),
    }
}

/// The quoted passage of a span, or the anchor text after a point.
fn quote(doc: &Document, span: Span) -> Result<String> {
    let Some(chapter) = doc.chapters.get(span.start.chapter) else {
        bail!("the book has {} chapters", doc.chapters.len())
    };
    if span.end.chapter >= doc.chapters.len() {
        bail!("the book has {} chapters", doc.chapters.len());
    }
    if span.start == span.end || span.start.chapter != span.end.chapter {
        return Ok(span.start.quote(&chapter.text));
    }
    Ok(chapter
        .text
        .chars()
        .skip(span.start.offset)
        .take(span.end.offset - span.start.offset)
        .collect())
}

fn add(ctx: &Ctx, book: &Book, kind: AnnotationKind, span: Span, body: &str) -> Result<Out> {
    let doc = ctx.lib.document(book)?;
    let quote = quote(&doc, span)?;
    let id = ctx.lib.annotate(book.id, kind, span, &quote, body, &ctx.author)?;
    Ok(Out::new(
        json!({ "id": id, "book": book.id, "kind": kind, "start": span.start, "end": span.end, "author": ctx.author }),
        format!(
            "Added {} {id} to \"{}\" at `{}`.",
            kind.as_str(),
            book.title,
            span.start
        ),
    ))
}

fn list(ctx: &Ctx, book: &Book, kind: Option<AnnotationKind>) -> Result<Out> {
    let items = ctx.lib.annotations(book.id, kind)?;
    let text = if items.is_empty() {
        "Nothing here yet.".to_owned()
    } else {
        items.iter().map(item_line).collect::<Vec<_>>().join("\n")
    };
    // Quotes come from the book, bodies from people and agents.
    Ok(Out::new(
        json!({ "book": book.id, "untrusted": true, "items": items }),
        text,
    ))
}

fn item_line(a: &Annotation) -> String {
    let quote = if a.quote.is_empty() {
        String::new()
    } else {
        format!(" «{}»", a.quote.replace('\n', " "))
    };
    format!(
        "{:>4}  `{}` {} by {}{}  {}",
        a.id,
        a.start,
        a.kind.as_str(),
        a.author,
        quote,
        a.body
    )
}

pub fn note(ctx: &Ctx, cmd: NoteCmd) -> Result<Out> {
    match cmd {
        NoteCmd::Add {
            book,
            text,
            locator,
            range,
        } => {
            let book = ctx.lib.find(&book)?;
            add(
                ctx,
                &book,
                AnnotationKind::Note,
                span_of(locator.as_deref(), range.as_deref())?,
                &text,
            )
        }
        NoteCmd::List { book } => list(ctx, &ctx.lib.find(&book)?, Some(AnnotationKind::Note)),
        NoteCmd::Edit { id, text } => {
            let new = ctx.lib.edit_annotation(id, &text, &ctx.author)?;
            Ok(Out::new(
                json!({ "id": new, "replaces": id }),
                format!("Note {id} is now {new}."),
            ))
        }
        NoteCmd::Delete { id } => {
            ctx.lib.delete_annotation(id, &ctx.author)?;
            Ok(Out::new(
                json!({ "deleted": id }),
                format!("Deleted {id}. `vibe-reader undo` brings it back."),
            ))
        }
    }
}

pub fn bookmark(ctx: &Ctx, cmd: BookmarkCmd) -> Result<Out> {
    match cmd {
        BookmarkCmd::Add { book, locator, label } => {
            let book = ctx.lib.find(&book)?;
            add(
                ctx,
                &book,
                AnnotationKind::Bookmark,
                span_of(Some(&locator), None)?,
                label.as_deref().unwrap_or_default(),
            )
        }
        BookmarkCmd::List { book } => list(ctx, &ctx.lib.find(&book)?, Some(AnnotationKind::Bookmark)),
    }
}

pub fn highlight(ctx: &Ctx, cmd: HighlightCmd) -> Result<Out> {
    match cmd {
        HighlightCmd::Add { book, range, note } => {
            let book = ctx.lib.find(&book)?;
            add(
                ctx,
                &book,
                AnnotationKind::Highlight,
                range.parse()?,
                note.as_deref().unwrap_or_default(),
            )
        }
        HighlightCmd::List { book } => list(ctx, &ctx.lib.find(&book)?, Some(AnnotationKind::Highlight)),
    }
}

pub fn export(ctx: &Ctx, query: Option<&str>, output: Option<&Path>) -> Result<Out> {
    let books = match query {
        Some(q) => vec![ctx.lib.find(q)?],
        None => ctx.lib.books()?,
    };
    let mut entries = Vec::new();
    let mut md = String::from("# Notes\n");
    for book in &books {
        let items = ctx.lib.annotations(book.id, None)?;
        if items.is_empty() {
            continue;
        }
        md.push_str(&format!("\n## {}\n", book.title));
        if !book.authors.is_empty() {
            md.push_str(&format!("\n*{}*\n", book.authors.join(", ")));
        }
        for a in &items {
            md.push_str(&format!("\n### {} · `{}` · {}\n\n", a.kind.as_str(), a.start, a.author));
            if !a.quote.is_empty() {
                for line in a.quote.lines() {
                    md.push_str(&format!("> {line}\n"));
                }
                md.push('\n');
            }
            if !a.body.is_empty() {
                md.push_str(&format!("{}\n", a.body));
            }
            md.push_str(&format!("\n<small>{}</small>\n", date(a.created_at)));
        }
        entries
            .push(json!({ "book": { "id": book.id, "title": book.title, "authors": book.authors }, "items": items }));
    }
    let json = json!({ "version": 1, "untrusted": true, "books": entries });
    if let Some(output) = output {
        let body = match output.extension().and_then(|e| e.to_str()) {
            Some("json") => serde_json::to_string_pretty(&json)?,
            Some("md" | "markdown") => md,
            _ => bail!("the output file must end in .md or .json"),
        };
        fs::write(output, body)?;
        return Ok(Out::new(
            json!({ "written": output }),
            format!("Wrote {}.", output.display()),
        ));
    }
    Ok(Out::new(json, md))
}

pub fn memory(ctx: &Ctx, cmd: MemoryCmd) -> Result<Out> {
    match cmd {
        MemoryCmd::Set {
            book,
            key,
            value,
            locator,
        } => {
            let book = ctx.lib.find(&book)?;
            let at = locator.map(|l| l.parse::<Locator>()).transpose()?;
            let id = ctx.lib.remember(book.id, &key, &value, at, &ctx.author)?;
            Ok(Out::new(
                json!({ "id": id, "key": key }),
                format!("Remembered \"{key}\" for \"{}\".", book.title),
            ))
        }
        MemoryCmd::Get { book, key } => {
            let book = ctx.lib.find(&book)?;
            let entries = ctx.lib.memories(book.id, Some(&key))?;
            if entries.is_empty() {
                bail!("nothing remembered under \"{key}\"");
            }
            let text = entries
                .iter()
                .map(|m| format!("{} ({}): {}", m.key, m.author, m.value))
                .collect::<Vec<_>>()
                .join("\n");
            Ok(Out::new(json!({ "book": book.id, "entries": entries }), text))
        }
        MemoryCmd::List { book } => {
            let book = ctx.lib.find(&book)?;
            let entries = ctx.lib.memories(book.id, None)?;
            let text = if entries.is_empty() {
                "No memory for this book yet.".to_owned()
            } else {
                entries
                    .iter()
                    .map(|m| {
                        format!(
                            "- **{}**{} ({}): {}",
                            m.key,
                            m.locator.map(|l| format!(" `{l}`")).unwrap_or_default(),
                            m.author,
                            m.value
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            };
            Ok(Out::new(json!({ "book": book.id, "entries": entries }), text))
        }
    }
}
