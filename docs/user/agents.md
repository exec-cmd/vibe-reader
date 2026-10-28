# Using vibe-reader with AI agents

vibe-reader has no AI inside. Any agent that can run shell commands — Claude
Code, Codex, opencode and others — works with your library through the
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

| Skill | For |
|---|---|
| `reader-cli` | General rules: commands, locators, output, safety. |
| `reader-analyze` | Analysis of a book or of your reading: characters, themes, glossary, pace. |
| `reader-discuss` | Talking about the place you are reading right now. |
| `reader-atmosphere` | Presets, atmosphere per chapter or scene, illustrations. |

## What agents can and cannot do

- **Read** everything in the library: book text, your position, notes, shelves.
- **Write** notes, highlights, bookmarks, memory, illustrations and atmosphere.
  Each write records the agent's name, shows up marked in the reader window,
  and `vibe-reader undo --author NAME` reverts it step by step.
- **Not remove** books or shelves: those commands run only at an interactive
  terminal, where you confirm them.
- **Not change your records**: an agent edits and deletes only what it wrote.

## Spoilers

Agents read only up to your current position in a book. They see text beyond it
only with `--allow-spoilers`, which the Skills use only when you ask for it.
Finished books have no limit.

## Your reading profile

Reading sessions, speed and habits are private until you share them under
`[agent.consent]` in `config.toml` ([configuration](configuration.md)). The app
gives agents numbers; conclusions such as "you read faster in the evening" are
the agent's.

## Prompt injection

A book can contain text written to manipulate an AI ("ignore your
instructions..."). The CLI marks all book text as untrusted data, and the Skills
tell agents to treat it as content, not as instructions. This lowers the risk;
it does not remove it. Review what an agent proposes to run.
