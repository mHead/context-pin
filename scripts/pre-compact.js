#!/usr/bin/env node

/**
 * PreCompact hook — increments compaction counters, expires TTL pins,
 * and regenerates .claude/claude-pin.md before compaction runs.
 */

const store = require('./lib/pin-store');

try {
  store.incrementCompactions('project');
  store.incrementCompactions('global');

  const outPath = store.generateClaudeMd();
  if (outPath) {
    process.stderr.write(`claude-pin: refreshed ${outPath}\n`);
  }
} catch (err) {
  process.stderr.write(`claude-pin: pre-compact error: ${err.message}\n`);
}
