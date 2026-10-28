# Roadmap

What the first version leaves out, and the questions still open.

## Platforms and distribution

- Windows and macOS builds. The core and CLI are portable; the live link needs
  a named pipe on Windows (`src/core/src/ipc.rs`), and the release workflow a
  matrix.
- AUR, Flatpak, Homebrew and winget packages. Desktop entries for the window
  and for quick view are in `packaging/`.

## Reading

- Reflowed PDF text in the window (now: pages drawn by pdf.js; agents already
  get the text).
- Annotations on PDF pages (needs a text layer mapped to locators).
- FB2 inside `.fb2.zip`; inline SVG covers in EPUB (now dropped by the
  sanitizer).
- Mermaid diagrams in technical books.
- A cache of parsed books, if large books open slower than ~200 ms.

## Agents

- A built-in terminal and a "discuss" button next to the text.
- `quiz`: flashcards and tests from a book.
- `wordfreq` and `concordance`: word statistics for language learners.
- A fifth Skill, `reader-design`, for changing the UI and writing presets.

## Atmosphere

- Ambient sound: the profile already reserves `sound`.
- Moving between ranges re-reads the atmosphere on every saved position; a
  client-side cache would avoid the round trip.

## Open questions

- Final project name (working name: vibe-reader).
- Whether a hard memory ceiling is needed (now only measured).
- What the mini shelf shows besides recent books.
- Startup time in CI, which needs a virtual display.

## Decided during the first version

| Question | Decision |
|---|---|
| Atmosphere schema | Version 1, see [atmosphere schema](atmosphere-schema.md). |
| Bundled fonts | Literata, Spectral, Cormorant Garamond, Playfair Display, Onest, JetBrains Mono, all SIL OFL 1.1 with Cyrillic. |
| Notes export | Markdown and JSON (`version: 1`, books with their annotations). |
| Consent sections | `habits`, `genres`, `speed` under `[agent.consent]`, all off by default. |
| Command names | As in [CLI reference](../user/cli.md). |
