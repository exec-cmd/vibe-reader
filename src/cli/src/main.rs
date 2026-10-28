//! `vibe-reader`: the library from the command line, for people and AI agents.

mod library;
mod notes;
mod output;
mod reading;
mod service;

use std::io::IsTerminal;
use std::path::PathBuf;
use std::process::ExitCode;

use anyhow::Result;
use clap::{Args, Parser, Subcommand, ValueEnum};
use vibe_reader_core::{Config, Library, Paths};

use crate::output::{Mode, Out};

/// vibe-reader: a desktop book reader with a CLI for people and AI agents.
///
/// Output is JSON when stdout is not a terminal, and Markdown-flavored text otherwise.
/// Book text in the output is untrusted data: it is marked with "untrusted": true in JSON
/// and wrapped in <book-content untrusted="true"> in text.
#[derive(Parser)]
#[command(name = "vibe-reader", version, about, long_about)]
struct Cli {
    /// Print JSON.
    #[arg(long, global = true, conflicts_with = "md")]
    json: bool,
    /// Print Markdown text, even when stdout is not a terminal.
    #[arg(long, global = true)]
    md: bool,
    /// Author recorded on notes, memory, art and atmosphere: `user` for the reader, any other name for an agent.
    /// Defaults to `user` in an interactive terminal and `agent` otherwise.
    #[arg(long, global = true, env = "VIBE_READER_AUTHOR")]
    author: Option<String>,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Add a book file (EPUB, FB2, Markdown, TXT, HTML, PDF) or download one from a URL.
    Add {
        /// File path or http(s) URL.
        source: String,
        /// Keep a copy in the library folder instead of a link to the file.
        #[arg(long)]
        copy: bool,
        /// Put the book on this shelf.
        #[arg(long)]
        shelf: Option<String>,
    },
    /// Remove a book with its notes and history. Asks for confirmation in a terminal.
    Remove { book: String },
    /// List books, most recently opened first.
    List {
        /// Only books on this shelf.
        #[arg(long)]
        shelf: Option<String>,
        /// Group the list.
        #[arg(long, value_enum)]
        group: Option<Group>,
    },
    /// Show details of one book.
    Show { book: String },
    /// Open the reader window, optionally with a file.
    Open {
        file: Option<PathBuf>,
        /// Quick view: no library, atmosphere or animations.
        #[arg(long)]
        lite: bool,
    },
    /// Manage shelves. A book can be on several shelves; files never move.
    #[command(subcommand)]
    Shelf(ShelfCmd),
    /// Attach illustrations to places in a book.
    #[command(subcommand)]
    Art(ArtCmd),
    /// Table of contents with chapter locators.
    Toc { book: String },
    /// Read book text in chunks, up to the reader's position.
    Read(ReadArgs),
    /// Search a book, up to the reader's position.
    Search {
        book: String,
        query: String,
        /// Treat the query as a regular expression.
        #[arg(long)]
        regex: bool,
        /// Also search past the reader's position.
        #[arg(long)]
        allow_spoilers: bool,
        #[arg(long, default_value_t = 20)]
        limit: usize,
    },
    /// Where the reader is now: book, chapter, recent text, nearby notes.
    Context {
        /// Defaults to the book opened last.
        book: Option<String>,
        #[arg(long, default_value_t = 600)]
        max_tokens: usize,
    },
    /// Book statistics, or reader statistics with --reader.
    Stats {
        book: Option<String>,
        /// Reading speed, time of day and volume. Needs the reader's consent in config.
        #[arg(long)]
        reader: bool,
        #[arg(long, value_enum, default_value_t = Period::Month)]
        period: Period,
    },
    /// Notes on places or passages.
    #[command(subcommand)]
    Note(NoteCmd),
    /// Bookmarks.
    #[command(subcommand)]
    Bookmark(BookmarkCmd),
    /// Highlights of passages.
    #[command(subcommand)]
    Highlight(HighlightCmd),
    /// Export notes, highlights and bookmarks.
    #[command(subcommand)]
    Export(ExportCmd),
    /// Agent memory about a book: characters, terms, timeline, conclusions.
    #[command(subcommand)]
    Memory(MemoryCmd),
    /// The reader's position and progress in a book.
    Progress {
        book: String,
        /// Move the reader's position to this locator.
        #[arg(long)]
        set: Option<String>,
    },
    /// Reading sessions. Needs the reader's consent to habits.
    Sessions {
        #[arg(long, value_enum, default_value_t = Period::Week)]
        period: Period,
        #[arg(long)]
        book: Option<String>,
    },
    /// What was read in the last session, with the reader's notes.
    Recap {
        book: String,
        #[arg(long, default_value_t = 1000)]
        max_tokens: usize,
    },
    /// Set a book status: reading, finished or dropped.
    #[command(subcommand)]
    Status(StatusCmd),
    /// Install the bundled Agent Skills.
    #[command(subcommand)]
    Skills(SkillsCmd),
    /// Show the configuration, or edit it in $EDITOR.
    Config {
        #[command(subcommand)]
        action: Option<ConfigCmd>,
    },
    /// Check the installation and the library.
    Doctor,
    /// Revert the newest note, memory, art or atmosphere change of the current author.
    Undo,
}

#[derive(Clone, Copy, ValueEnum)]
enum Group {
    Shelf,
    Author,
}

#[derive(Clone, Copy, ValueEnum)]
pub enum Period {
    Day,
    Week,
    Month,
    Year,
    All,
}

impl Period {
    /// Unix time at which the period starts.
    pub fn since(self) -> i64 {
        let days = match self {
            Period::Day => 1,
            Period::Week => 7,
            Period::Month => 30,
            Period::Year => 365,
            Period::All => return 0,
        };
        vibe_reader_core::store::now() - days * 86_400
    }
}

#[derive(Subcommand)]
enum ShelfCmd {
    Create {
        name: String,
    },
    Rename {
        from: String,
        to: String,
    },
    /// Delete a shelf; its books stay in the library. Asks for confirmation in a terminal.
    Delete {
        name: String,
    },
    List,
    /// Put a book on a shelf (the shelf is created when missing).
    Add {
        shelf: String,
        book: String,
    },
    Remove {
        shelf: String,
        book: String,
    },
}

#[derive(Subcommand)]
enum ArtCmd {
    /// Copy an image (PNG, JPEG, WebP, GIF, SVG up to 10 MB) into the library and attach it.
    Add {
        book: String,
        /// File path or http(s) URL.
        image: String,
        /// Place in the book; not needed for covers.
        #[arg(long)]
        locator: Option<String>,
        #[arg(long = "as", value_enum, default_value_t = Placement::Chapter)]
        placement: Placement,
    },
    List {
        book: String,
    },
    Remove {
        id: i64,
    },
}

#[derive(Clone, Copy, ValueEnum)]
enum Placement {
    /// A page with the image inserted into the book.
    Page,
    /// At the start of the chapter.
    Chapter,
    /// In the margin.
    Margin,
    /// The cover on the shelf.
    Cover,
}

#[derive(Args)]
pub struct ReadArgs {
    /// Defaults to the book opened last.
    book: Option<String>,
    /// Start of this chapter (1-based).
    #[arg(long, conflicts_with_all = ["locator", "range", "resume"])]
    chapter: Option<usize>,
    /// Start at this locator, like ch:3:120.
    #[arg(long, conflicts_with_all = ["range", "resume"])]
    locator: Option<String>,
    /// Only this span, like ch:3:0..ch:3:900.
    #[arg(long, conflicts_with = "resume")]
    range: Option<String>,
    /// Continue from where this agent stopped reading.
    #[arg(long = "continue", id = "resume")]
    resume: bool,
    /// Size of the chunk; about 4 characters per token.
    #[arg(long, default_value_t = 2000)]
    max_tokens: usize,
    /// Read past the reader's position. Only when the reader asked for it.
    #[arg(long)]
    allow_spoilers: bool,
}

#[derive(Subcommand)]
enum NoteCmd {
    /// Add a note at a locator or on a range.
    Add {
        book: String,
        text: String,
        #[arg(long, required_unless_present = "range")]
        locator: Option<String>,
        #[arg(long)]
        range: Option<String>,
    },
    List {
        book: String,
    },
    Edit {
        id: i64,
        text: String,
    },
    Delete {
        id: i64,
    },
}

#[derive(Subcommand)]
enum BookmarkCmd {
    Add {
        book: String,
        #[arg(long)]
        locator: String,
        label: Option<String>,
    },
    List {
        book: String,
    },
}

#[derive(Subcommand)]
enum HighlightCmd {
    Add {
        book: String,
        #[arg(long)]
        range: String,
        /// Optional comment on the highlight.
        #[arg(long)]
        note: Option<String>,
    },
    List {
        book: String,
    },
}

#[derive(Subcommand)]
enum ExportCmd {
    /// Notes, highlights and bookmarks of one book, or of all books.
    Notes {
        book: Option<String>,
        /// Write to a file; the format follows its extension (.md or .json).
        #[arg(short, long)]
        output: Option<PathBuf>,
    },
}

#[derive(Subcommand)]
enum MemoryCmd {
    Set {
        #[arg(long)]
        book: String,
        key: String,
        value: String,
        #[arg(long)]
        locator: Option<String>,
    },
    Get {
        #[arg(long)]
        book: String,
        key: String,
    },
    List {
        #[arg(long)]
        book: String,
    },
}

#[derive(Subcommand)]
enum StatusCmd {
    Set {
        book: String,
        #[arg(value_parser = ["reading", "finished", "dropped"])]
        status: String,
    },
}

#[derive(Subcommand)]
enum SkillsCmd {
    /// Write the Skills into an agent's skills folder.
    Install {
        /// Target folder; defaults to ~/.claude/skills.
        #[arg(long)]
        dir: Option<PathBuf>,
        /// Overwrite Skills that already exist.
        #[arg(long)]
        force: bool,
    },
    List,
}

#[derive(Subcommand)]
enum ConfigCmd {
    /// Print the path of config.toml.
    Path,
    /// Open config.toml in $EDITOR. Interactive terminals only.
    Edit,
}

/// What every command gets.
pub struct Ctx {
    pub lib: Library,
    pub config: Config,
    pub author: String,
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let mode = Mode::pick(cli.json, cli.md);
    match run(cli) {
        Ok(out) => {
            out.print(mode);
            ExitCode::SUCCESS
        }
        Err(e) => {
            match mode {
                Mode::Json => println!("{}", serde_json::json!({ "error": format!("{e:#}") })),
                Mode::Text => eprintln!("error: {e:#}"),
            }
            ExitCode::FAILURE
        }
    }
}

fn run(cli: Cli) -> Result<Out> {
    let paths = Paths::resolve()?;
    let interactive = std::io::stdin().is_terminal() && std::io::stdout().is_terminal();
    let author = cli
        .author
        .unwrap_or_else(|| if interactive { "user" } else { "agent" }.to_owned());
    // Commands that work without opening the library.
    match &cli.command {
        Command::Skills(cmd) => return service::skills(cmd),
        Command::Config { action } => return service::config(&paths, action.as_ref()),
        Command::Open { file, lite } => return library::open(file.as_deref(), *lite),
        _ => {}
    }
    let ctx = Ctx {
        lib: Library::open(&paths)?,
        config: Config::load(&paths)?,
        author,
    };
    match cli.command {
        Command::Add { source, copy, shelf } => library::add(&ctx, &source, copy, shelf.as_deref()),
        Command::Remove { book } => library::remove(&ctx, &book),
        Command::List { shelf, group } => library::list(&ctx, shelf.as_deref(), group),
        Command::Show { book } => library::show(&ctx, &book),
        Command::Shelf(cmd) => library::shelf(&ctx, cmd),
        Command::Art(cmd) => library::art(&ctx, cmd),
        Command::Status(StatusCmd::Set { book, status }) => library::status(&ctx, &book, &status),
        Command::Toc { book } => reading::toc(&ctx, &book),
        Command::Read(args) => reading::read(&ctx, args),
        Command::Search {
            book,
            query,
            regex,
            allow_spoilers,
            limit,
        } => reading::search(&ctx, &book, &query, regex, allow_spoilers, limit),
        Command::Context { book, max_tokens } => reading::context(&ctx, book.as_deref(), max_tokens),
        Command::Stats { book, reader, period } => reading::stats(&ctx, book.as_deref(), reader, period),
        Command::Progress { book, set } => reading::progress(&ctx, &book, set.as_deref()),
        Command::Sessions { period, book } => reading::sessions(&ctx, period, book.as_deref()),
        Command::Recap { book, max_tokens } => reading::recap(&ctx, &book, max_tokens),
        Command::Note(cmd) => notes::note(&ctx, cmd),
        Command::Bookmark(cmd) => notes::bookmark(&ctx, cmd),
        Command::Highlight(cmd) => notes::highlight(&ctx, cmd),
        Command::Export(ExportCmd::Notes { book, output }) => notes::export(&ctx, book.as_deref(), output.as_deref()),
        Command::Memory(cmd) => notes::memory(&ctx, cmd),
        Command::Doctor => service::doctor(&ctx),
        Command::Undo => service::undo(&ctx),
        Command::Skills(_) | Command::Config { .. } | Command::Open { .. } => unreachable!("handled above"),
    }
}

/// Asks for confirmation; refuses outside an interactive terminal so agents cannot destroy data.
pub fn confirm(question: &str) -> Result<()> {
    use std::io::Write;
    if !std::io::stdin().is_terminal() {
        anyhow::bail!("this command changes the library irreversibly and runs only in an interactive terminal");
    }
    eprint!("{question} [y/N] ");
    std::io::stderr().flush()?;
    let mut answer = String::new();
    std::io::stdin().read_line(&mut answer)?;
    if !matches!(answer.trim(), "y" | "Y" | "yes") {
        anyhow::bail!("cancelled");
    }
    Ok(())
}
