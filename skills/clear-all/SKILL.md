---
name: clear-all
description: Clear all pinned context
argument-hint: "[--global]"
user-invocable: true
allowed-tools: Bash
---

# /context-pin:clear-all

Clear all pins. Ask for confirmation before executing — this is destructive.

## Behavior

1. First run list to show current pins and count
2. Ask "Clear all N pins? (yes/no)"
3. If confirmed, execute:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" clear $ARGUMENTS
```

