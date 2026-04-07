const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createTmpEnv, scriptPath } = require('./helpers');

const CLI = scriptPath('cli.js');
const SESSION_START = scriptPath('session-start.js');
const PRE_COMPACT = scriptPath('pre-compact.js');
let env;

function cli(...args) { return env.exec(CLI, args); }
function hook(script, opts) { return env.exec(script, [], opts); }
function hookWithTrigger(script, trigger) {
  return hook(script, { stdin: JSON.stringify({ trigger }) });
}

beforeEach(() => { env = createTmpEnv({ separateHome: true }); });
afterEach(() => { env.cleanup(); });

describe('session-start hook', () => {
  it('shows onboarding message when no pins', () => {
    const out = hook(SESSION_START);
    assert.ok(out.includes('Pin plugin active'));
    assert.ok(out.includes('/pin:add'));
  });

  it('shows pins with IDs when they exist', () => {
    cli('add', 'use postgres');
    const out = hook(SESSION_START);
    assert.ok(out.includes('PINNED CONTEXT'));
    assert.ok(out.includes('use postgres'));
    assert.match(out, /\([a-f0-9]{8}\)/); // IDs visible
  });

  it('shows "restored" message after compaction', () => {
    cli('add', 'decision one');
    cli('add', 'decision two');
    const out = hookWithTrigger(SESSION_START, 'compact');
    assert.ok(out.includes('2 pins restored after compaction'));
  });

  it('always includes proactive pinning instruction', () => {
    assert.ok(hook(SESSION_START).includes('proactively offer to pin'));
    cli('add', 'test');
    assert.ok(hook(SESSION_START).includes('proactively offer to pin'));
  });

  it('includes both project and global pins', () => {
    cli('add', 'proj');
    cli('add', 'glob', '--global');
    const out = hook(SESSION_START);
    assert.ok(out.includes('[PROJECT]'));
    assert.ok(out.includes('[GLOBAL]'));
  });

  it('includes session pins on compact', () => {
    cli('add', 'session ctx', '--session');
    assert.ok(hookWithTrigger(SESSION_START, 'compact').includes('session ctx'));
  });

  it('clears session pins on startup', () => {
    cli('add', 'session only', '--session');
    cli('add', 'permanent');
    hookWithTrigger(SESSION_START, 'startup');
    const list = cli('list');
    assert.ok(list.includes('permanent'));
    assert.ok(!list.includes('session only'));
  });

  it('preserves session pins on compact', () => {
    cli('add', 'session ctx', '--session');
    hookWithTrigger(SESSION_START, 'compact');
    assert.ok(cli('list').includes('session ctx'));
  });

  it('gracefully handles corrupted pins.json', () => {
    const dir = path.join(env.tmpDir, '.claude', 'claude-pin');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'pins.json'), '{corrupted', 'utf8');
    const out = hook(SESSION_START);
    // Should not crash — either shows onboarding or error message
    assert.ok(out.length > 0);
  });
});

describe('pre-compact hook', () => {
  it('increments compaction counters', () => {
    cli('add', 'test', '--context');
    hook(PRE_COMPACT);
    assert.ok(cli('list').includes('4 compactions left'));
  });

  it('expires snapshot pins after 1 compaction', () => {
    cli('add', 'keep-this');
    cli('add', 'snap', '--category', 'snapshot');
    hook(PRE_COMPACT);
    const list = cli('list');
    assert.ok(list.includes('keep-this'));
    assert.ok(!list.includes('snap'));
  });

  it('expires context pins after 5 compactions', () => {
    cli('add', 'ctx', '--context');
    for (let i = 0; i < 5; i++) hook(PRE_COMPACT);
    assert.ok(cli('list').includes('/pin:add'));
  });

  it('keeps permanent pins through many compactions', () => {
    cli('add', 'forever', '--category', 'architecture');
    for (let i = 0; i < 20; i++) hook(PRE_COMPACT);
    assert.ok(cli('list').includes('forever'));
  });

  it('does not crash with no pins', () => {
    hook(PRE_COMPACT); // should not throw
    const mdPath = path.join(env.tmpDir, '.claude', 'claude-pin.md');
    assert.ok(!fs.existsSync(mdPath));
  });

  it('does not expire session pins', () => {
    cli('add', 'session thing', '--session');
    for (let i = 0; i < 10; i++) hook(PRE_COMPACT);
    assert.ok(cli('list').includes('session thing'));
  });
});

describe('session-start output format', () => {
  it('uses bullet format with pin IDs', () => {
    cli('add', 'test pin');
    const out = hook(SESSION_START);
    const lines = out.split('\n').filter(l => l.includes('\u2022'));
    assert.ok(lines.length > 0);
    for (const line of lines) {
      assert.match(line, /^\s+\u2022 \([a-f0-9]{8}\) .+/);
    }
  });

  it('groups under scope headers', () => {
    cli('add', 'proj');
    cli('add', 'glob', '--global');
    const out = hook(SESSION_START);
    assert.ok(out.indexOf('[PROJECT]') < out.indexOf('[GLOBAL]'));
  });
});
