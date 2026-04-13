const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createTmpEnv, scriptPath } = require('./helpers');

const CLI = scriptPath('cli.js');
let env;

function run(...args) { return env.exec(CLI, args); }
function runFail(...args) { return env.execExpectFail(CLI, args); }

beforeEach(() => { env = createTmpEnv(); });
afterEach(() => { env.cleanup(); });

describe('cli add', () => {
  it('adds a pin and prints confirmation with ID', () => {
    assert.match(run('add', 'use postgres'), /Pinned \([a-f0-9]{8}\): use postgres/);
  });

  it('shows permanent label by default', () => {
    assert.ok(run('add', 'important').includes('[permanent]'));
  });

  it('shows TTL label with --context flag', () => {
    assert.ok(run('add', 'temp', '--context').includes('[5 compactions left]'));
  });

  it('adds global pin', () => {
    run('add', 'global thing', '--global');
    assert.ok(run('list', '--global').includes('global thing'));
  });

  it('session pin persists and shows label', () => {
    const out = run('add', 'session ctx', '--session');
    assert.ok(out.includes('[session]'));
    assert.ok(run('list').includes('SESSION'));
  });

  it('fails without text', () => {
    assert.ok(runFail('add').stderr.includes('Usage'));
  });

  it('fails when text too long', () => {
    assert.ok(runFail('add', 'x'.repeat(2001)).stderr.includes('too long'));
  });

  it('fails with invalid category', () => {
    assert.ok(runFail('add', 'test', '--category', 'bogus').stderr.includes('Invalid category'));
  });

  it('generates .claude/claude-pin.md', () => {
    run('add', 'generates md');
    const mdPath = path.join(env.tmpDir, '.claude', 'claude-pin.md');
    assert.ok(fs.existsSync(mdPath));
    assert.ok(fs.readFileSync(mdPath, 'utf8').includes('generates md'));
  });
});

describe('cli list', () => {
  it('shows helpful message when empty', () => {
    assert.ok(run('list').includes('/context-pin:add'));
  });

  it('lists pins with IDs and text', () => {
    run('add', 'first');
    run('add', 'second');
    const out = run('list');
    assert.ok(out.includes('first'));
    assert.ok(out.includes('second'));
    assert.ok(out.includes('PROJECT'));
  });

  it('shows compactions left for context pins', () => {
    run('add', 'temp', '--context');
    assert.ok(run('list').includes('5 compactions left'));
  });
});

describe('cli remove', () => {
  it('removes a pin by ID', () => {
    const id = run('add', 'to remove').match(/\(([a-f0-9]{8})\)/)[1];
    assert.ok(run('remove', id).includes('Removed'));
    assert.ok(run('list').includes('/context-pin:add'));
  });

  it('removes by ID prefix', () => {
    const id = run('add', 'prefix test').match(/\(([a-f0-9]{8})\)/)[1];
    assert.ok(run('remove', id.slice(0, 4)).includes('Removed'));
  });

  it('fails for nonexistent ID with helpful message', () => {
    const err = runFail('remove', 'deadbeef');
    assert.ok(err.stderr.includes('not found'));
    assert.ok(err.stderr.includes('/context-pin:list'));
  });

  it('fails without ID with helpful message', () => {
    const err = runFail('remove');
    assert.ok(err.stderr.includes('/context-pin:list'));
  });
});

describe('cli remove text search', () => {
  it('removes by text substring', () => {
    run('add', 'Use PostgreSQL for writes');
    run('add', 'API under 200ms');
    assert.ok(run('remove', 'postgres').includes('Removed'));
    const list = run('list');
    assert.ok(!list.includes('PostgreSQL'));
    assert.ok(list.includes('200ms'));
  });

  it('shows matches when text search is ambiguous', () => {
    run('add', 'Use PostgreSQL for writes');
    run('add', 'PostgreSQL config settings');
    const err = runFail('remove', 'PostgreSQL');
    assert.ok(err.stderr.includes('Multiple pins match'));
    assert.ok(err.stderr.includes('PostgreSQL for writes'));
    assert.ok(err.stderr.includes('PostgreSQL config'));
  });
});

describe('cli move', () => {
  it('moves a pin to global', () => {
    const id = run('add', 'move me').match(/\(([a-f0-9]{8})\)/)[1];
    assert.ok(run('move', id, 'global').includes('Moved'));
    assert.ok(run('list', '--global').includes('move me'));
  });

  it('moves by text search', () => {
    run('add', 'Use PostgreSQL');
    assert.ok(run('move', 'postgres', 'global').includes('Moved'));
  });

  it('fails without args', () => {
    assert.ok(runFail('move').stderr.includes('Usage'));
  });

  it('fails for nonexistent pin', () => {
    assert.ok(runFail('move', 'nonexistent', 'global').stderr.includes('not found'));
  });

  it('shows matches when text search is ambiguous', () => {
    run('add', 'Use PostgreSQL');
    run('add', 'PostgreSQL config');
    const err = runFail('move', 'PostgreSQL', 'global');
    assert.ok(err.stderr.includes('Multiple pins match'));
  });
});

describe('cli clear', () => {
  it('clears project pins but preserves session pins', () => {
    run('add', 'one');
    run('add', 'session thing', '--session');
    run('clear');
    const list = run('list');
    assert.ok(!list.includes('one'));
    assert.ok(list.includes('session thing'));
  });

  it('clears global pins', () => {
    run('add', 'glob', '--global');
    assert.ok(run('clear', '--global').includes('Cleared'));
  });
});

describe('cli update', () => {
  it('updates an existing pin', () => {
    const id = run('add', 'original').match(/\(([a-f0-9]{8})\)/)[1];
    const out = run('add', 'modified', '--update', id);
    assert.ok(out.includes('Updated'));
    assert.ok(out.includes('modified'));
  });

  it('updates by ID prefix', () => {
    const id = run('add', 'original').match(/\(([a-f0-9]{8})\)/)[1];
    const out = run('add', 'modified', '--update', id.slice(0, 4));
    assert.ok(out.includes('Updated'));
  });

  it('fails for nonexistent target with helpful message', () => {
    const err = runFail('add', 'nope', '--update', 'deadbeef');
    assert.ok(err.stderr.includes('not found'));
    assert.ok(err.stderr.includes('/context-pin:list'));
  });

  it('fails when --update has no ID', () => {
    const err = runFail('add', 'text', '--update');
    assert.ok(err.stderr.includes('requires a pin ID'));
  });
});

describe('cli generate', () => {
  it('generates when pins exist', () => {
    run('add', 'test');
    assert.ok(run('generate').includes('Generated'));
  });

  it('reports no pins when empty', () => {
    assert.ok(run('generate').includes('No pins'));
  });
});

describe('cli flag ordering', () => {
  it('accepts flags before text', () => {
    const out = run('add', '--context', 'flag first');
    assert.ok(out.includes('flag first'));
    assert.ok(out.includes('[5 compactions left]'));
  });

  it('accepts flags after text', () => {
    const out = run('add', 'text first', '--context');
    assert.ok(out.includes('[5 compactions left]'));
  });

  it('joins multiple unquoted words into text', () => {
    const out = run('add', 'use', 'postgres', 'for', 'writes');
    assert.ok(out.includes('use postgres for writes'));
    const list = run('list');
    assert.ok(list.includes('use postgres for writes'));
  });

  it('joins words mixed with flags', () => {
    const out = run('add', 'temp', 'context', 'note', '--context');
    assert.ok(out.includes('temp context note'));
    assert.ok(out.includes('[5 compactions left]'));
  });
});

describe('cli error handling', () => {
  it('unknown command shows available commands', () => {
    assert.ok(runFail('bogus').stderr.includes('Commands:'));
  });

  it('no command shows available commands', () => {
    assert.ok(runFail().stderr.includes('Commands:'));
  });

  it('error messages do not leak cli.js implementation', () => {
    const err = runFail('remove');
    assert.ok(!err.stderr.includes('cli.js'));
  });
});

