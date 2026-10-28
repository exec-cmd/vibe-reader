# Implementation progress

Temporary checklist for building the first version. It is removed together with `docs/concept.md` in phase 5. Tick an item only after it is verified.

## Phase 0. Workspace and prototype

- [x] Workspace with `src/core`, `src/cli`, `src/gui`
- [x] Tauri window served over the `vr://` scheme, UI overrides from `<config>/ui` with live reload
- [x] Measurements (size, startup, memory, CSS columns) in `docs/dev/architecture.md`
- [x] CI workflow
- [x] Draft README, CONTRIBUTING, AGENTS

## Phase 1. Core and offline CLI

- [x] Config, database, migrations
- [x] Formats: EPUB, Markdown, TXT, HTML (FB2 and PDF are stubs until phase 4)
- [x] Sanitizer with block offsets, locators
- [x] CLI command groups 1–6 and offline service commands
- [x] Skills: reader-cli, reader-analyze, reader-discuss, reader-atmosphere
- [x] Tests, docs (data-model, locator, cli, agents, configuration)

## Phase 2. GUI reader and lite mode

- [x] UI modules: app, library, reader, panels, palette, i18n
- [x] Tauri commands, sessions, notes
- [x] Fonts and vendored libraries
- [x] Lite mode, Markdown live reload
- [x] Screenshots and startup check, docs (getting-started, reading, keyboard, ui)

## Phase 3. Atmosphere and live IPC

- [ ] Profile schema, validation, presets
- [ ] Backgrounds, particles, headings, illustrations
- [ ] IPC server and `live`/`gui` commands
- [ ] Tests, docs (atmosphere, atmosphere-schema, ipc)

## Phase 4. FB2 and PDF

- [ ] FB2
- [ ] PDF (text for agents, pdf.js view)
- [ ] Release workflow, docs (releasing)

## Phase 5. Documentation and cleanup

- [ ] README and README_RU
- [ ] Architecture and roadmap from the concept
- [ ] Link check
- [ ] Remove concept, mockup and this file
