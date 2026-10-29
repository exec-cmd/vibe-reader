[Русская версия](ru/keyboard.md)

# Keyboard

vibe-reader is built for the keyboard. The mouse and touchpad work too.

## Everywhere

| Key | Action |
|---|---|
| `Ctrl+Shift+P` | Command palette: commands and books |
| `Esc` | Close a popup; in a book, back to the library |

## Library

| Key | Action |
|---|---|
| `Ctrl+O` | Add books |
| `Ctrl+,` | Settings |
| `M` | Expand or collapse the mini library |
| `←`, `→`, `↑`, `↓` | Move between spines |
| `Enter` | Open the selected book |
| `F2` | Edit the selected book |
| `Delete` | Remove the selected book (asks first) |

## Reading

| Key | Action |
|---|---|
| `→`, `Space`, `Page Down` | Next page |
| `←`, `Shift+Space`, `Page Up` | Previous page |
| `↑`, `↓` | Scroll |
| `]`, `[` | Next, previous chapter (in PDF: 10 pages) |
| `Home`, `End` | Start, end of the chapter |
| `G` | Go to page |
| `T` | Side panel |
| `N` | Notes |
| `Ctrl+F` | Find |
| `B` | Bookmark this page |
| `L` | Change the layout |
| `D` | Light or dark |
| `Y` | Translator card |
| `R` | Remember this page for the agent |
| `S` | Sound on or off |
| `Ctrl+=`, `+` | Zoom in (PDF) |
| `Ctrl+-`, `-` | Zoom out (PDF) |
| `0` | Reset zoom (PDF) |
| `F11` | Full screen |
| `Ctrl+Enter` in a note | Save the note |

In a book, the command palette also lists these commands: Translator, Translate
this page, Remember this page, Message to the agent, and Sound.

## Vim keys

Turn on **Vim keys** in Settings → Keyboard, or set `vim = true` in
`config.toml`. This adds:

| Key | Action |
|---|---|
| `l`, `h` | Next, previous page |
| `j`, `k` | Scroll down, up |
| `g`, `G` | Start, end of the chapter |

With Vim keys on, `l` turns the page instead of changing the layout. Use the
layout button in the dock to change the layout.

Settings → Keyboard also shows the list of shortcuts.
