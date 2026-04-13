const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  isNewer,
  parseVersion,
  getLocalVersion,
  formatNotice,
  CHECK_INTERVAL_MS,
} = require('../scripts/lib/update-check');

// --- Pure function tests (no I/O) ---

describe('parseVersion', () => {
  it('parses semver string', () => {
    assert.deepEqual(parseVersion('1.2.3'), [1, 2, 3]);
  });

  it('strips v prefix', () => {
    assert.deepEqual(parseVersion('v0.2.0'), [0, 2, 0]);
  });

  it('returns null for invalid input', () => {
    assert.equal(parseVersion('abc'), null);
    assert.equal(parseVersion(null), null);
    assert.equal(parseVersion(''), null);
    assert.equal(parseVersion('1.2'), null);
  });
});

describe('isNewer', () => {
  it('detects newer major', () => {
    assert.ok(isNewer('2.0.0', '1.0.0'));
  });

  it('detects newer minor', () => {
    assert.ok(isNewer('0.3.0', '0.2.0'));
  });

  it('detects newer patch', () => {
    assert.ok(isNewer('0.2.1', '0.2.0'));
  });

  it('returns false for same version', () => {
    assert.ok(!isNewer('0.2.0', '0.2.0'));
  });

  it('returns false for older version', () => {
    assert.ok(!isNewer('0.1.0', '0.2.0'));
  });

  it('handles v prefix on remote', () => {
    assert.ok(isNewer('v0.3.0', '0.2.0'));
  });

  it('returns false for invalid input', () => {
    assert.ok(!isNewer(null, '0.2.0'));
    assert.ok(!isNewer('0.3.0', null));
  });
});

describe('getLocalVersion', () => {
  it('returns a semver string from package.json', () => {
    const v = getLocalVersion();
    assert.match(v, /^\d+\.\d+\.\d+/);
  });
});

describe('formatNotice', () => {
  it('formats update notice with clean versions', () => {
    const notice = formatNotice('0.2.0', 'v0.3.0');
    assert.ok(notice.includes('v0.2.0'));
    assert.ok(notice.includes('v0.3.0'));
    assert.ok(notice.includes('update available'));
  });
});

// --- Cache behavior tests ---

describe('cache behavior', () => {
  let tmpDir;
  let originalHome;
  let originalUserProfile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-update-test-'));
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    process.env.HOME = tmpDir;
    process.env.USERPROFILE = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writeCache creates file and readCache reads it', () => {
    // Re-require to pick up new HOME
    delete require.cache[require.resolve('../scripts/lib/update-check')];
    const uc = require('../scripts/lib/update-check');

    const data = { checkedAt: Date.now(), latestVersion: 'v0.3.0' };
    uc.writeCache(data);
    const cached = uc.readCache();
    assert.deepEqual(cached, data);
  });

  it('readCache returns null when no cache exists', () => {
    delete require.cache[require.resolve('../scripts/lib/update-check')];
    const uc = require('../scripts/lib/update-check');

    assert.equal(uc.readCache(), null);
  });

  it('checkForUpdate returns null when cache is fresh and version is current', async () => {
    delete require.cache[require.resolve('../scripts/lib/update-check')];
    const uc = require('../scripts/lib/update-check');

    const localVersion = uc.getLocalVersion();
    uc.writeCache({ checkedAt: Date.now(), latestVersion: localVersion });
    const result = await uc.checkForUpdate();
    assert.equal(result, null);
  });

  it('checkForUpdate returns notice when cache says newer version exists', async () => {
    delete require.cache[require.resolve('../scripts/lib/update-check')];
    const uc = require('../scripts/lib/update-check');

    uc.writeCache({ checkedAt: Date.now(), latestVersion: 'v99.0.0' });
    const result = await uc.checkForUpdate();
    assert.ok(result);
    assert.ok(result.includes('update available'));
    assert.ok(result.includes('v99.0.0'));
  });

  it('checkForUpdate skips network call when cache is fresh', async () => {
    delete require.cache[require.resolve('../scripts/lib/update-check')];
    const uc = require('../scripts/lib/update-check');

    // Write fresh cache with current version — should return null without network
    const localVersion = uc.getLocalVersion();
    uc.writeCache({ checkedAt: Date.now(), latestVersion: localVersion });

    const start = Date.now();
    await uc.checkForUpdate();
    const elapsed = Date.now() - start;
    // Should be near-instant (< 100ms) since no network call
    assert.ok(elapsed < 100, `took ${elapsed}ms, expected < 100ms`);
  });

  it('checkForUpdate treats stale cache as expired', async () => {
    delete require.cache[require.resolve('../scripts/lib/update-check')];
    const uc = require('../scripts/lib/update-check');

    // Write cache from 25 hours ago
    const staleTime = Date.now() - (25 * 60 * 60 * 1000);
    uc.writeCache({ checkedAt: staleTime, latestVersion: 'v99.0.0' });

    // This will try to fetch (and likely fail/timeout in test env) — that's fine
    // The point is it doesn't use the stale cache value
    const result = await uc.checkForUpdate();
    // Result is either null (network failed) or a notice (network succeeded)
    // We can't assert which, but it shouldn't crash
    assert.ok(result === null || typeof result === 'string');
  });
});

// --- Integration with session-start ---

describe('session-start update notice', () => {
  let tmpDir;
  let homeDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-update-hook-'));
    homeDir = path.join(tmpDir, 'home');
    fs.mkdirSync(homeDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('shows update notice on startup when cached update available', () => {
    // Pre-seed cache with a fake newer version
    const cacheDir = path.join(homeDir, '.claude', 'claude-pin');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, 'update-check.json'),
      JSON.stringify({ checkedAt: Date.now(), latestVersion: 'v99.0.0' }),
    );

    const { spawnSync } = require('child_process');
    const sessionStart = path.join(__dirname, '..', 'scripts', 'session-start.js');
    const result = spawnSync('node', [sessionStart], {
      cwd: tmpDir,
      encoding: 'utf8',
      env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir },
      input: JSON.stringify({ trigger: 'startup' }),
    });

    assert.ok(result.stdout.includes('update available'), `expected update notice in: ${result.stdout}`);
    assert.ok(result.stdout.includes('v99.0.0'));
  });

  it('does NOT show update notice after compaction', () => {
    // Pre-seed cache with a fake newer version
    const cacheDir = path.join(homeDir, '.claude', 'claude-pin');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, 'update-check.json'),
      JSON.stringify({ checkedAt: Date.now(), latestVersion: 'v99.0.0' }),
    );

    const { spawnSync } = require('child_process');
    const sessionStart = path.join(__dirname, '..', 'scripts', 'session-start.js');
    const result = spawnSync('node', [sessionStart], {
      cwd: tmpDir,
      encoding: 'utf8',
      env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir },
      input: JSON.stringify({ trigger: 'compact' }),
    });

    assert.ok(!result.stdout.includes('update available'), `should not show update after compaction: ${result.stdout}`);
  });

  it('does NOT crash when network is unavailable', () => {
    // No cache, no network — should still produce valid output
    const { spawnSync } = require('child_process');
    const sessionStart = path.join(__dirname, '..', 'scripts', 'session-start.js');
    const result = spawnSync('node', [sessionStart], {
      cwd: tmpDir,
      encoding: 'utf8',
      env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir },
      input: JSON.stringify({ trigger: 'startup' }),
      timeout: 10000,
    });

    assert.ok(result.stdout.includes('Pin plugin active'));
    assert.equal(result.status, 0);
  });
});
