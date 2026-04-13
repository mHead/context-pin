/**
 * Checks for plugin updates via GitHub API.
 * - Caches result for 24h to avoid rate limits
 * - 3s timeout, fails silently on any error
 * - Zero external dependencies (native https)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const REPO = 'mHead/context-pin';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REQUEST_TIMEOUT_MS = 3000;

function getLocalVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
    return pkg.version;
  } catch {
    return null;
  }
}

function getCacheDir() {
  const home = process.env.HOME || process.env.USERPROFILE;
  const agent = process.env.CODEX_PLUGIN_ROOT ? 'codex' : 'claude';
  const subdir = agent === 'codex' ? 'context-pin' : 'claude-pin';
  return path.join(home, `.${agent}`, subdir);
}

function getCachePath() {
  return path.join(getCacheDir(), 'update-check.json');
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(getCachePath(), 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    const dir = getCacheDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getCachePath(), JSON.stringify(data), 'utf8');
  } catch { /* ignore */ }
}

function parseVersion(v) {
  if (!v || typeof v !== 'string') return null;
  const clean = v.replace(/^v/, '');
  const parts = clean.split('.').map(Number);
  if (parts.length < 3 || parts.some(isNaN)) return null;
  return parts;
}

function isNewer(remote, local) {
  const r = parseVersion(remote);
  const l = parseVersion(local);
  if (!r || !l) return false;
  for (let i = 0; i < 3; i++) {
    if (r[i] > l[i]) return true;
    if (r[i] < l[i]) return false;
  }
  return false;
}

function fetchLatestVersion() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${REPO}/releases/latest`,
      headers: { 'User-Agent': 'claude-pin-update-check' },
      timeout: REQUEST_TIMEOUT_MS,
    };

    const req = https.get(options, (res) => {
      // Follow redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, { headers: options.headers, timeout: REQUEST_TIMEOUT_MS }, (res2) => {
          let body = '';
          res2.on('data', (chunk) => { body += chunk; });
          res2.on('end', () => {
            try {
              resolve(JSON.parse(body).tag_name || null);
            } catch { resolve(null); }
          });
        }).on('error', () => resolve(null));
        return;
      }

      if (res.statusCode !== 200) { resolve(null); return; }

      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body).tag_name || null);
        } catch { resolve(null); }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

/**
 * Check for updates. Returns a notice string if an update is available, null otherwise.
 * Caches the result for 24h. Fails silently.
 */
async function checkForUpdate() {
  try {
    if (process.env.PIN_SKIP_UPDATE_CHECK) return null;

    const localVersion = getLocalVersion();
    if (!localVersion) return null;

    const cache = readCache();
    const now = Date.now();

    // Use cache if fresh
    if (cache && cache.checkedAt && (now - cache.checkedAt) < CHECK_INTERVAL_MS) {
      if (cache.latestVersion && isNewer(cache.latestVersion, localVersion)) {
        return formatNotice(localVersion, cache.latestVersion);
      }
      return null;
    }

    // Fetch from GitHub
    const latestVersion = await fetchLatestVersion();
    writeCache({ checkedAt: now, latestVersion });

    if (latestVersion && isNewer(latestVersion, localVersion)) {
      return formatNotice(localVersion, latestVersion);
    }

    return null;
  } catch {
    return null;
  }
}

function formatNotice(local, remote) {
  const clean = remote.replace(/^v/, '');
  return `📌 Pin plugin update available: v${local} → v${clean}. Run: claude plugin update context-pin`;
}

module.exports = {
  checkForUpdate,
  // Exported for testing
  getLocalVersion,
  isNewer,
  parseVersion,
  readCache,
  writeCache,
  getCachePath,
  formatNotice,
  fetchLatestVersion,
  CHECK_INTERVAL_MS,
};

