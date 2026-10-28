[Русская версия](ru/configuration.md)

# Configuration

## Settings

Open the settings with **Settings** in the library toolbar, or press `Ctrl+,`.
The settings page has these sections:

| Section | What it holds |
|---|---|
| Appearance | Theme (Auto, Light, Dark), Language (Auto, English, Русский), Reduce motion. |
| Reading | Books layout, font, size, line length, line spacing, justification, hyphenation, and a live preview. |
| PDF | Layout (Spread, One page, Scroll), Page size (Whole page, Page width), Dark pages in dark mode. |
| Library | Start in the mini library, Keep copies of added files, Group, Sort. |
| Atmosphere | Default preset cards, Particles and light effects, the path of `user.css`, and the presets folder. |
| AI agents | What agents may see: reading habits, reading speed and tastes. All are off by default. Also how to install Skills. |
| Keyboard | Vim keys, and the list of shortcuts. |
| About | Version, and the paths of the settings file, library folder, design overrides folder and presets folder. Click a path to copy it. |

Changes apply at once and are saved to `config.toml`.

## Where files live

| What | Default path |
|---|---|
| Library database | `~/.local/share/vibe-reader/library.db` |
| Parsed-book cache | `~/.local/share/vibe-reader/cache/` |
| Covers | `~/.local/share/vibe-reader/covers/` |
| Illustrations | `~/.local/share/vibe-reader/art/` |
| Copied books | `~/.local/share/vibe-reader/books/` |
| Settings | `~/.config/vibe-reader/config.toml` |
| Design overrides | `~/.config/vibe-reader/ui/` |
| Your presets | `~/.config/vibe-reader/presets/` |

The XDG variables (`XDG_DATA_HOME`, `XDG_CONFIG_HOME`) move these folders as
usual. Set `VIBE_READER_HOME` to keep everything under one folder instead
(`data/`, `config/`, `run/`), for example for a portable setup or for tests.

`vibe-reader config` prints the settings in effect, `vibe-reader config path`
prints the file location, and `vibe-reader config edit` opens it in `$EDITOR`.

## config.toml

Every key is optional. Missing keys use the defaults below.

```toml
[reader]
locale = "auto"        # auto, en, ru
preset = "study"
mode = "auto"          # auto, light, dark
vim = false
reduce_motion = false
layout = "spread"      # spread, pages, scroll
particles = true

[typography]
font = "auto"          # auto (from the atmosphere), a bundled font, "system", any installed family
size = 19.0            # px, 14 to 30
width = 34.0           # line length in em, 22 to 50
line_height = 1.6      # 1.2 to 2.2
justify = true
hyphens = true

[library]
group = "shelf"        # shelf, author, format, status, none
sort = "recent"        # recent, title, author, progress, added
start_mini = false
copy_on_import = false

[pdf]
layout = "spread"      # spread, single, scroll
fit = "page"           # page, width
invert_dark = true

[agent.consent]
habits = false
genres = false
speed = false
```

The `preset` key sets the atmosphere for books that have no atmosphere of their own.

## What agents may see

Agents read your books, notes and progress through the CLI. Your reader profile
(habits, genres, speed) stays private until you turn on a key under
`[agent.consent]`. You can also turn these on in Settings → AI agents.
`vibe-reader config edit` works only at an interactive terminal, so an agent
cannot grant itself access.
