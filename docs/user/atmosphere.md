# Atmosphere

Each book can carry its own look: palette, a pair of fonts, a background, quiet
particles, a chapter heading style, a drawing at the start of each chapter, and
light effects. A chapter or a single scene can have its own look on top of the
book's.

## Presets

| Preset | Modes | Mood |
|---|---|---|
| `study` | light, dark | A warm desk lamp, bookshelves, slow dust. The default. |
| `terminal` | light, dark | Monospace, a faint grid. For code and technical books. |
| `noir` | light, dark | Light through blinds, grain, high contrast. |
| `soft` | light, dark | Pastel gradient and slow bokeh. |
| `rain` | dark | Fog and rain on the glass. |
| `storm` | dark | Heavy clouds, a downpour, rare faint lightning. |
| `mountain` | light, dark | Cold ridges and slow snow. |

Presets that exist in one mode only (rain, storm) stay dark even when the rest of
the app is light.

```bash
vibe-reader preset list
vibe-reader atmosphere set --book 3 --preset rain               # the whole book
vibe-reader atmosphere set --book 3 --chapter 7 --preset storm  # one chapter
vibe-reader atmosphere set --book 3 --range ch:9:1200..ch:9:5400 --profile '{"particles": {"kind": "snow"}}'
vibe-reader atmosphere get --book 3
vibe-reader atmosphere clear --book 3 --chapter 7
```

An open reader window changes at once. `vibe-reader undo` reverts the last
change. The default for books without their own look is `preset` in
`config.toml`.

## Writing a profile

A profile lists only what it changes. `base` starts from a preset:

```toml
base = "noir"

[particles]
kind = "rain"
density = 0.4

[palette.dark]
accent = "#d4a24c"
```

The full list of fields and their ranges is in
[atmosphere schema](../dev/atmosphere-schema.md); `vibe-reader preset show study`
prints a complete example. Profiles take only bundled fonts and cannot contain
CSS, and a profile whose text would be hard to read (contrast below 4.5:1) is
rejected with the reason.

## Your own presets

A preset is a profile with a `[preset]` section:

```toml
[preset]
name = "Autumn"
description = "Amber light and falling dust."
modes = ["light", "dark"]

[palette.light]
paper = "#f6efe2"
ink = "#2e261f"
# ...
```

Install it with `vibe-reader preset install autumn.toml`, optionally with
`--css autumn.css` for layout the schema cannot express. Files in
`~/.config/vibe-reader/presets/` are picked up directly; a preset with the name
of a built-in one replaces it.

## Illustrations

```bash
vibe-reader art add 3 ./chapter7.png --locator ch:7:0 --as chapter
vibe-reader art add 3 ./map.svg --locator ch:2:4800 --as page
vibe-reader art add 3 ./cover.jpg --as cover
```

| Placement | Where |
|---|---|
| `chapter` | At the start of the chapter, instead of the preset's drawing. |
| `margin` | Beside the paragraph at the locator. |
| `page` | A whole page inserted at the locator. |
| `cover` | The cover on the library card. |

PNG, JPEG, WebP, GIF and SVG up to 10 MB are accepted; SVG with scripts or
external links is refused. vibe-reader does not generate images; an agent can
hand in a file or a URL made elsewhere.

## Motion

Particles run at up to 30 frames per second on one canvas and stop when the
window is hidden. Lightning flashes at most once in 6 seconds. Particles and
transitions are off in lite mode, with **Reduce motion** in settings, and when
the system asks for reduced motion.

## Changing the whole design

Atmosphere covers the reader. To change anything else (the shelf, panels,
spacing), put CSS into `~/.config/vibe-reader/ui/user.css`; the window applies it
while running. See [UI](../dev/ui.md).
