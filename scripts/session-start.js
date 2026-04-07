#!/usr/bin/env node

/**
 * SessionStart hook — outputs all active pins to stdout so they're
 * injected into conversation context at session start and after compaction.
 */

const fs = require('fs');
const store = require('./lib/pin-store');

let trigger = 'startup';
try {
  if (!process.stdin.isTTY) {
    const input = fs.readFileSync(0, 'utf8').trim();
    if (input) {
      const data = JSON.parse(input);
      trigger = data.trigger || data.type || 'startup';
    }
  }
} catch { /* default to startup */ }

try {
  if (trigger === 'startup') {
    store.clearSessionPins();
  }

  const all = store.listPins();
  const scopes = Object.entries(all);
  const totalPins = scopes.reduce((n, [, pins]) => n + pins.length, 0);

  const lines = [];

  if (totalPins > 0) {
    const label = trigger === 'compact'
      ? `📌 ${totalPins} pin${totalPins !== 1 ? 's' : ''} restored after compaction. These MUST be preserved as active constraints:`
      : '📌 PINNED CONTEXT — The following items MUST be preserved as active constraints:';
    lines.push(label, '');

    for (const [scope, pins] of scopes) {
      lines.push(`[${scope.toUpperCase()}]`);
      for (const pin of pins) {
        const safe = pin.text.replace(/[\r\n]+/g, ' ').trim();
        lines.push(`  • (${pin.id}) ${safe}`);
      }
      lines.push('');
    }
  } else {
    lines.push(
      '📌 Pin plugin active. Pin important decisions so they survive compaction:',
      '  /pin:add "your decision or constraint"',
      '  /pin:list to see all pins',
      '',
    );
  }

  lines.push(
    '---',
    'INSTRUCTION: When you detect that a significant decision, constraint, or architectural choice has been made during this conversation, proactively offer to pin it. Ask briefly: "Want me to pin that?" If the user agrees, execute the pin command yourself. Do this naturally — don\'t force it on trivial details.',
    '',
  );

  process.stdout.write(lines.join('\n'));
} catch (err) {
  // Graceful degradation: output warning instead of crashing
  process.stdout.write(`📌 Pin plugin: failed to load pins (${err.message}). Run /pin:list to check.\n`);
}
