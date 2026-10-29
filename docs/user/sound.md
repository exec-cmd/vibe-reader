[Русская версия](ru/sound.md)

# Sound

vibe-reader can play ambient sound while you read: rain, a storm, a fire, wind or
a mains hum. Sound is off by default. The sounds are generated in the window, so
no sound files are needed.

## Turn it on

- Press `S` in the reader, or click the sound button in the dock.
- Open the command palette (`Ctrl+Shift+P`) and choose **Sound**.
- Open Settings → Sound and turn on **Ambient sound**.

## Sounds

| Kind | What you hear |
|---|---|
| Rain | Steady rain. |
| Storm | Rain, a low rumble, and thunder after lightning. |
| Fire | Crackling. |
| Wind | Gusts. |
| Hum | A mains hum and a fan. |

Each atmosphere picks its own sound:

| Preset | Sound |
|---|---|
| Study | Fire |
| Terminal | Hum |
| Noir | Rain |
| Soft | Wind |
| Rain | Rain |
| Storm | Storm |
| Mountain | Wind |

## Volume

Settings → Sound has a volume slider from 0 to 100 %. Each atmosphere sets its
own level, and that level is relative to the slider. A book with a quieter
atmosphere stays quieter when you raise the slider.

## How it behaves

The sound fades in and out. It goes quiet while the window is hidden, and it
stops when you leave the reader.

To hear a kind before you turn the sound on, open Settings → Sound and press
**Listen** next to it. The sample plays for 6 seconds.

## Your own atmospheres

A profile can set its own sound in a `[sound]` section. See
[atmosphere](atmosphere.md#sound).
