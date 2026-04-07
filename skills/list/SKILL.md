---
name: list
description: List all pinned context items
argument-hint: "[--global]"
user-invocable: true
allowed-tools: Bash
---

# /pin:list

List all active pinned context, grouped by scope.

## Behavior

When invoked, execute:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" list $ARGUMENTS
```

Display results as a clean list:
- **ID** — short hex (for remove/update)
- **Pin** — the text
- **Expires** — "permanent" or "N compactions left"

Keep the output compact. Don't add extra commentary.
