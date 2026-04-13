---
name: remove
description: Remove a pinned context item
argument-hint: "<id or search text>"
user-invocable: true
allowed-tools: Bash
---

# /context-pin:remove

Remove a pin by ID, ID prefix, or text search.

## Behavior

When invoked, execute:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" remove "$ARGUMENTS"
```

If the result shows "Multiple pins match", present the matches to the user and ask which one to remove. Then re-run with the specific ID.

Confirm removal with the pin text that was removed.

