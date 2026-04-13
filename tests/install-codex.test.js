const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const INSTALL_SCRIPT = path.join(__dirname, '..', 'scripts', 'install-codex.js');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function runInstaller({ homeDir, cwdDir }) {
  const result = spawnSync('node', [INSTALL_SCRIPT], {
    cwd: cwdDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
      PIN_SKIP_UPDATE_CHECK: '1',
    },
  });

  assert.equal(
    result.status,
    0,
    `installer failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );

  return result;
}

function getMarketplacePaths(homeDir) {
  return {
    agents: path.join(homeDir, '.agents', 'plugins', 'marketplace.json'),
    codex: path.join(homeDir, '.codex', 'plugins', 'marketplace.json'),
  };
}

function getContextPinEntries(marketplace) {
  return (marketplace.plugins || []).filter((p) => p && p.name === 'context-pin');
}

function getLegacyPinEntries(marketplace) {
  return (marketplace.plugins || []).filter((p) => p && p.name === 'pin');
}

function assertCanonicalContextPinEntry(homeDir, entry) {
  assert.equal(entry.source.source, 'local');
  assert.equal(entry.source.path, './.codex/plugins/context-pin');
  assert.equal(entry.policy.installation, 'INSTALLED_BY_DEFAULT');
  assert.equal(entry.policy.authentication, 'ON_INSTALL');

  // Mirrors Codex resolution behavior: path is resolved from HOME.
  const resolvedPluginDir = path.resolve(homeDir, entry.source.path);
  const manifestPath = path.join(resolvedPluginDir, '.codex-plugin', 'plugin.json');
  assert.ok(fs.existsSync(manifestPath), `missing manifest at ${manifestPath}`);
}

describe('install-codex.js compatibility', () => {
  let tmpDir;
  let homeDir;
  let cwdDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'context-pin-install-'));
    homeDir = path.join(tmpDir, 'home');
    cwdDir = path.join(tmpDir, 'random', 'nested', 'cwd');
    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(cwdDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('installs plugin files in both agents and codex plugin directories from arbitrary cwd', () => {
    runInstaller({ homeDir, cwdDir });

    const installedDirs = [
      path.join(homeDir, '.agents', 'plugins', 'context-pin'),
      path.join(homeDir, '.codex', 'plugins', 'context-pin'),
    ];

    for (const dir of installedDirs) {
      assert.ok(fs.existsSync(path.join(dir, '.codex-plugin', 'plugin.json')), `${dir}: missing codex manifest`);
      assert.ok(fs.existsSync(path.join(dir, 'hooks', 'hooks-codex.json')), `${dir}: missing codex hooks`);
      assert.ok(fs.existsSync(path.join(dir, 'skills', 'add', 'SKILL.md')), `${dir}: missing skills`);
      assert.ok(fs.existsSync(path.join(dir, 'assets', 'context-pin.svg')), `${dir}: missing assets`);
    }
  });

  it('writes canonical context-pin entry in both marketplace files', () => {
    runInstaller({ homeDir, cwdDir });

    const { agents, codex } = getMarketplacePaths(homeDir);
    for (const filePath of [agents, codex]) {
      assert.ok(fs.existsSync(filePath), `missing marketplace: ${filePath}`);

      const marketplace = readJson(filePath);
      const entries = getContextPinEntries(marketplace);
      assert.equal(entries.length, 1, `${filePath}: expected exactly one context-pin entry`);
      assertCanonicalContextPinEntry(homeDir, entries[0]);

      const legacyEntries = getLegacyPinEntries(marketplace);
      assert.equal(legacyEntries.length, 0, `${filePath}: legacy "pin" entry should be removed`);
    }
  });

  it('migrates legacy entries and preserves unrelated plugins', () => {
    const { agents, codex } = getMarketplacePaths(homeDir);

    for (const filePath of [agents, codex]) {
      writeJson(filePath, {
        name: 'custom-market',
        plugins: [
          {
            name: 'pin',
            source: { source: 'local', path: './pin' },
            policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
            category: 'Productivity',
          },
          {
            name: 'context-pin',
            source: { source: 'local', path: './context-pin' },
            policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
            category: 'Productivity',
          },
          {
            name: 'other-plugin',
            source: { source: 'local', path: './other-plugin' },
            policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
            category: 'Productivity',
          },
        ],
      });
    }

    runInstaller({ homeDir, cwdDir });

    for (const filePath of [agents, codex]) {
      const marketplace = readJson(filePath);
      assert.equal(marketplace.name, 'custom-market');

      const contextPinEntries = getContextPinEntries(marketplace);
      assert.equal(contextPinEntries.length, 1, `${filePath}: expected one migrated context-pin entry`);
      assertCanonicalContextPinEntry(homeDir, contextPinEntries[0]);

      assert.equal(getLegacyPinEntries(marketplace).length, 0, `${filePath}: legacy pin entry not removed`);

      const otherEntries = (marketplace.plugins || []).filter((p) => p && p.name === 'other-plugin');
      assert.equal(otherEntries.length, 1, `${filePath}: unrelated plugin should be preserved`);
      assert.equal(otherEntries[0].source.path, './other-plugin');
    }
  });

  it('is idempotent and does not duplicate context-pin entries', () => {
    runInstaller({ homeDir, cwdDir });
    runInstaller({ homeDir, cwdDir });

    const { agents, codex } = getMarketplacePaths(homeDir);
    for (const filePath of [agents, codex]) {
      const marketplace = readJson(filePath);
      const contextPinEntries = getContextPinEntries(marketplace);
      assert.equal(contextPinEntries.length, 1, `${filePath}: duplicated context-pin entry after rerun`);
    }
  });
});
