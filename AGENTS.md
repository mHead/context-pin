# context-pin — Codex Plugin

Pin critical context so it survives compaction. Works with both Claude Code and Codex.

## What This Does

When your conversation gets compacted, decisions and constraints get lost. This plugin lets you pin them so they're re-injected after every compaction via the SessionStart hook.

## Pin Scopes

| Scope | Storage | Flag |
|---|---|---|
| **project** (default) | `.codex/context-pin/pins.json` | (none) |
| **global** | `~/.codex/context-pin/pins.json` | `--global` |
| **session** | project storage (session flag), cleared on new session | `--session` |

## Commands

```
/context-pin:add "text"                → pin permanently (default)
/context-pin:add "text" --global       → pin globally (all projects)
/context-pin:add "text" --session      → pin for this session only
/context-pin:add "text" --update ID    → update existing pin
/context-pin:list                      → list all pins
/context-pin:remove ID                 → remove a pin
/context-pin:clear-all                 → clear all project pins
/context-pin:move ID                   → move pin between project/global
```

## Proactive Pinning

When you detect a significant decision, constraint, or architectural choice during conversation, proactively offer to pin it. Ask briefly: "Want me to pin that?" If the user agrees, execute the pin command yourself.

## Note on Temporary Pins

The `--context` flag (temporary pins that expire after N compactions) is only supported on Claude Code, which has a PreCompact hook. On Codex, all pins are permanent — remove them manually with `/context-pin:remove`.

