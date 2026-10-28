//! Reading text, search, context, progress and statistics.

use std::collections::BTreeMap;

use anyhow::{Context, Result, bail};
use serde_json::json;
use vibe_reader_core::excerpt::{self, CHARS_PER_TOKEN};
use vibe_reader_core::store::AnnotationKind;
use vibe_reader_core::{Book, Document, Locator, Span, Status};

use crate::output::{Out, date, percent, untrusted};
use crate::{Ctx, Period, ReadArgs};

/// Agents read at most up to the reader's position unless spoilers are allowed or the book is finished.
fn limit(book: &Book, allow_spoilers: bool) -> Option<Locator> {
    if allow_spoilers || book.status == Status::Finished {
        None
    } else {
        Some(book.position.unwrap_or_default())
    }
}

const SPOILER_HINT: &str =
    "The text stops at the reader's position. Pass --allow-spoilers only when the reader asked for text beyond it.";

fn book_or_current(ctx: &Ctx, query: Option<&str>) -> Result<Book> {
    match query {
        Some(query) => ctx.lib.find(query),
        None => ctx.lib.current()?.context("no book has been opened yet; name one"),
    }
}

/// The reader's position, re-anchored when the file changed.
fn position(ctx: &Ctx, book: &Book, doc: &Document) -> Result<Option<Locator>> {
    let Some(pos) = ctx.lib.position(book.id)? else {
        return Ok(None);
    };
    let resolved = pos.locator.resolve(&doc.texts(), &pos.quote);
    if resolved != pos.locator {
        ctx.lib.set_position(book.id, resolved, &pos.quote)?;
    }
    Ok(Some(resolved))
}

fn check_locator(doc: &Document, at: Locator) -> Result<()> {
    let Some(chapter) = doc.chapters.get(at.chapter) else {
        bail!("the book has {} chapters", doc.chapters.len())
    };
    let len = chapter.text.chars().count();
    if at.offset > len {
        bail!("chapter {} has {len} characters", at.chapter + 1);
    }
    Ok(())
}

pub fn toc(ctx: &Ctx, query: &str) -> Result<Out> {
    let book = ctx.lib.find(query)?;
    let doc = ctx.lib.document(&book)?;
    let mut text = format!("# {}\n\n", book.title);
    for entry in &doc.toc {
        text.push_str(&format!(
            "{}- {}  `ch:{}`\n",
            "  ".repeat(entry.level),
            entry.title,
            entry.chapter + 1
        ));
    }
    let entries: Vec<_> = doc
        .toc
        .iter()
        .map(|e| json!({ "title": e.title, "level": e.level, "locator": Locator::new(e.chapter, 0), "chars": doc.chapters[e.chapter].text.chars().count() }))
        .collect();
    Ok(Out::new(
        json!({ "book": book.id, "title": book.title, "chapters": doc.chapters.len(), "toc": entries }),
        text,
    ))
}

pub fn read(ctx: &Ctx, args: ReadArgs) -> Result<Out> {
    let book = book_or_current(ctx, args.book.as_deref())?;
    let doc = ctx.lib.document(&book)?;
    let mut stop = limit(&book, args.allow_spoilers);
    if stop.is_some() {
        stop = Some(position(ctx, &book, &doc)?.unwrap_or_default());
    }
    let from = if let Some(chapter) = args.chapter {
        if chapter == 0 {
            bail!("chapters start at 1");
        }
        Locator::new(chapter - 1, 0)
    } else if let Some(locator) = &args.locator {
        locator.parse()?
    } else if let Some(range) = &args.range {
        let span: Span = range.parse()?;
        check_locator(&doc, span.end)?;
        stop = Some(stop.map_or(span.end, |s| s.min(span.end)));
        span.start
    } else if args.resume {
        ctx.lib.cursor(book.id, &ctx.author)?.unwrap_or_default()
    } else {
        Locator::default()
    };
    check_locator(&doc, from)?;
    let chunk = excerpt::chunk(&doc, from, args.max_tokens * CHARS_PER_TOKEN, stop);
    ctx.lib
        .set_cursor(book.id, &ctx.author, chunk.next.unwrap_or(chunk.to))?;

    let spoiler_stop = chunk.limited && args.range.is_none() && !args.allow_spoilers;
    let mut text = format!(
        "## {} · {}\n`{}..{}`\n\n{}\n",
        book.title,
        chunk.chapter_title,
        chunk.from,
        chunk.to,
        untrusted(&chunk.text)
    );
    match chunk.next {
        Some(next) => text.push_str(&format!(
            "\nNext: `vibe-reader read {} --locator {next}` or `--continue`.",
            book.id
        )),
        None if spoiler_stop => text.push_str(&format!("\n{SPOILER_HINT}")),
        None => text.push_str("\nEnd of the requested text."),
    }
    Ok(Out::new(
        json!({
            "book": book.id,
            "chapter": chunk.from.chapter + 1,
            "chapter_title": chunk.chapter_title,
            "from": chunk.from,
            "to": chunk.to,
            "next": chunk.next,
            "stopped_at_reader_position": spoiler_stop,
            "untrusted": true,
            "content": chunk.text,
        }),
        text,
    ))
}

pub fn search(ctx: &Ctx, query_book: &str, query: &str, regex: bool, allow_spoilers: bool, max: usize) -> Result<Out> {
    let book = ctx.lib.find(query_book)?;
    let doc = ctx.lib.document(&book)?;
    let stop = match limit(&book, allow_spoilers) {
        Some(_) => Some(position(ctx, &book, &doc)?.unwrap_or_default()),
        None => None,
    };
    let hits = excerpt::search(&doc, query, regex, stop, max)?;
    let mut text = format!("{} matches in \"{}\"", hits.len(), book.title);
    if stop.is_some() {
        text.push_str(" before the reader's position");
    }
    text.push_str(":\n\n");
    for hit in &hits {
        text.push_str(&format!("- `{}` {}\n", hit.locator, hit.chapter_title));
    }
    if !hits.is_empty() {
        let snippets: Vec<String> = hits.iter().map(|h| format!("[{}] {}", h.locator, h.snippet)).collect();
        text.push_str(&format!("\n{}\n", untrusted(&snippets.join("\n"))));
    }
    Ok(Out::new(
        json!({ "book": book.id, "limited_to_reader_position": stop.is_some(), "untrusted": true, "hits": hits }),
        text,
    ))
}

pub fn context(ctx: &Ctx, query: Option<&str>, max_tokens: usize) -> Result<Out> {
    let book = book_or_current(ctx, query)?;
    let doc = ctx.lib.document(&book)?;
    let at = position(ctx, &book, &doc)?.unwrap_or_default();
    let chapter = doc.chapters.get(at.chapter).context("position is outside the book")?;
    let recent = excerpt::before(&doc, at, max_tokens * CHARS_PER_TOKEN);
    let notes: Vec<_> = ctx
        .lib
        .annotations(book.id, None)?
        .into_iter()
        .filter(|a| a.start.chapter == at.chapter && a.start <= at)
        .collect();
    let memory = ctx.lib.memories(book.id, None)?;

    let mut text = format!(
        "# {}\n\nChapter {}: {}\nPosition: `{at}` ({} of the book)\nStatus: {}\n",
        book.title,
        at.chapter + 1,
        chapter.title,
        percent(book.progress_at(at)),
        book.status.as_str()
    );
    if !notes.is_empty() {
        text.push_str("\n## Notes in this chapter\n\n");
        for note in &notes {
            text.push_str(&format!(
                "- `{}` [{} by {}] {}\n",
                note.start,
                note.kind.as_str(),
                note.author,
                note.body
            ));
        }
    }
    if !memory.is_empty() {
        text.push_str(&format!(
            "\nAgent memory has {} entries: `vibe-reader memory list --book {}`.\n",
            memory.len(),
            book.id
        ));
    }
    text.push_str(&format!("\n## Text before the position\n\n{}\n", untrusted(&recent)));
    Ok(Out::new(
        json!({
            "book": { "id": book.id, "title": book.title, "authors": book.authors, "kind": book.kind, "status": book.status },
            "chapter": { "index": at.chapter + 1, "title": chapter.title },
            "position": at,
            "progress": book.progress_at(at),
            "selection": null,
            "notes": notes,
            "memory_entries": memory.len(),
            "untrusted": true,
            "recent_text": recent,
        }),
        text,
    ))
}

/// Words per minute used when the reader's own speed is unknown or private.
const DEFAULT_WPM: f64 = 200.0;

pub fn stats(ctx: &Ctx, query: Option<&str>, reader: bool, period: Period) -> Result<Out> {
    if reader {
        return reader_stats(ctx, period);
    }
    let book = book_or_current(ctx, query)?;
    let left = book.words as f64 * (1.0 - book.progress);
    let text = format!(
        "# {}\n\nChapters: {}\nWords: {}\nCharacters: {}\nReading time: about {} min ({} min left)\nProgress: {}\n",
        book.title,
        book.chapters(),
        book.words,
        book.chars,
        (book.words as f64 / DEFAULT_WPM).round(),
        (left / DEFAULT_WPM).round(),
        percent(book.progress)
    );
    Ok(Out::new(
        json!({
            "book": book.id,
            "chapters": book.chapters(),
            "chapter_chars": book.chapter_chars,
            "words": book.words,
            "chars": book.chars,
            "minutes": (book.words as f64 / DEFAULT_WPM).round(),
            "minutes_left": (left / DEFAULT_WPM).round(),
            "progress": book.progress,
        }),
        text,
    ))
}

fn consent_error(part: &str) -> anyhow::Error {
    anyhow::anyhow!(
        "the reader has not shared their {part} with agents; they can allow it with `[agent.consent] {part} = true` in config.toml (`vibe-reader config path`)"
    )
}

fn reader_stats(ctx: &Ctx, period: Period) -> Result<Out> {
    let consent = ctx.config.agent.consent;
    if !(consent.habits || consent.speed || consent.genres) {
        return Err(consent_error("habits"));
    }
    let sessions = ctx.lib.sessions(period.since(), None)?;
    let seconds: i64 = sessions.iter().map(|s| s.seconds()).sum();
    let words: usize = sessions.iter().map(|s| s.words).sum();
    let mut json = json!({ "period_start": period.since(), "shared": consent });
    let mut text = String::from("# Reader statistics\n\n");
    if consent.habits {
        let mut by_hour = [0i64; 24];
        let mut by_day: BTreeMap<String, usize> = BTreeMap::new();
        for s in &sessions {
            by_hour[(s.started_at.rem_euclid(86_400) / 3600) as usize] += s.seconds();
            *by_day.entry(date(s.started_at)[..10].to_owned()).or_default() += s.words;
        }
        json["habits"] = json!({ "sessions": sessions.len(), "minutes": seconds / 60, "words": words, "seconds_by_utc_hour": by_hour, "words_by_day": by_day });
        text.push_str(&format!(
            "Sessions: {}, {} min, {} words\n",
            sessions.len(),
            seconds / 60,
            words
        ));
        let busiest = by_hour
            .iter()
            .enumerate()
            .max_by_key(|(_, s)| **s)
            .filter(|(_, s)| **s > 0);
        if let Some((hour, _)) = busiest {
            text.push_str(&format!("Most reading starts at {hour:02}:00 UTC\n"));
        }
    }
    if consent.speed {
        let wpm = if seconds > 0 {
            words as f64 / (seconds as f64 / 60.0)
        } else {
            0.0
        };
        json["speed"] = json!({ "words_per_minute": wpm.round() });
        text.push_str(&format!("Speed: {} words per minute\n", wpm.round()));
    }
    if consent.genres {
        let books = ctx.lib.books()?;
        let mut kinds: BTreeMap<&str, usize> = BTreeMap::new();
        let mut authors: BTreeMap<&str, usize> = BTreeMap::new();
        for book in &books {
            *kinds.entry(book.kind.as_str()).or_default() += 1;
            for author in &book.authors {
                *authors.entry(author).or_default() += 1;
            }
        }
        json["genres"] = json!({ "kinds": kinds, "authors": authors, "finished": books.iter().filter(|b| b.status == Status::Finished).count(), "dropped": books.iter().filter(|b| b.status == Status::Dropped).count() });
        text.push_str(&format!("Books by kind: {kinds:?}\n"));
    }
    Ok(Out::new(json, text))
}

pub fn progress(ctx: &Ctx, query: &str, set: Option<&str>) -> Result<Out> {
    let mut book = ctx.lib.find(query)?;
    let doc = ctx.lib.document(&book)?;
    if let Some(set) = set {
        let at: Locator = set.parse()?;
        check_locator(&doc, at)?;
        ctx.lib
            .set_position(book.id, at, &at.quote(&doc.chapters[at.chapter].text))?;
        book = ctx.lib.book(book.id)?;
    }
    let at = position(ctx, &book, &doc)?;
    let chapter = at.and_then(|a| doc.chapters.get(a.chapter)).map(|c| c.title.clone());
    let text = match at {
        Some(at) => format!(
            "\"{}\": {} at `{at}`, {}, status {}",
            book.title,
            percent(book.progress),
            chapter.clone().unwrap_or_default(),
            book.status.as_str()
        ),
        None => format!("\"{}\": not started, status {}", book.title, book.status.as_str()),
    };
    Ok(Out::new(
        json!({ "book": book.id, "position": at, "chapter_title": chapter, "progress": book.progress, "status": book.status }),
        text,
    ))
}

pub fn sessions(ctx: &Ctx, period: Period, query: Option<&str>) -> Result<Out> {
    if !ctx.config.agent.consent.habits {
        return Err(consent_error("habits"));
    }
    let book = query.map(|q| ctx.lib.find(q)).transpose()?;
    let sessions = ctx.lib.sessions(period.since(), book.map(|b| b.id))?;
    let text = if sessions.is_empty() {
        "No sessions in this period.".to_owned()
    } else {
        sessions
            .iter()
            .map(|s| {
                format!(
                    "{}  {:>3} min  {:>5} words  {}  `{}..{}`",
                    date(s.started_at),
                    s.seconds() / 60,
                    s.words,
                    s.title,
                    s.start,
                    s.end
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };
    Ok(Out::new(json!({ "sessions": sessions }), text))
}

pub fn recap(ctx: &Ctx, query: &str, max_tokens: usize) -> Result<Out> {
    let book = ctx.lib.find(query)?;
    let doc = ctx.lib.document(&book)?;
    let last = ctx
        .lib
        .sessions(0, Some(book.id))?
        .pop()
        .context("no reading sessions for this book yet")?;
    let span = Span {
        start: last.start,
        end: last.end.max(last.start),
    };
    let chapters: Vec<String> = (span.start.chapter..=span.end.chapter.min(doc.chapters.len().saturating_sub(1)))
        .map(|i| doc.chapters[i].title.clone())
        .collect();
    let notes: Vec<_> = ctx
        .lib
        .annotations(book.id, None)?
        .into_iter()
        .filter(|a| a.start >= span.start && a.start <= span.end && a.kind != AnnotationKind::Bookmark)
        .collect();
    let chunk = excerpt::chunk(&doc, span.start, max_tokens * CHARS_PER_TOKEN, Some(span.end));
    let mut text = format!(
        "# Last session in \"{}\"\n\n{}, {} min, `{span}`\nChapters: {}\n",
        book.title,
        date(last.started_at),
        last.seconds() / 60,
        chapters.join(", ")
    );
    for note in &notes {
        text.push_str(&format!(
            "- `{}` [{} by {}] {}\n",
            note.start,
            note.kind.as_str(),
            note.author,
            note.body
        ));
    }
    text.push_str(&format!("\n{}\n", untrusted(&chunk.text)));
    Ok(Out::new(
        json!({ "book": book.id, "session": last, "range": span, "chapters": chapters, "notes": notes, "untrusted": true, "content": chunk.text, "next": chunk.next }),
        text,
    ))
}
