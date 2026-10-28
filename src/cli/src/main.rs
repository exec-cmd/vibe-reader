use clap::Parser;

/// vibe-reader: a desktop book reader with a CLI for AI agents.
#[derive(Parser)]
#[command(version, about)]
struct Cli {}

fn main() {
    Cli::parse();
}
