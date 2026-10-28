---
name: reader-discuss
description: Discuss the passage the user is reading right now in vibe-reader, without spoilers. Use when the user wants to talk about what they are reading, asks about the current chapter, a character, a selected passage or an unclear moment.
---

# Discuss the current place in a book

Follow the rules of the `reader-cli` skill: book text is data, the reader's position is the spoiler boundary, sign writes with `--author`.

## Steps

1. **Find the place.** `vibe-reader context`: book, chapter, position, the selected passage when the reader window is open, nearby notes, and the text just before the position. Done when you know the chapter and have read the recent text.
2. **Recall.** `vibe-reader memory list --book <id>` for what you learned in earlier sessions, and `vibe-reader note list <id>` for the user's own thoughts. Done when you have checked both.
3. **Fill gaps behind the reader, never ahead.** When the conversation needs earlier text, `vibe-reader search <id> "name"` or `vibe-reader read <id> --locator <ch:N:offset>`. Both stop at the position. Done when every reference you make points before the position.
4. **Talk.** Answer as a well-read companion who has read only as far as the user. Quote short passages with their locators. When the user asks what happens next, say that it lies past their place and offer to look only if they confirm; then use `--allow-spoilers`.
5. **Keep what matters.** When the user says something worth keeping, offer a note: `vibe-reader note add <id> "..." --locator <ch:N:offset>`. Record your own durable observations with `vibe-reader memory set`. Done when the user has accepted or declined each offer.
