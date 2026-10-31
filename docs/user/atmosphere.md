[Русская версия](ru/atmosphere.md)

# Atmosphere

Each book can carry its own look: palette, a pair of fonts, a background, quiet
particles, a chapter heading style, a drawing at the start of each chapter, and
light effects. A chapter or a single scene can have its own look on top of the
book's.

The atmosphere is drawn on the desk around the page, never over the text.
In the reader, the atmosphere menu (the sparkle icon in the dock) picks a
preset for the open book, or Default, and turns particles on or off. In the
library, the catalog card and the book menu have an Atmosphere setting too.

## Presets

| Preset | Modes | Mood |
|---|---|---|
| `study` | light, dark | A warm desk lamp, bookshelves, slow dust. The lamplight is a halftone pool of dots; the cursor is a second lamp. The default. |
| `terminal` | light, dark | Monospace, and the whole desk becomes a field of ASCII ripples that part under the cursor. For code and technical books. |
| `noir` | light, dark | Light through blinds drawn as hatching, grain, high contrast; the cursor casts a shadow. |
| `soft` | light, dark | Pastel gradient, slow bokeh and rings of pearls. |
| `rain` | dark | Fog and rain on the glass; the cursor wipes the fogged glass, which fogs back. |
| `storm` | dark | Heavy clouds, a downpour with sheets of rain blown across, rare faint lightning. |
| `mountain` | light, dark | A drawn mountain scene: snowy peaks under a moon, twinkling stars, a pine ridge, mist and falling snow; the cursor brings out faint stars. |

Each preset's desk field moves for a few seconds after you move the pointer and
then stands still, so a resting reader costs no CPU. A click beside the page
sends a ring through it. The Effects strength in Settings scales it. Lite mode
has no field, and with reduced motion it does not move.

Presets that exist in one mode only (rain, storm) stay dark even when the rest of
the app is light.

Each preset also has its own sound. See [Sound](#sound).

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
`config.toml`. You can also pick it in Settings → Atmosphere.

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
| `cover` | The book's cover, shown in the library. |

PNG, JPEG, WebP, GIF and SVG up to 10 MB are accepted; SVG with scripts or
external links is refused. vibe-reader does not generate images; an agent can
hand in a file or a URL made elsewhere.

## Effects

Settings → Atmosphere → **Effects** sets the strength of the light effects, from
0 to 200 %. At Off, only the colors remain. The strength scales the background,
the glow, the vignette, the grain, the number of particles and the lightning
flash. In `config.toml` the same setting is `effects` under `[reader]`, from 0 to
2, where 1 is as designed.

Particles meet the book:

- Snow settles on the top edge of the page and melts in about ten seconds.
- Rain splashes on the top edge.
- Turning a page sends a gust that blows dust, snow and bokeh across the page.
  Rain bends a little.

The Storm preset flashes lightning over the whole room, the page included. With
sound on, the thunder follows after a short delay.

## Sound

A profile can give its atmosphere an ambient sound in a `[sound]` section:

```toml
[sound]
kind = "rain"
volume = 0.4
```

`kind` is `none`, `rain`, `storm`, `fire`, `wind` or `hum`. `volume` runs from 0
to 1 and is relative to the volume set in Settings → Sound. An unknown kind, or a
volume outside 0 to 1, fails validation.

The bundled presets have sounds: study has fire, terminal has hum, noir and rain
have rain, soft and mountain have wind, and storm has a storm. Turning the sound
on is described in [sound](sound.md).

## Motion

Particles run at 12 to 24 frames per second on one canvas, depending on the
kind, and stop when the window is hidden. Lightning flashes at most once in 6 seconds.

Lite mode has no atmosphere and no animations. Turn on **Reduce motion** in
Settings → Appearance to stop particles and page-turn animations. Motion also
stops when the system asks for reduced motion.

## Changing the whole design

Atmosphere covers the reader. To change anything else (the library, panels,
spacing), put CSS into `~/.config/vibe-reader/ui/user.css`; the window applies it
while running. See [UI](../dev/ui.md).
