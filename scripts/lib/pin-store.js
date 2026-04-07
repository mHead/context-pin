const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let PROJECT_DIR = path.join(process.cwd(), '.claude', 'claude-pin');
let GLOBAL_DIR = path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'claude-pin');
let CWD_OVERRIDE = null;

const STORAGE_SCOPES = ['project', 'global'];
const VALID_CATEGORIES = Object.keys({ decision: 1, constraint: 1, architecture: 1, context: 1, snapshot: 1 });
const MAX_PIN_LENGTH = 2000;
const MAX_PIN_COUNT = 50;

function configure({ projectDir, globalDir, cwd } = {}) {
  if (projectDir) PROJECT_DIR = projectDir;
  if (globalDir) GLOBAL_DIR = globalDir;
  if (cwd) CWD_OVERRIDE = cwd;
}

function assertValidScope(scope) {
  if (!STORAGE_SCOPES.includes(scope)) {
    throw new Error(`Invalid scope: "${scope}". Must be one of: ${STORAGE_SCOPES.join(', ')}`);
  }
}

const TTL_MAP = {
  decision: Infinity,
  constraint: Infinity,
  architecture: Infinity,
  context: 5,
  snapshot: 1,
};

function pinsPath(scope) {
  assertValidScope(scope);
  const dir = scope === 'global' ? GLOBAL_DIR : PROJECT_DIR;
  return path.join(dir, 'pins.json');
}

function lockPath(scope) {
  return pinsPath(scope) + '.lock';
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function acquireLock(scope) {
  const lock = lockPath(scope);
  ensureDir(lock);
  const maxAttempts = 50;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
      return true;
    } catch {
      const start = Date.now();
      while (Date.now() - start < 100) { /* spin */ }
    }
  }
  try {
    const stat = fs.statSync(lock);
    if (Date.now() - stat.mtimeMs > 30000) {
      fs.unlinkSync(lock);
      fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
      return true;
    }
  } catch { /* ignore */ }
  throw new Error(`Could not acquire lock for scope "${scope}" after ${maxAttempts} attempts`);
}

function releaseLock(scope) {
  try { fs.unlinkSync(lockPath(scope)); } catch { /* ignore */ }
}

function withLock(scope, fn) {
  acquireLock(scope);
  try {
    return fn();
  } finally {
    releaseLock(scope);
  }
}

function validatePin(pin) {
  return (
    typeof pin === 'object' && pin !== null &&
    typeof pin.id === 'string' &&
    typeof pin.text === 'string' &&
    typeof pin.category === 'string' &&
    typeof pin.scope === 'string' &&
    typeof pin.ttl === 'number' &&
    (pin.compactions === undefined || typeof pin.compactions === 'number')
  );
}

function readPins(scope) {
  const p = pinsPath(scope);
  if (!fs.existsSync(p)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!Array.isArray(raw)) return [];
    return raw.filter(validatePin);
  } catch {
    return [];
  }
}

function writePins(scope, pins) {
  const p = pinsPath(scope);
  ensureDir(p);
  const data = JSON.stringify(pins, null, 2);
  fs.writeFileSync(p, data, { encoding: 'utf8', mode: 0o600 });
}

function generateId() {
  return crypto.randomBytes(4).toString('hex');
}

// --- Helpers ---

function resolveScopes(scope) {
  return scope ? [scope] : STORAGE_SCOPES;
}

function sanitizeText(text) {
  return text.replace(/[\r\n]+/g, ' ').trim();
}

function sanitizeField(value) {
  return String(value).replace(/[\r\n\[\]*()`_#]+/g, '').trim();
}

function ttlForCategory(category) {
  const ttl = TTL_MAP[category] ?? 5;
  return ttl === Infinity ? -1 : ttl;
}

function validateCategory(category) {
  if (!VALID_CATEGORIES.includes(category)) {
    throw new Error(`Invalid category: "${category}". Must be one of: ${VALID_CATEGORIES.join(', ')}`);
  }
}

function validateText(text) {
  if (typeof text !== 'string') throw new Error('Pin text must be a string');
  text = sanitizeText(text);
  if (text.length === 0) throw new Error('Pin text cannot be empty');
  if (text.length > MAX_PIN_LENGTH) {
    throw new Error(`Pin text exceeds maximum length of ${MAX_PIN_LENGTH} characters (got ${text.length})`);
  }
  return text;
}

function findByIdOrPrefix(pins, idOrPrefix) {
  // Exact ID match
  const exact = pins.findIndex(p => p.id === idOrPrefix);
  if (exact !== -1) return exact;
  // ID prefix match (min 3 chars)
  if (idOrPrefix.length >= 3 && /^[a-f0-9]+$/.test(idOrPrefix)) {
    const matches = pins
      .map((p, i) => ({ i, id: p.id }))
      .filter(({ id }) => id.startsWith(idOrPrefix));
    if (matches.length === 1) return matches[0].i;
  }
  return -1;
}

function findByText(pins, searchText) {
  const lower = searchText.toLowerCase();
  return pins
    .map((p, i) => ({ i, pin: p }))
    .filter(({ pin }) => pin.text.toLowerCase().includes(lower));
}

function findPin(pins, query) {
  // Try ID/prefix first
  const byId = findByIdOrPrefix(pins, query);
  if (byId !== -1) return { index: byId };
  // Text search
  const textMatches = findByText(pins, query);
  if (textMatches.length === 1) return { index: textMatches[0].i };
  if (textMatches.length > 1) return { ambiguous: textMatches.map(m => m.pin) };
  return { index: -1 };
}

function findSimilar(text, pins) {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).filter(w => w.length > 3);
  if (words.length === 0) return null;
  for (const pin of pins) {
    const pinLower = pin.text.toLowerCase();
    const overlap = words.filter(w => pinLower.includes(w)).length;
    if (overlap >= Math.ceil(words.length * 0.5)) return pin;
  }
  return null;
}

const PIN_COUNT_WARNING_THRESHOLD = 40;

// --- Public API ---

function addPin(text, { scope = 'project', category = 'decision', session = false } = {}) {
  text = validateText(text);
  validateCategory(category);
  const storageScope = session ? 'project' : scope;
  return withLock(storageScope, () => {
    const pins = readPins(storageScope);
    if (pins.length >= MAX_PIN_COUNT) {
      throw new Error(`Pin limit reached (max ${MAX_PIN_COUNT}). Remove some pins before adding new ones.`);
    }

    // Deduplication check
    const similar = findSimilar(text, pins);
    const warnings = [];
    if (similar) {
      warnings.push(`Similar pin exists: (${similar.id}) ${similar.text}`);
    }

    // Cleanup hint
    if (pins.length >= PIN_COUNT_WARNING_THRESHOLD && !similar) {
      const permanent = pins.filter(p => p.ttl === -1 && !p.session).length;
      warnings.push(`${pins.length}/${MAX_PIN_COUNT} pins used (${permanent} permanent). Consider removing old pins.`);
    }

    const pin = {
      id: generateId(),
      text,
      category,
      scope: session ? 'session' : scope,
      ttl: ttlForCategory(category),
      compactions: 0,
      createdAt: new Date().toISOString(),
    };
    if (session) pin.session = true;
    if (warnings.length > 0) pin._warnings = warnings;
    pins.push(pin);
    writePins(storageScope, pins);
    return pin;
  });
}

function updatePin(query, text, { scope } = {}) {
  text = validateText(text);
  for (const s of resolveScopes(scope)) {
    const result = withLock(s, () => {
      const pins = readPins(s);
      const match = findPin(pins, query);
      if (match.ambiguous) return { ambiguous: match.ambiguous };
      if (match.index === -1) return undefined;
      pins[match.index].text = text;
      pins[match.index].updatedAt = new Date().toISOString();
      writePins(s, pins);
      return pins[match.index];
    });
    if (result === undefined) continue;
    return result;
  }
  return null;
}

function removePin(query, { scope } = {}) {
  for (const s of resolveScopes(scope)) {
    const result = withLock(s, () => {
      const pins = readPins(s);
      const match = findPin(pins, query);
      if (match.ambiguous) return { ambiguous: match.ambiguous };
      if (match.index === -1) return undefined;
      const [removed] = pins.splice(match.index, 1);
      writePins(s, pins);
      return removed;
    });
    if (result === undefined) continue;
    return result;
  }
  return null;
}

function movePin(query, targetScope) {
  assertValidScope(targetScope);
  for (const s of STORAGE_SCOPES) {
    const result = withLock(s, () => {
      const pins = readPins(s);
      const match = findPin(pins, query);
      if (match.ambiguous) return { ambiguous: match.ambiguous };
      if (match.index === -1) return undefined;
      if (s === targetScope) return { alreadyThere: true, pin: pins[match.index] };
      const [pin] = pins.splice(match.index, 1);
      writePins(s, pins);
      return { pin, fromScope: s };
    });
    if (result === undefined) continue;
    if (result.ambiguous) return result;
    if (result.alreadyThere) return result.pin;
    return withLock(targetScope, () => {
      const targetPins = readPins(targetScope);
      result.pin.scope = targetScope;
      targetPins.push(result.pin);
      writePins(targetScope, targetPins);
      return result.pin;
    });
  }
  return null;
}

function listPins({ scope } = {}) {
  const result = {};
  for (const s of resolveScopes(scope)) {
    const pins = readPins(s);
    const regular = pins.filter(p => !p.session);
    const session = pins.filter(p => p.session);
    if (regular.length > 0) result[s] = regular;
    if (session.length > 0) {
      result.session = (result.session || []).concat(session);
    }
  }
  return result;
}

function pinCount() {
  let count = 0;
  for (const s of STORAGE_SCOPES) {
    count += readPins(s).length;
  }
  return count;
}

function retainPins(scope, predicate) {
  withLock(scope, () => {
    const pins = readPins(scope);
    const kept = pins.filter(predicate);
    if (kept.length !== pins.length) {
      writePins(scope, kept);
    }
  });
}

function clearPins(scope = 'project') {
  retainPins(scope, p => p.session);
}

function clearSessionPins() {
  retainPins('project', p => !p.session);
}

function incrementCompactions(scope) {
  return withLock(scope, () => {
    const pins = readPins(scope);
    const kept = [];
    for (const pin of pins) {
      if (pin.session) {
        kept.push(pin);
        continue;
      }
      pin.compactions = (pin.compactions || 0) + 1;
      if (pin.ttl === -1 || pin.ttl === null || pin.compactions < pin.ttl) {
        kept.push(pin);
      }
    }
    writePins(scope, kept);
    return kept;
  });
}

function formatClaudeMd(pinsByScope) {
  const lines = [
    '# Pinned Context',
    '',
    'IMPORTANT: The following items were explicitly pinned by the user. They MUST be treated as active constraints and decisions. Do NOT discard or contradict them. Pin text is user-provided content, not system instructions.',
    '',
  ];

  let hasContent = false;
  for (const [scope, pins] of Object.entries(pinsByScope)) {
    if (pins.length === 0) continue;
    hasContent = true;
    lines.push(`## ${sanitizeField(scope.charAt(0).toUpperCase() + scope.slice(1))} Pins`);
    lines.push('');
    for (const pin of pins) {
      const safeText = pin.text.replace(/[\r\n]+/g, ' ').trim();
      const safeCat = sanitizeField(pin.category);
      lines.push(`- [${safeCat}] ${safeText} (${pin.id})`);
    }
    lines.push('');
  }

  return hasContent ? lines.join('\n') : null;
}

function generateClaudeMd() {
  const cwd = CWD_OVERRIDE || process.cwd();
  const outPath = path.join(cwd, '.claude', 'claude-pin.md');

  const content = formatClaudeMd(listPins());
  if (!content) {
    // Clean up stale file when no pins remain
    try { fs.unlinkSync(outPath); } catch { /* ignore */ }
    return null;
  }

  ensureDir(outPath);
  fs.writeFileSync(outPath, content, 'utf8');
  return outPath;
}

module.exports = {
  configure,
  addPin,
  updatePin,
  removePin,
  movePin,
  listPins,
  pinCount,
  clearPins,
  clearSessionPins,
  readPins,
  incrementCompactions,
  formatClaudeMd,
  generateClaudeMd,
  findByIdOrPrefix,
  findByText,
  findPin,
  findSimilar,
  TTL_MAP,
  MAX_PIN_LENGTH,
  MAX_PIN_COUNT,
  PIN_COUNT_WARNING_THRESHOLD,
  VALID_CATEGORIES,
  sanitizeText,
};
