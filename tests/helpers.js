const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts');

function createTmpEnv({ separateHome = false } = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-pin-test-'));
  const homeDir = separateHome
    ? (() => { const h = path.join(tmpDir, 'home'); fs.mkdirSync(h, { recursive: true }); return h; })()
    : tmpDir;

  const env = { ...process.env, HOME: homeDir, USERPROFILE: homeDir, PIN_SKIP_UPDATE_CHECK: '1' };

  function exec(script, args = [], { stdin } = {}) {
    if (stdin !== undefined) {
      return spawnSync('node', [script, ...args], {
        cwd: tmpDir, encoding: 'utf8', input: stdin, env,
      }).stdout;
    }
    return execFileSync('node', [script, ...args], {
      cwd: tmpDir, encoding: 'utf8', env,
    });
  }

  function execExpectFail(script, args = []) {
    try {
      execFileSync('node', [script, ...args], {
        cwd: tmpDir, encoding: 'utf8', env,
      });
      throw new Error('Expected command to fail');
    } catch (err) {
      if (err.message === 'Expected command to fail') throw err;
      return err;
    }
  }

  function cleanup() {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  return { tmpDir, homeDir, env, exec, execExpectFail, cleanup };
}

function scriptPath(name) {
  return path.join(SCRIPTS_DIR, name);
}

module.exports = { createTmpEnv, scriptPath, SCRIPTS_DIR };
