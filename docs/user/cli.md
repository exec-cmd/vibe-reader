# Command-line reference

`vibe-reader` works with the same library as the reader window. Every command
has `--help` with all flags; this page gives the overview.

## Output

- In a terminal, commands print Markdown-flavored text. Elsewhere (pipes,
  scripts, agents) they print JSON. `--json` and `--md` force a format.
- Errors go to stderr in text mode and to stdout as `{"error": "..."}` in JSON
  mode; the exit code is 1.
- Text from books is marked as untrusted: `"untrusted": true` in JSON and
  `<book-content untrusted="true">` in text. See [agents](agents.md) for why.

## Choosing a book

Commands that take `<book>` accept an id from `vibe-reader list`, a path to the
file, or a unique part of the title: `vibe-reader show наказание`.

## Places in a book

Places are written as locators: `ch:3` is the start of chapter 3, `ch:3:120` is
character 120 of that chapter, and `ch:3:120..ch:3:480` is a span.
`vibe-reader toc <book>` lists chapter locators.

## Commands

### Library

| Command | What it does |
|---|---|
| `add <file\|url> [--copy] [--shelf NAME]` | Add a book. The library links to the file; `--copy` keeps a copy instead. URLs are downloaded into the library. |
| `remove <book>` | Remove a book with its notes and history. Asks for confirmation; runs only in a terminal. |
| `list [--shelf NAME] [--group shelf\|author]` | List books, most recently opened first. |
| `show <book>` | Details of one book. |
| `open [file\|book] [--lite]` | Open the reader window, a file or a library book; `--lite` is a quick view without library and atmosphere. A running window takes the file over. |
| `shelf create\|rename\|delete\|list\|add\|remove` | Virtual shelves. A book can be on several shelves. |
| `status set <book> reading\|finished\|dropped` | Book status. Opening a book marks it as reading. |
| `art add <book> <image> --locator L [--as page\|chapter\|margin\|cover]` | Attach an illustration (PNG, JPEG, WebP, GIF, SVG up to 10 MB). |
| `art list <book>`, `art remove <id>` | List or detach illustrations. |

### Reading

| Command | What it does |
|---|---|
| `toc <book>` | Table of contents with locators. |
| `read [book] [--chapter N \| --locator L \| --range A..B \| --continue] [--max-tokens N]` | Book text in chunks. The result names the `next` locator; `--continue` resumes from the last chunk you read. |
| `search <book> <query> [--regex]` | Search, with a locator and a snippet per hit. |
| `context [book]` | The current place: chapter, position, recent text, nearby notes. |
| `progress <book> [--set L]` | Position and progress; `--set` moves the position. |
| `stats [book]` | Chapters, words and reading time. |
| `recap <book>` | What was read in the last session, with your notes. |

`read`, `search`, `context` and `recap` stop at your position in the book, so
an agent cannot spoil what you have not read. `--allow-spoilers` lifts the
limit; finished books have none.

### Notes and memory

| Command | What it does |
|---|---|
| `note add <book> "text" --locator L` (or `--range A..B`) | Add a note. |
| `note list <book>`, `note edit <id> "text"`, `note delete <id>` | Manage notes. |
| `bookmark add <book> --locator L [label]`, `bookmark list <book>` | Bookmarks. |
| `highlight add <book> --range A..B [--note "text"]`, `highlight list <book>` | Highlights. |
| `export notes [book] [-o notes.md\|notes.json]` | Export notes, highlights and bookmarks. |
| `memory set\|get\|list --book <book>` | Facts an agent keeps about a book between sessions. |
| `undo` | Revert the newest note, memory, art or atmosphere change of the current author. |

### Atmosphere and the live window

| Command | What it does |
|---|---|
| `atmosphere set --book B [--chapter N \| --range A..B] (--preset NAME \| --file F \| --profile TEXT)` | Set the look of a book, chapter or scene. |
| `atmosphere get --book B [--locator L]` | Stored profiles and the look in effect. |
| `atmosphere clear --book B [--chapter N \| --range A..B]` | Remove a profile. |
| `preset list\|show NAME\|validate FILE\|install FILE [--css F]` | Presets. |
| `live position\|selection` | What the running window shows. |
| `live goto L`, `live highlight A..B` | Move the window; show a passage. |
| `gui status` | Whether the window runs. |

See [atmosphere](atmosphere.md).

### Reader statistics

| Command | What it does |
|---|---|
| `sessions [--period day\|week\|month\|year\|all] [--book B]` | Reading sessions. |
| `stats --reader [--period P]` | Speed, time of day, volume. |

Both share only what you allowed in `[agent.consent]`
([configuration](configuration.md)).

### Service

| Command | What it does |
|---|---|
| `skills install [--dir DIR] [--force]`, `skills list` | Install the Agent Skills (default `~/.claude/skills`). |
| `config`, `config path`, `config edit` | Show or edit settings. |
| `doctor` | Check the installation and the library. |

## Authors

Notes, highlights, bookmarks, memory, art and atmosphere record who wrote them.
In a terminal the author is `user`; otherwise it is `agent`. `--author NAME` or
`VIBE_READER_AUTHOR=NAME` set it explicitly. An agent can change and delete only
its own records.
