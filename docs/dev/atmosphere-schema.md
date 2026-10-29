# Atmosphere profile schema

Version 1. Code: `src/core/src/atmosphere.rs`; built-in presets:
`src/core/presets/`.

A profile is TOML or JSON. Unknown fields are errors. Every field is optional;
a profile states only what it changes.

## Top level

| Field | Type | Meaning |
|---|---|---|
| `version` | integer | Schema version; only `1` is accepted. |
| `base` | string | Start over from this preset before applying the rest. |
| `mode` | `"light"` \| `"dark"` | Force a mode instead of following the reader's setting. |
| `preset` | table | Only in preset files: `name`, `description`, `modes` (at least one). |

## `[palette.light]`, `[palette.dark]`

Colors as `#rgb` or `#rrggbb`: `paper`, `paper_2` (panels), `ink` (text),
`muted`, `rule` (lines), `accent` (links, marks), `spine` (library spine).

## `[type]`

`display` (headings) and `body` (text), each one of the bundled fonts:
Literata, Spectral, Cormorant Garamond, Playfair Display, Onest, JetBrains
Mono. The reader's own font setting wins over `body` unless it is `auto`.

## `[background]`

| Field | Values |
|---|---|
| `kind` | `none`, `lamp`, `grid`, `blinds`, `fog`, `clouds`, `ridges`, `texture`, `gradient`, `image` |
| `image` | For `image`: an art file name from `vibe-reader art list` |
| `dim` | 0–0.9; how much paper covers the background behind the text |

## `[particles]`

| Field | Values |
|---|---|
| `kind` | `none`, `dust`, `rain`, `downpour`, `snow`, `bokeh` |
| `density` | 0–1 |
| `speed` | 0.1–3 |
| `lightning` | `true` for a faint flash at most every 6 seconds |

## `[chapter]`

| Field | Values |
|---|---|
| `heading` | `plain`, `centered`, `rule`, `caps`, `italic`, `terminal` |
| `illustration` | `none`, `hills`, `blinds`, `orbs`, `rain`, `bolt`, `ridge`, `terminal` |

## `[effects]`

`grain`, `vignette`, `glow`: each 0–1.

## `[sound]`

| Field | Values |
|---|---|
| `kind` | `none`, `rain`, `storm`, `fire`, `wind`, `hum` |
| `volume` | 0–1, relative to the reader's volume |

Unknown kinds and volumes outside 0–1 fail validation. `resolve` returns it as
`Resolved.sound`; the window generates the sound (`sound.js`) and plays it only
while the reader's sound setting is on.

## Resolution

The window asks the core for the look at the reader's place
(`atmosphere::resolve`):

1. Start from `study`, then the reader's default preset (`[reader] preset`).
2. Apply stored layers in order: book, chapter, ranges that contain the place
   (older first).
3. A layer with `base` replaces everything so far with that preset; other fields
   deep-merge over the result.
4. Pick the mode: the layer's `mode`, else the reader's preference if the preset
   supports it, else the preset's first mode.
5. Check contrast: `ink` on `paper` at least 4.5:1, `accent` on `paper` at
   least 2.5:1. A failing stack is an error, and `atmosphere set` refuses to
   store a layer that would produce one.

Setting a book-wide profile also sets the book's spine color from `spine`.

## Presets and CSS

A preset file may have a stylesheet next to it (`name.css`). The window injects
it while the preset is active; scope rules with `.reader[data-preset="name"]`.
Profiles applied by agents cannot carry CSS; only installed presets can.
