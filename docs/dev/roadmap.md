# Roadmap

What the current version leaves out, and the questions still open.

## Platforms and distribution

vibe-reader builds and runs only on Linux today. The core and the CLI are
mostly portable; the gaps are listed per platform.

All platforms:

- `Paths::resolve` takes the socket folder from `dirs::runtime_dir()`, which
  exists only on Linux. macOS and Windows need a fallback (a folder in the
  user's cache or temp directory, private to the user).
- `config.toml` is written with mode 0600 under `#[cfg(unix)]` only. The keys
  need the same protection on Windows (an ACL limited to the current user).
- The release workflow becomes a matrix: one job per target, each with its own
  archive and checksum line.
- `doctor` checks the webview each platform depends on.

Windows:

- The live link needs a named pipe next to the Unix socket
  (`src/core/src/ipc.rs`, marked with a `shortcut:` comment). Until then the
  `live` commands report that live mode is unavailable.
- The window uses WebView2. The CSS behaviors the reader relies on (multi-column
  pagination with `column-fill: auto`, `hyphens: auto` for Russian, the Custom
  Highlight API) must be checked there before the first build.
- An MSI or NSIS installer from `cargo tauri build`, and a winget manifest.
- `skills install` defaults to `~/.claude/skills`; check the path resolves under
  `%USERPROFILE%`.

macOS:

- The window uses WKWebView. Pagination, hyphenation and the Highlight API need
  the same check as on Windows.
- A signed and notarized `.dmg` for Apple Silicon and Intel, and a Homebrew
  cask. Unsigned builds are blocked by Gatekeeper.
- Keyboard shortcuts use `Ctrl`; macOS readers expect `Cmd`. The palette and the
  key table in `docs/user/keyboard.md` need both.

Linux packages:

- AUR, Flatpak and a Nix package, with desktop entries and MIME types for EPUB,
  FB2, PDF and Markdown. The release ships only an archive and an AppImage now.
- ARM64 builds (aarch64 laptops and single-board computers).

## Performance

Measured numbers are in [architecture](architecture.md#measurements). The
items below are where the next gains are.

- Memory. The window and its WebKit processes take about 500 MB RSS, shared
  libraries counted in each. Measure which part is the webview and which is
  ours, then decide on a hard ceiling (an open question below). Pagination lays
  out a whole chapter in CSS columns; for very long chapters, splitting them
  into blocks laid out on demand would cut both memory and layout time.
- PDF scroll. Pages are drawn at least at 2x when they come near the view, but
  a drawn page keeps its canvas until the layout changes, so a long scroll
  through a large PDF keeps adding memory. Release canvases of pages far from
  the view (`releaseCanvases`) and draw them again on return.
- First open of a large PDF takes a few seconds while `pdf-extract` reads the
  text. Extract in the background and let the window show the pages from
  pdf.js meanwhile; agents wait for the text.
- The parsed-book cache is JSON. A binary form (or compressed JSON) would load
  faster and take less disk for large books; bump `CACHE_VERSION` when it
  changes.
- Atmosphere. The reader calls `atmosphere` on every saved position
  (`reader.js`). The window could fetch all layers of the book once and resolve
  ranges on its side, asking the core again only after `reload`.
- CPU when idle. Effects already stand still when the pointer rests; add a
  check in CI or a `--measure-idle` flag that fails when an idle reader uses
  more than a set share of one core.
- Startup. 265 to 500 ms against a 700 ms budget. Find what the first frame
  waits for (font loading, the library query, cover images) and defer what the
  first screen does not show.
- Binary size. The CLI is 8.6 MB though it has no UI. Check which features and
  dependencies it pulls in (`cargo bloat`) and drop what it does not need.
- CI cannot measure startup because runners have no display. A job under Xvfb
  or a headless Wayland compositor would catch regressions.

## Agents

The reader treats agents as guests: they work through the CLI, sign their
writes, stop at the reader's position and can undo themselves. The next steps
make that model harder to break and let agents do more without polling.

Trust:

- The author is self-declared. `--author user` or `VIBE_READER_AUTHOR=user`
  from a non-interactive process gets the reader's rights, so an agent can
  change or delete the reader's records. Refuse `user` outside an interactive
  terminal, the same way `remove` is refused.
- `--allow-spoilers` and the consent keys rely on the agent behaving. An agent
  with a shell can also edit `config.toml` directly. Options: have the window
  confirm spoiler reads, and sign the consent section so the CLI notices edits
  made outside Settings. Until then the docs should say these are guardrails
  for a cooperative agent, not a sandbox.
- Per-agent scopes in `config.toml`: read only, notes, atmosphere. An agent
  outside its scope gets an error that names the key to change.
- A test book full of prompt injection, and a check that every CLI output path
  marks its text as untrusted.

Talking to the reader:

- Events instead of polling. `vibe-reader live watch` streams page turns,
  selections and messages from the window as JSON lines, so an agent can react
  when the reader sends something. The IPC is one request per connection now;
  this needs a long-lived subscription.
- Replies as a thread. Answers in the Agent tab are memory entries named
  `answer.<topic>` by convention. A real reply that points at the message it
  answers would let the tab show a conversation without guessing.
- A "discuss" button next to selected text that starts the configured agent
  with the passage and the place, and a built-in terminal for it.
- An MCP server (`vibe-reader mcp`) exposing the same commands as tools, for
  agents that prefer tools to shell commands. It reuses the CLI code and the
  same author, spoiler and untrusted-text rules.

Memory and context:

- Chapter summaries. `books-helper` caches them as `plot:ch<N>` by convention.
  A first-class summary record per chapter, shared by all Skills and agents,
  would stop each agent from reading the book again.
- Budgets. `read --max-tokens` caps one call; a `context --budget N` that packs
  the place, recent text, notes and summaries into one answer would save
  agents several calls.
- Search by meaning. Optional, behind a Cargo feature, so the core stays light:
  a local embedding index per book, built on demand.

New abilities:

- `quiz`: flashcards and tests from a book, with spaced repetition.
- `wordfreq` and `concordance`: word statistics for language learners.
- A sixth Skill, `reader-design`, for changing the UI and writing presets.
- Skill evals: scripted conversations that check an agent keeps to the spoiler
  boundary, signs its writes and ignores instructions inside books.

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
