# Roadmap

What the current version leaves out, and the questions still open.

## Platforms and distribution

vibe-reader builds and runs only on Linux today.

- Windows and macOS builds. The core and CLI are portable except for:
  - the live link, which needs a named pipe on Windows (`src/core/src/ipc.rs`);
  - the socket folder, taken from `dirs::runtime_dir()`, which exists only on
    Linux (`src/core/src/paths.rs`);
  - `config.toml` permissions, set to 0600 only under `#[cfg(unix)]`
    (`src/core/src/config.rs`).
- The release workflow needs a matrix with one job per target.
- AUR, Flatpak, Homebrew and winget packages.

## Performance

- Memory: the window and its WebKit processes take about 500 MB RSS (see
  [architecture](architecture.md#measurements)). Whether a hard ceiling is
  needed is still open.
- PDF scroll: a drawn page keeps its canvas until the layout changes, so a long
  scroll through a large PDF keeps adding memory. Release canvases of pages far
  from the view (`releaseCanvases`).
- Atmosphere: the reader asks the core for the look on every saved position
  (`reader.js`); a client-side cache would avoid the round trip.
- Startup time is not checked in CI, because runners have no display.

## Agents

- Authorship is self-declared: `--author user` or `VIBE_READER_AUTHOR=user`
  from a non-interactive process gets the reader's rights, so an agent can
  change or delete the reader's records. `user` should be accepted only at an
  interactive terminal, like `remove`.
- `--allow-spoilers` is not enforced either: the CLI accepts it from any
  caller, and the Skills ask the agent to use it only on request.
- The live link answers one request per connection, so an agent learns about
  what the reader sends from the window only by polling `context`.
- Agent answers in the window's Agent tab are memory entries named
  `answer.<topic>` by convention, and chapter summaries are `plot:ch<N>` by
  convention of `books-helper`. Neither is a record type the core knows.
- A built-in terminal and a "discuss" button next to the text.
- `quiz`: flashcards and tests from a book.
- `wordfreq` and `concordance`: word statistics for language learners.
- A sixth Skill, `reader-design`, for changing the UI and writing presets.

## Reading

- Reflowed PDF text in the window (now: pages drawn by pdf.js; agents already
  get the text).
- FB2 inside `.fb2.zip`; inline SVG covers in EPUB (now dropped by the
  sanitizer).
- Mermaid diagrams in technical books.

## Open questions

- Final project name (working name: vibe-reader).
- Whether a hard memory ceiling is needed (now only measured).
- What the mini shelf shows besides recent books.

## Decided during the first version

| Question | Decision |
|---|---|
| Atmosphere schema | Version 1, see [atmosphere schema](atmosphere-schema.md). |
| Bundled fonts | Literata, Spectral, Cormorant Garamond, Playfair Display, Onest, JetBrains Mono, all SIL OFL 1.1 with Cyrillic. |
| Notes export | Markdown and JSON (`version: 1`, books with their annotations). |
| Consent sections | `habits`, `genres`, `speed` under `[agent.consent]`, all off by default. |
| Command names | As in [CLI reference](../user/cli.md). |
| Ambient sound | Generated in the window with Web Audio, no sound files. |
| Parsed-book cache | JSON per book in `<data>/cache/`, keyed by file size and mtime. |
