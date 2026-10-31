[Русская версия](ru/agents.md)

# Using vibe-reader with AI agents

vibe-reader has no AI inside. Any agent that can run shell commands (Claude
Code, Codex, opencode and others) works with your library through the
`vibe-reader` command and the bundled Skills.

## Set up

1. Install the CLI and check it: `vibe-reader doctor`.
2. Install the Skills for your agent:

   ```bash
   vibe-reader skills install                          # Claude Code: ~/.claude/skills
   vibe-reader skills install --dir ~/.codex/skills    # another agent's skills folder
   ```

3. Start the agent in a terminal next to the reader window and ask it about
   your book: "what is going on in this chapter?", "make a list of characters
   so far", "set a rainy atmosphere for chapter 5".

## Skills

There are five Skills:

| Skill | For |
|---|---|
| `reader-cli` | General rules: commands, locators, output, safety. |
| `reader-analyze` | Analysis of a book or of your reading: characters, themes, glossary, pace. |
| `reader-discuss` | Talking about the place you are reading right now. |
| `reader-atmosphere` | Presets, atmosphere per chapter or scene, illustrations. |
| `books-helper` | Fiction: retelling the story so far, critics' views, questions to check your understanding, and the meaning of a finished book. |

`books-helper` finds your page, retells the story up to it, and caches chapter
summaries in memory as `plot:ch<N>`. It gathers critics' views with web search
and names the sources. Without web access it says so. While the book is not
finished, it removes spoilers from the critics' views and checks your
understanding with 3 to 5 questions. A book counts as finished when its status is
finished, when it is 99 % read, or when you say so. Then the agent gives the
whole plot, the critics' views including the ending, the ideas critics found, and
what the work wants to say. It offers to save the result as memory `helper:summary`
or as a note.

Example requests:

- "What do critics say about the book I'm reading?"
- "Retell what happened so far and check if I understood it."
- "I finished the book, what did it want to say?"

## What agents can and cannot do

Agents read everything in the library: book text, your position, notes,
shelves. For PDF books they get the text that the core extracts.

They write notes, highlights, bookmarks, memory, illustrations and atmosphere.
Each write records the agent's name and shows up marked in the reader window,
and `vibe-reader undo --author NAME` reverts it step by step.

They cannot remove books or shelves, because those commands run only at an
interactive terminal where you confirm them. An agent edits and deletes only
what it wrote, never your records.

## The live window

When the reader window is open, agents see what you see: `vibe-reader context`
includes your current selection, `vibe-reader live goto ch:5:0` turns the window
to a place, and `vibe-reader live highlight` points at a passage. Notes and
atmosphere an agent writes appear in the window at once.

## Sending from the window

The ✦ button in the dock (For the agent) and the **Send the selection** button in
the selection bar leave things for your agent to read:

- **Remember this page** stores where you are: the chapter, the page and the
  percent. It is kept as memory `reader.place` and replaces the previous place.
- **Send the selection** and **Send this page** store the text with its place, as
  `reader.saved.<unix ms>`.
- **Message to the agent** opens a dialog. Your message is stored as
  `reader.message.<unix ms>` with the current place.

These are memory entries for the open book, written by you (author `user`). They
work for library books only. The Agent tab in the side panel lists them, newest
first, with delete buttons. Click one to go to its place.

`vibe-reader context` shows them under "Sent by the reader from the window". In
its JSON output they are under `from_reader`. Saved passages are marked as
untrusted book content, like the rest of the book text. `vibe-reader memory list`
shows them too.

## Spoilers

Agents read only up to your current position in a book. They see text beyond it
only with `--allow-spoilers`, which the Skills use only when you ask for it.
Finished books have no limit.

## Your reading profile

Reading sessions, speed and habits are private until you share them under
`[agent.consent]` in `config.toml` or in Settings → AI agents
([configuration](configuration.md)). The app gives agents numbers; conclusions
such as "you read faster in the evening" are the agent's.

## Prompt injection

A book can contain text written to manipulate an AI ("ignore your
instructions..."). The CLI marks all book text as untrusted data, and the Skills
tell agents to treat it as content, not as instructions. This lowers the risk;
it does not remove it. Review what an agent proposes to run.
