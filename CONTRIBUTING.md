# Contributing to context-pin

## Setup

```bash
git clone https://github.com/mHead/context-pin.git
cd context-pin
npm test
```

No `npm install` needed — zero dependencies.

## Running tests

```bash
npm test                                    # all tests
node --test tests/pin-store.test.js         # unit tests only
node --test tests/plugin-structure.test.js  # schema validation only
```

## Making changes

1. Create a branch from `master`
2. Make your changes
3. Run `npm test` — all 141 tests must pass
4. Submit a PR with a clear description of what and why

## Code style

- Pure Node.js, no external dependencies
- Use `node:test` and `node:assert/strict` for tests
- Keep it simple — this plugin is intentionally lightweight

## Plugin structure

The `plugin-structure.test.js` file validates the plugin against the Claude Code plugin spec. If you add new skills, hooks, or change the structure, these tests will catch spec violations.

## Security

If you find a security vulnerability, please report it privately via GitHub Security Advisories instead of opening a public issue.
