# Installing context-pin on Codex

## Quick install

After cloning the repo, run:

```bash
node scripts/install-codex.js
```

This installer:
- copies plugin files to `~/.codex/plugins/context-pin/`
- mirrors plugin files to `~/.agents/plugins/context-pin/`
- updates marketplace entries in both:
  - `~/.agents/plugins/marketplace.json`
  - `~/.codex/plugins/marketplace.json`

Then restart Codex and check `/plugins` for **context-pin**.

## Manual install

1. Copy the repo to `~/.codex/plugins/context-pin/`
2. (Optional but recommended) mirror it to `~/.agents/plugins/context-pin/`
3. Add this entry to both marketplace files:
   - `~/.agents/plugins/marketplace.json`
   - `~/.codex/plugins/marketplace.json`

```json
{
  "name": "context-pin-local",
  "plugins": [
    {
      "name": "context-pin",
      "source": {
        "source": "local",
        "path": "./.codex/plugins/context-pin"
      },
      "policy": {
        "installation": "INSTALLED_BY_DEFAULT",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

4. Restart Codex and verify **context-pin** is available in `/plugins`.

## Updating

Re-run `node scripts/install-codex.js` after pulling new changes. It overwrites the installed copy and refreshes marketplace entries.

## Uninstalling

1. Delete:
   - `~/.codex/plugins/context-pin/`
   - `~/.agents/plugins/context-pin/` (if mirrored)
2. Remove the `context-pin` entry from:
   - `~/.agents/plugins/marketplace.json`
   - `~/.codex/plugins/marketplace.json`
