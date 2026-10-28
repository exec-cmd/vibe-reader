# Configuration

## Where files live

| What | Default path |
|---|---|
| Library database | `~/.local/share/vibe-reader/library.db` |
| Copied books | `~/.local/share/vibe-reader/books/` |
| Illustrations | `~/.local/share/vibe-reader/art/` |
| Settings | `~/.config/vibe-reader/config.toml` |
| Design overrides | `~/.config/vibe-reader/ui/` |
| Your presets | `~/.config/vibe-reader/presets/` |

The XDG variables (`XDG_DATA_HOME`, `XDG_CONFIG_HOME`) move these folders as
usual. Set `VIBE_READER_HOME` to keep everything under one folder instead
(`data/`, `config/`, `run/`), for example for a portable setup or for tests.

`vibe-reader config` prints the settings in effect, `vibe-reader config path`
prints the file location, and `vibe-reader config edit` opens it in `$EDITOR`.

## config.toml

Every key is optional; missing keys use the defaults below.

```toml
[reader]
locale = "auto"        # auto, en or ru
preset = "study"       # atmosphere for books without their own
mode = "auto"          # auto, light or dark
vim = false            # h/j/k/l and friends in the reader window
reduce_motion = false  # no particles or transitions, whatever the system says

[typography]
font = "auto"          # auto (from the atmosphere), a bundled font, "system", or any installed family
size = 19.0            # px
width = 34.0           # line length in em
line_height = 1.6
justify = true
hyphens = true

[agent.consent]        # what AI agents may see about you; all off by default
habits = false         # sessions, time of day, how much you read
genres = false         # which books and authors you pick
speed = false          # reading speed
```

## What agents may see

Agents read your books, notes and progress through the CLI. Your reader profile
(habits, genres, speed) stays private until you turn on a key under
`[agent.consent]`. `vibe-reader config edit` works only at an interactive
terminal, so an agent cannot grant itself access.
