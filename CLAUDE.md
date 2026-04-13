# context-pin — Claude Code & Codex Plugin

## What This Is

A plugin that pins critical context so it survives compaction. When Claude Code or Codex compresses conversation history, decisions, constraints, and architectural context get lost. This plugin solves that. Compatible with both Claude Code and OpenAI Codex.

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
2. **On-demand skill** — `/context-pin:list` loads all pins into context manually

The `.claude/claude-pin.md` file is generated for reference but not auto-included via plugin.json (no `claudeMd` field in the plugin schema). Users who want a third layer can manually add `@.claude/claude-pin.md` to their project CLAUDE.md.

## Architecture

```
/context-pin:add "text" → cli.js add → pin-store.js → pins.json
                                                    │
PreCompact hook → pre-compact.js (Claude Code only) │
  ├── incrementCompactions (expire TTL pins)        │
  └── generateClaudeMd → .claude/claude-pin.md     │
                                                    │
[compaction happens]                                │
                                                    │
SessionStart hook → session-start.js (both agents)  │
  └── reads pins.json → outputs to stdout ──────────┘
```

## Pin Scope

Storage paths are agent-aware (auto-detected via env vars):

| Scope | Claude Code | Codex |
|---|---|---|
| **project** (default) | `.claude/claude-pin/pins.json` | `.codex/context-pin/pins.json` |
| **global** | `~/.claude/claude-pin/pins.json` | `~/.codex/context-pin/pins.json` |
| **session** | project storage (session flag), cleared on new session | same |

## Pin Lifetime

- **Permanent** (default): pins never expire — for decisions, constraints, architecture
- **Temporary** (`--context`): expires after 5 compactions — **Claude Code only** (requires PreCompact hook)
- **Snapshot** (internal, Phase 2): expires after 1 compaction — Claude Code only

On Codex, all pins are permanent. Users remove them manually with `/context-pin:remove`.

## User-Facing Commands

```
/context-pin:add "text"                → pin (permanent by default)
/context-pin:add "text" --context      → pin temporary context (5 compactions)
/context-pin:add "text" --global       → pin globally (all projects)
/context-pin:add "text" --update ID    → update existing pin
/context-pin:list                      → list all pins
/context-pin:remove ID                 → remove a pin
/context-pin:clear-all                 → clear all project pins
```

## Proactive Pinning (Key UX Feature)

Claude should **proactively suggest pinning** when it detects a significant decision or constraint during conversation. The user should never have to remember to pin — Claude suggests, user confirms.

## Tech Stack

- Pure Node.js, zero external dependencies
- JSON file storage (no SQLite, no Docker, no cloud)
- Dual plugin format: `.claude-plugin/` + `.codex-plugin/` with shared scripts and skills
- Plugin name: `context-pin` (skills namespaced as `/context-pin:add`, `/context-pin:list`, etc.)
- Hook variables: `${CLAUDE_PLUGIN_ROOT}` (Claude Code), `${CODEX_PLUGIN_ROOT}` (Codex)
- Agent auto-detection via `CODEX_PLUGIN_ROOT` env var
- MIT license

## File Structure

```
context-pin/
├── .claude-plugin/
│   ├── plugin.json             # Claude Code manifest
│   └── marketplace.json        # Claude Code marketplace entry
├── .codex-plugin/
│   └── plugin.json             # Codex manifest
├── hooks/
│   ├── hooks.json              # Claude Code: PreCompact + SessionStart
│   └── hooks-codex.json        # Codex: SessionStart only (no PreCompact)
├── scripts/
│   ├── lib/
│   │   └── pin-store.js        # Core: read/write/expire pins (agent-aware paths)
│   ├── cli.js                  # CLI: add/update/remove/list/clear/generate
│   ├── pre-compact.js          # PreCompact hook script (Claude Code only)
│   └── session-start.js        # SessionStart hook script (both agents)
├── skills/                     # Shared skills (SKILL.md format works on both)
│   ├── add/SKILL.md
│   ├── list/SKILL.md
│   ├── remove/SKILL.md
│   ├── move/SKILL.md
│   └── clear-all/SKILL.md
├── tests/
│   ├── pin-store.test.js       # Unit tests for store
│   ├── cli.test.js             # Integration tests for CLI
│   ├── hooks.test.js           # Integration tests for hooks
│   └── plugin-structure.test.js # Schema validation tests
├── CLAUDE.md                   # Claude Code project instructions
├── AGENTS.md                   # Codex project instructions
└── package.json                # metadata only, no deps
```

## Build & Test

```bash
# Run tests
npm test

# Local development — Claude Code
claude --plugin-dir C:\Code\context-pin

# Local development — Codex
codex --plugin-dir C:\Code\context-pin

# Manual test flow
/context-pin:add "test decision"
/context-pin:list
/compact
# verify pins re-appear after compaction
```

## Author

GitHub: mHead — repo: github.com/mHead/context-pin

