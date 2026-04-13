#!/usr/bin/env node

const store = require('./lib/pin-store');

const args = process.argv.slice(2);
const command = args[0];

function parseFlags(args) {
  const flags = {};
  const textParts = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--global') {
      flags.scope = 'global';
    } else if (args[i] === '--session') {
      flags.session = true;
    } else if (args[i] === '--context') {
      flags.category = 'context';
    } else if (args[i] === '--category' && args[i + 1]) {
      flags.category = args[++i];
    } else if (args[i] === '--update') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) {
        console.error('--update requires a pin ID. Run /context-pin:list to see all pins.');
        process.exit(1);
      }
      flags.updateId = args[++i];
    } else if (!args[i].startsWith('--')) {
      textParts.push(args[i]);
    }
  }
  const text = textParts.length > 0 ? textParts.join(' ') : null;
  return { text, ...flags };
}

function handleAmbiguous(result, action) {
  if (result && result.ambiguous) {
    console.error(`Multiple pins match. Be more specific or use an ID:`);
    for (const pin of result.ambiguous) {
      console.error(`  ${pin.id}  ${pin.text}`);
    }
    process.exit(1);
  }
}

function formatExpiry(pin) {
  if (pin.session) return 'session';
  if (pin.ttl === -1) return 'permanent';
  const left = pin.ttl - pin.compactions;
  return `${left} compaction${left !== 1 ? 's' : ''} left`;
}

switch (command) {
  case 'add': {
    const { text, scope = 'project', category = 'decision', session = false, updateId } = parseFlags(args.slice(1));
    if (!text) {
      console.error('Usage: add "text" [--context] [--global] [--session] [--update <id>]');
      process.exit(1);
    }
    if (text.length > store.MAX_PIN_LENGTH) {
      console.error(`Pin text too long: ${text.length} chars (max ${store.MAX_PIN_LENGTH})`);
      process.exit(1);
    }
    try {
      if (updateId) {
        const pin = store.updatePin(updateId, text, { scope });
        handleAmbiguous(pin);
        if (pin) {
          console.log(`Updated pin ${pin.id}: ${pin.text}`);
        } else {
          console.error(`Pin "${updateId}" not found. Run /context-pin:list to see all pins.`);
          process.exit(1);
        }
      } else {
        const pin = store.addPin(text, { scope, category, session });
        console.log(`Pinned (${pin.id}): ${pin.text}  [${formatExpiry(pin)}]`);
        if (pin._warnings) {
          for (const w of pin._warnings) console.log(`  ⚠ ${w}`);
        }
      }
      store.generateClaudeMd();
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    break;
  }

  case 'list': {
    const { scope } = parseFlags(args.slice(1));
    const all = store.listPins(scope ? { scope } : {});
    if (Object.keys(all).length === 0) {
      console.log('No pins yet. Use /context-pin:add "text" to pin your first decision.');
      break;
    }
    for (const [s, pins] of Object.entries(all)) {
      console.log(`\n=== ${s.toUpperCase()} ===`);
      for (const pin of pins) {
        console.log(`  ${pin.id}  ${pin.text}  (${formatExpiry(pin)})`);
      }
    }
    break;
  }

  case 'remove': {
    const id = args[1];
    if (!id) {
      console.error('Usage: remove <id>. Run /context-pin:list to see all pins.');
      process.exit(1);
    }
    const removed = store.removePin(id);
    handleAmbiguous(removed);
    if (removed) {
      console.log(`Removed: ${removed.text}`);
      store.generateClaudeMd();
    } else {
      console.error(`Pin "${id}" not found. Run /context-pin:list to see all pins.`);
      process.exit(1);
    }
    break;
  }

  case 'clear': {
    const { scope = 'project' } = parseFlags(args.slice(1));
    store.clearPins(scope);
    console.log(`Cleared all ${scope} pins.`);
    store.generateClaudeMd();
    break;
  }

  case 'move': {
    const query = args[1];
    const target = args[2];
    if (!query || !target) {
      console.error('Usage: move <id or text> <project|global>');
      process.exit(1);
    }
    try {
      const pin = store.movePin(query, target);
      handleAmbiguous(pin);
      if (pin) {
        console.log(`Moved pin ${pin.id} to ${target}: ${pin.text}`);
        store.generateClaudeMd();
      } else {
        console.error(`Pin "${query}" not found. Run /context-pin:list to see all pins.`);
        process.exit(1);
      }
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    break;
  }

  case 'generate': {
    const outPath = store.generateClaudeMd();
    if (outPath) {
      console.log(`Generated ${outPath}`);
    } else {
      console.log('No pins to generate.');
    }
    break;
  }

  default:
    console.error('Commands: add, list, remove, move, clear, generate');
    process.exit(1);
}

