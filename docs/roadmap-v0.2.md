# claude-pin v0.2 Roadmap

> Source: real-world usage feedback from a multi-repo project (playroll-cpp, playroll-ui, playroll-installer, playroll-analytics) where multiple Claude Code agents work concurrently on related repos.

---

## Feature 1: Cross-Repo Pin Sharing

### Problem

Pins are scoped per-repo (`{repo}/.claude/claude-pin/pins.json`). But related repos often share critical constraints — e.g., "playroll-core and playroll-ui are a single entity, auth gates everything" applies to both repos equally. Today you must duplicate the pin manually in each repo.

### Proposal

Add a `--workspace` scope that stores pins in a shared location:

```
/context-pin:add "Auth gates everything" --workspace
```

Storage: `~/.claude/claude-pin/workspaces/{workspace-name}/pins.json`

Workspace membership defined in each repo's `.claude/claude-pin/config.json`:

```json
{
  "workspace": "playroll"
}
```

When a session starts, `session-start.js` loads:
1. Global pins (`~/.claude/claude-pin/pins.json`)
2. Workspace pins (if configured)
3. Project pins (`.claude/claude-pin/pins.json`)

De-duplicate by pin ID to avoid repetition.

### Commands

```
/context-pin:add "text" --workspace        # pin to workspace
/context-pin:list --workspace              # list workspace pins only
/context-pin:move <id> --workspace         # move existing pin to workspace scope
```

### Migration

No breaking changes. Repos without `config.json` ignore workspace pins entirely.

---

## Feature 2: Pin Tags & Filtering

### Problem

With 6+ permanent pins, `/context-pin:list` is a flat wall of text. No way to filter by topic or see only auth-related pins.

### Proposal

Add optional `--tag` flag (multiple allowed):

```
/context-pin:add "Auth gates everything" --tag auth --tag architecture
/context-pin:list --tag auth              # show only auth-tagged pins
```

Tags stored in pin object:

```json
{
  "id": "d4beb525",
  "text": "Auth gates everything",
  "tags": ["auth", "architecture"],
  "scope": "project",
  "category": "constraint",
  "ttl": -1
}
```

`/context-pin:list` output adds tags inline:

```
d4beb525  Auth gates everything  [auth, architecture]  (permanent)
```

`claude-pin.md` groups pins by tag when tags are present. Untagged pins go under "General".

### Implementation

- Add `--tag <name>` flag to `parseFlags()` in `cli.js` (repeatable)
- Add `tags: string[]` to pin schema in `pin-store.js`
- Add `--tag <name>` filter to `list` command
- Update `formatClaudeMd()` to group by tag when pins have tags

---

## Feature 3: Date-Based Expiry

### Problem

TTL by compaction count is good for context that decays with conversation length. But some pins are time-bound — "merge freeze until April 5th", "penno78 needs fresh signup test by Friday". These should expire by calendar date, not compaction count.

### Proposal

Add `--expires <date>` flag:

```
/context-pin:add "Merge freeze for mobile release" --expires 2026-04-15
/context-pin:add "Review report pending" --expires 2026-04-20 --context
```

Pin object gets optional `expiresAt` field (ISO date string). Both `session-start.js` and `pre-compact.js` check date expiry in addition to TTL expiry. A pin expires when EITHER condition is met (TTL exhausted OR date passed).

`/context-pin:list` shows date when present:

```
a1b2c3d4  Merge freeze  (expires 2026-04-15)
```

### Implementation

- Add `--expires <date>` to `parseFlags()`, validate ISO format
- Add `expiresAt: string | null` to pin schema
- Add date check in `readPins()` or a new `expireByDate()` called from both hooks
- Update `formatExpiry()` to show date

---

## Feature 4: Pin Validation Hooks

### Problem

Pins can go stale silently. A pin says "Frontend = playroll.exe" but someone renames the binary. A pin says "9 detector files in src/" but 3 more were added. The pin stays forever, becoming misleading.

### Proposal

Optional `--validate` flag attaches a shell command to a pin. The `session-start.js` hook runs validation at session start. Failed pins get a warning marker.

```
/context-pin:add "Frontend exe = playroll.exe" --validate "grep -r playroll.exe package.json"
```

Pin object:

```json
{
  "id": "87a55e61",
  "text": "Frontend exe = playroll.exe",
  "validate": "grep -r playroll.exe package.json",
  "lastValidated": "2026-04-12T10:00:00Z",
  "validationStatus": "pass"
}
```

On session start:
1. Run each pin's validate command (timeout 5s, parallel)
2. If fail: pin still shown but with warning: `⚠ STALE — validation failed`
3. Update `lastValidated` and `validationStatus`

Keep it optional and lightweight — most pins won't have validation.

### Security

- Commands run in the repo's working directory
- Timeout enforced (5s max)
- No network commands allowed (blocklist: curl, wget, fetch)
- Validation runs only at session start, not on every compaction

---

## Feature 5: Bulk Import from Markdown

### Problem

When a review agent produces findings for another agent's repo, the natural flow is to write them as pins so they survive compaction in the target repo. But adding 5-10 pins one by one is tedious.

### Proposal

```
/context-pin:import docs/review-findings.md
```

Markdown format:

```markdown
# Pin Import

- Auth gates everything --tag auth
- Fix app-state-routing.test.ts --context --tag testing
- 3 detectors have no tests --context --tag testing
```

Each `- ` line becomes a pin. Inline flags parsed. Lines without flags get defaults (permanent, project scope).

### Implementation

- New `import` command in `cli.js`
- Parse markdown list items
- Extract inline flags (`--tag`, `--context`, `--global`, `--expires`)
- Call `addPin()` for each
- Report: "Imported 5 pins (3 permanent, 2 context)"

---

## Feature 6: Priority Levels

### Problem

In `claude-pin.md` and the SessionStart stdout, all pins look the same. But "NEVER skip code signing for production" is more critical than "Frontend exe name is playroll.exe". The agent should weight them differently.

### Proposal

Add `--priority` flag with three levels:

```
/context-pin:add "Never skip signing" --priority critical
/context-pin:add "Auth gates everything" --priority high
/context-pin:add "Frontend = playroll.exe"                    # default: normal
```

In `claude-pin.md` output, critical pins get a prefix:

```
📌 PINNED CONTEXT:

[CRITICAL]
  • (1160b70c) NEVER skip code signing for production releases.

[HIGH]
  • (d4beb525) Auth gates everything. No standalone backend operation.

[NORMAL]
  • (87a55e61) Frontend exe = playroll.exe
```

SessionStart hook outputs critical pins first, ensuring they're at the top of the injected context.

### Implementation

- Add `priority: 'critical' | 'high' | 'normal'` to pin schema (default: normal)
- Add `--priority <level>` to `parseFlags()`
- Update `formatClaudeMd()` to group by priority
- Update `session-start.js` to sort by priority

---

## Implementation Priority

| # | Feature | Effort | Impact | Priority |
|---|---------|--------|--------|----------|
| 1 | Tags & Filtering | Small | Medium | **Do first** — low effort, immediate UX win |
| 2 | Priority Levels | Small | Medium | **Do second** — pairs with tags |
| 3 | Date-Based Expiry | Small | Medium | **Do third** — simple addition to existing TTL |
| 4 | Cross-Repo Sharing | Medium | High | **Do fourth** — highest impact but needs config design |
| 5 | Bulk Import | Small | Low | **Do fifth** — convenience feature |
| 6 | Validation Hooks | Medium | Low | **Do last** — nice-to-have, complex edge cases |

---

## Non-Goals

- **No cloud sync** — pins stay local, this is a dev tool not a service
- **No pin inheritance/cascading** — workspace pins are shared, not inherited with overrides
- **No automatic pin creation from conversation** — Phase 2 auto-extract is already planned separately
- **No GUI/web dashboard** — CLI-first, plugin skills are the interface

