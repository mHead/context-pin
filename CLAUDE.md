# claude-pin — Claude Code Plugin

## What This Is

A Claude Code plugin that pins critical context so it survives compaction. When Claude Code compresses conversation history, decisions, constraints, and architectural context get lost. This plugin solves that.

## Why It Exists

This is the #1 pain point in the Claude Code ecosystem:
- **anthropics/claude-code#14258** (41 reactions) — requests PostCompact hook, "do not summarize" markers, context pinning
- **anthropics/claude-code#34556** — power user built 3-tier memory system over 59 compactions
- **anthropics/claude-code#42590** — compaction too aggressive on Opus 1M (fires at ~76K tokens, wastes 93% of context)
- **anthropics/claude-code#42375** — auto-compaction at ~6% context usage, override env var ignored
- **~10 more duplicate issues** all asking for the same thing

No existing plugin solves this. Closest are `claude-mem` (auto-capture everything, noisy) and `mcp-memory-service` (general memory, not compaction-specific).

## How It Works — Two Layers

1. **SessionStart hook stdout** — pins formatted with directive language, injected into context at session start and after compaction
2. **On-demand skill** — `/pin:list` loads all pins into context manually

The `.claude/claude-pin.md` file is generated for reference but not auto-included via plugin.json (no `claudeMd` field in the plugin schema). Users who want a third layer can manually add `@.claude/claude-pin.md` to their project CLAUDE.md.

## Architecture

```
/pin:add "text" → cli.js add → pin-store.js → pins.json
                                                    │
PreCompact hook → pre-compact.js                    │
  ├── incrementCompactions (expire TTL pins)        │
  ├── auto-extract decisions from transcript (P2)   │
  └── generateClaudeMd → .claude/claude-pin.md     │
                                                    │
[compaction happens]                                │
                                                    │
SessionStart hook → session-start.js                │
  └── reads pins.json → outputs to stdout ──────────┘
```

## Pin Scope

| Scope | Storage | Flag |
|---|---|---|
| **project** (default) | `.claude/claude-pin/pins.json` | (none) |
| **global** | `~/.claude/claude-pin/pins.json` | `--global` |
| **session** | project pins.json (session flag), cleared on new session | `--session` |

## Pin Lifetime

- **Permanent** (default): pins never expire — for decisions, constraints, architecture
- **Temporary** (`--context`): expires after 5 compactions — for "currently working on X"
- **Snapshot** (internal, Phase 2): expires after 1 compaction — auto-extracted context

## User-Facing Commands

```
/pin:add "text"                → pin (permanent by default)
/pin:add "text" --context      → pin temporary context (5 compactions)
/pin:add "text" --global       → pin globally (all projects)
/pin:add "text" --update ID    → update existing pin
/pin:list                      → list all pins
/pin:remove ID                 → remove a pin
/pin:clear                     → clear all project pins
```

## Proactive Pinning (Key UX Feature)

Claude should **proactively suggest pinning** when it detects a significant decision or constraint during conversation. The user should never have to remember to pin — Claude suggests, user confirms.

## Tech Stack

- Pure Node.js, zero external dependencies
- JSON file storage (no SQLite, no Docker, no cloud)
- Plugin format: `.claude-plugin/plugin.json` + hooks + skills
- Plugin name: `pin` (skills namespaced as `/pin:add`, `/pin:list`, etc.)
- Hook variable: `${CLAUDE_PLUGIN_ROOT}` for script paths
- MIT license

## File Structure

```
claude-pin/
├── .claude-plugin/
│   └── plugin.json
├── hooks/
│   └── hooks.json              # PreCompact + SessionStart (3-level format)
├── scripts/
│   ├── lib/
│   │   └── pin-store.js        # Core: read/write/expire pins
│   ├── cli.js                  # CLI: add/update/remove/list/clear/generate
│   ├── pre-compact.js          # PreCompact hook script
│   └── session-start.js        # SessionStart hook script
├── skills/
│   ├── add/SKILL.md            # /pin:add — create or update a pin
│   ├── list/SKILL.md           # /pin:list — show all pins
│   ├── remove/SKILL.md         # /pin:remove — delete a pin
│   └── clear/SKILL.md          # /pin:clear — delete all pins
├── tests/
│   ├── pin-store.test.js       # Unit tests for store
│   ├── cli.test.js             # Integration tests for CLI
│   ├── hooks.test.js           # Integration tests for hooks
│   └── plugin-structure.test.js # Schema validation tests
├── CLAUDE.md
└── package.json                # metadata only, no deps
```

## Build & Test

```bash
# Run tests
npm test

# Local development — test without installing
claude --plugin-dir C:\Code\claude-pin

# Manual test flow
/pin:add "test decision"
/pin:list
/compact
# verify pins re-appear after compaction
```

## Author

GitHub: mHead — repo: github.com/mHead/claude-pin
