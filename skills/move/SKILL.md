---
name: move
description: Move a pin between project and global scope
argument-hint: "<id or text> <project|global>"
user-invocable: true
allowed-tools: Bash
---

# /pin:move

Move a pin between scopes (project ↔ global).

## Behavior

When invoked, execute:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" move $ARGUMENTS
```

If the result shows "Multiple pins match", present the matches to the user and ask which one to move. Then re-run with the specific ID.

The query can be a pin ID, ID prefix (3+ chars), or text search (substring match).
