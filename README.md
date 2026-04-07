<h2 align="center">📌 claude-pin</h2>
<p align="center">Compaction survival weapon built for <a href="https://claude.ai/code">Claude Code</a></p>

<p align="center">
  <a href="https://github.com/mHead/claude-pin/releases"><img src="https://img.shields.io/badge/version-0.1.0-blue" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License: MIT"></a>
  <a href="https://github.com/mHead/claude-pin/actions"><img src="https://img.shields.io/badge/tests-passing-brightgreen" alt="Tests"></a>
  <a href="https://github.com/mHead/claude-pin/blob/main/package.json"><img src="https://img.shields.io/badge/dependencies-0-brightgreen" alt="Dependencies"></a>
  <a href="https://github.com/mHead/claude-pin/blob/main/package.json"><img src="https://img.shields.io/badge/node-%3E%3D18-blue" alt="Node"></a>
</p>

---

**Pin critical context so it survives compaction in [Claude Code](https://claude.ai/code).**

When Claude Code compresses your conversation history, important decisions, constraints, and architectural choices get lost in the summary. This plugin lets you pin what matters — and Claude will even suggest what to pin.

## Why

You're deep in a session. You've decided on PostgreSQL, set a 200ms latency budget, agreed not to touch the auth middleware. Then compaction hits and Claude forgets all of it.

`CLAUDE.md` can't help — it's static, you'd have to stop and edit a file. Memory is for preferences across sessions, not for decisions you made 20 minutes ago. And the compaction summary? Claude picks what to keep. You can't control it.

**claude-pin is a dynamic `CLAUDE.md` that updates during the conversation.** You pin what matters, it survives automatically.

This is the [#1 requested feature](https://github.com/anthropics/claude-code/issues/14258) in the Claude Code ecosystem.

## How it works

```
You: "Let's go with PostgreSQL, SQLite can't handle concurrent writes"

Claude: Want me to pin that?

You: "yes"

Claude: → Pinned (a1b2c3d4): Chose PostgreSQL over SQLite for concurrent write support  [permanent]
```

That's it. You just say "yes" — Claude pins it for you. You can also say "yes, and also pin that the API must be under 200ms" and Claude creates both.

After compaction, your pins are automatically re-injected into context. Claude sees them as active constraints and respects them.

## Install

> **⚠️ Before installing:** Claude Code has a [known bug](https://github.com/anthropics/claude-code/issues/31930) where plugin cloning uses SSH instead of HTTPS. If you don't have SSH keys set up for GitHub, the install will fail with `Permission denied (publickey)`. Run this once to fix it:
> ```bash
> git config --global url."https://github.com/".insteadOf "git@github.com:"
> ```

```
/plugin marketplace add mHead/claude-pin
```
```
/plugin install pin@mHead-claude-pin
```

Or for local development:

```bash
claude --plugin-dir /path/to/claude-pin
```

That's it. No configuration, no API keys, no background services, no data leaves your machine.

## Commands

| Command | What it does |
|---|---|
| `/pin:add "text"` | Pin a decision (permanent by default) |
| `/pin:add "text" --context` | Pin temporary context (expires after 5 compactions) |
| `/pin:add "text" --session` | Pin for this session only (cleared on next startup) |
| `/pin:add "text" --global` | Pin across all projects |
| `/pin:add "text" --update <id>` | Update an existing pin |
| `/pin:list` | List all active pins |
| `/pin:remove <id>` | Remove a pin (supports ID prefix, e.g. `a1b`) |
| `/pin:clear` | Clear all project pins |

## Proactive pinning

You don't need to remember to pin things. After installation, Claude automatically detects when significant decisions are made and offers to pin them. You just say "yes".

This works because the plugin injects a lightweight instruction into every session via the [`SessionStart`](https://code.claude.com/docs/en/hooks) hook — no manual setup required.

## Pin lifetime

| Type | Flag | Behavior |
|---|---|---|
| **Permanent** | _(default)_ | Never expires. For decisions, constraints, architecture. |
| **Temporary** | `--context` | Expires after 5 compactions. For "currently working on X". |
| **Session** | `--session` | Lives until you start a new session. |

## How it survives compaction

```
  /pin:add "text" → stored in .claude/claude-pin/pins.json
                              │
  [PreCompact hook]           │
    expire TTL pins ──────────┤
    regenerate .md            │
                              │
  [compaction happens]        │
                              │
  [SessionStart hook]         │
    read pins ────────────────┘
    output to stdout → re-injected into Claude's context
```

Two [hooks](https://code.claude.com/docs/en/hooks) do the work:

1. **`PreCompact`** — runs before compaction. Increments TTL counters, expires old pins, regenerates the reference `.claude/claude-pin.md` file.
2. **`SessionStart`** — runs after compaction (and at session start). Outputs all active pins to stdout, which Claude Code injects into the conversation context.

## Power user: `CLAUDE.md` include

For an extra layer of persistence, add this to your project's `CLAUDE.md`:

```
@.claude/claude-pin.md
```

This makes your pins part of the system prompt, which is the strongest level of context in Claude Code. The file is auto-generated and kept in sync by the `PreCompact` hook.

## Comparison with alternatives

| | **claude-pin** | **[claude-mem](https://github.com/thedotmack/claude-mem)** | **Manual `CLAUDE.md`** |
|---|---|---|---|
| Purpose | Pin decisions that survive compaction | Cross-session memory with AI search | Static project instructions |
| Automation | Claude suggests pins proactively | Auto-captures everything from tool use | Fully manual |
| Dependencies | Zero | Bun, SQLite, Chroma, HTTP service | None |
| Storage | JSON files | SQLite + vector DB | Markdown file |
| Compaction-aware | Yes (`PreCompact` + `SessionStart` hooks) | Indirectly (cross-session) | Yes (always re-read) |
| Signal vs noise | High signal (user-curated) | Everything captured (noisy) | High signal (manual) |
| Privacy | 100% local, plain JSON files | Local DB + background HTTP service | Local file |
| Setup | `claude plugin add` | `npx claude-mem install` + background service | Edit a file |

claude-pin sits between fully manual (editing `CLAUDE.md`) and fully automatic (claude-mem). It's opinionated: you decide what's important, but Claude helps you remember to do it.

## Privacy & Security

Everything stays on your machine. Pins are stored as plain JSON files inside your project (`.claude/claude-pin/pins.json`) or home directory for global pins. No network calls, no telemetry, no external services. You can inspect, edit, or delete your pins at any time — they're just files.

Security measures:
- **Pin data excluded from git** — `.gitignore` prevents pins from being committed to repos, blocking prompt injection via shared repositories
- **Input sanitization** — newlines are collapsed to prevent format injection in Claude's context
- **Length limit** — pins are capped at 2000 characters to prevent context flooding
- **Schema validation** — malformed entries in `pins.json` are filtered out on read
- **File permissions** — `pins.json` is written with `0600` (owner-only) on Unix; on Windows, inherits ACLs from the user profile directory
- **File locking** — concurrent sessions won't corrupt `pins.json`

## Tech stack

- Pure Node.js, zero external dependencies
- Local-only JSON file storage — nothing leaves your machine
- Comprehensive test suite (unit, integration, schema validation)
- [MIT license](LICENSE)

## Development

```bash
# Run tests
npm test

# Test the plugin locally
claude --plugin-dir /path/to/claude-pin

# Verify plugin structure matches Claude Code spec
node --test tests/plugin-structure.test.js
```

## Author

**Marco Testa** — [@mHead](https://github.com/mHead)

## License

[MIT](LICENSE)
