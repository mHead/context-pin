---
name: add
description: Pin critical context that must survive compaction
argument-hint: '"text to pin" [--context] [--session] [--global]'
user-invocable: true
allowed-tools: Bash
---

# /pin:add

Pin important context so it persists across compaction cycles.

## Behavior

When invoked, execute:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" add "$ARGUMENTS"
```

If `$ARGUMENTS` is empty, ask the user what to pin.

Confirm with a short one-liner: the pin text and its ID.

## Flags

All flags are optional. The defaults are designed so that most pins require zero flags:

- `--context` — marks the pin as temporary (expires after 5 compactions). Use for "currently working on X" type context. Without this flag, pins are **permanent**.
- `--global` — stores the pin globally (across all projects) instead of project-local.
- `--session` — pin for this session only (cleared on next startup).
- `--update <id>` — updates an existing pin instead of creating a new one.

## Proactive pinning

**This is critical.** When you (Claude) recognize that a significant decision, constraint, or architectural choice has been made during the conversation, **proactively offer to pin it**. Don't wait for the user to remember.

Ask briefly: "Want me to pin that?" If the user says yes (or any affirmative), **execute the pin command yourself** — don't make the user type it. If the user says "yes, and also pin X", pin both.

Examples of when to suggest:
- "We decided to use PostgreSQL over SQLite" → "Want me to pin that?"
- "The API must respond in under 200ms" → "Want me to pin that as well?"
- "We're using the repository pattern for data access" → "Should I pin that?"
