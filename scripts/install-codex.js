#!/usr/bin/env node

/**
 * Installs the context-pin plugin for OpenAI Codex CLI.
 *
 * What it does:
 * 1. Copies the plugin to ~/.agents/plugins/context-pin/
 * 2. Mirrors the plugin to ~/.codex/plugins/context-pin/
 * 3. Creates/updates marketplace files:
 *    - ~/.agents/plugins/marketplace.json
 *    - ~/.codex/plugins/marketplace.json
 *
 * Usage: node scripts/install-codex.js
 */

const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME || process.env.USERPROFILE;
if (!HOME) {
  console.error('Installation failed: HOME/USERPROFILE is not set');
  process.exit(1);
}

const PLUGIN_NAME = 'context-pin';
const LEGACY_PLUGIN_NAMES = new Set(['pin', 'context-pin']);
const PLUGIN_DIR_NAME = 'context-pin';
const MARKETPLACE_NAME = 'context-pin-local';
const REPO_ROOT = path.resolve(__dirname, '..');

const AGENTS_PLUGINS_DIR = path.join(HOME, '.agents', 'plugins');
const AGENTS_PLUGIN_DIR = path.join(AGENTS_PLUGINS_DIR, PLUGIN_DIR_NAME);
const AGENTS_MARKETPLACE_PATH = path.join(AGENTS_PLUGINS_DIR, 'marketplace.json');

const CODEX_PLUGINS_DIR = path.join(HOME, '.codex', 'plugins');
const CODEX_PLUGIN_DIR = path.join(CODEX_PLUGINS_DIR, PLUGIN_DIR_NAME);
const CODEX_MARKETPLACE_PATH = path.join(CODEX_PLUGINS_DIR, 'marketplace.json');

// Canonical marketplace path for local plugins in Codex docs.
const MARKETPLACE_PLUGIN_PATH = './.codex/plugins/context-pin';

const COPY_ITEMS = [
  '.codex-plugin',
  'hooks',
  'scripts',
  'skills',
  'assets',
  'AGENTS.md',
  'package.json',
  'LICENSE',
];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function copyPluginTo(targetDir) {
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  for (const item of COPY_ITEMS) {
    const src = path.join(REPO_ROOT, item);
    const dest = path.join(targetDir, item);
    if (fs.existsSync(src)) {
      copyRecursive(src, dest);
    }
  }
}

function loadMarketplace(filePath) {
  if (!fs.existsSync(filePath)) {
    return { name: MARKETPLACE_NAME, plugins: [] };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') {
      return { name: MARKETPLACE_NAME, plugins: [] };
    }
    if (!Array.isArray(parsed.plugins)) {
      parsed.plugins = [];
    }
    if (!parsed.name) {
      parsed.name = MARKETPLACE_NAME;
    }
    return parsed;
  } catch {
    return { name: MARKETPLACE_NAME, plugins: [] };
  }
}

function upsertPluginEntry(marketplace) {
  marketplace.plugins = (marketplace.plugins || []).filter(
    (p) => p && !LEGACY_PLUGIN_NAMES.has(p.name)
  );

  marketplace.plugins.push({
    name: PLUGIN_NAME,
    source: {
      source: 'local',
      path: MARKETPLACE_PLUGIN_PATH,
    },
    policy: {
      installation: 'INSTALLED_BY_DEFAULT',
      authentication: 'ON_INSTALL',
    },
    category: 'Productivity',
  });
}

function writeMarketplace(filePath) {
  const marketplace = loadMarketplace(filePath);
  upsertPluginEntry(marketplace);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(marketplace, null, 2), 'utf8');
  console.log(`Updated marketplace at ${filePath}`);
}

function installPlugin() {
  fs.mkdirSync(AGENTS_PLUGINS_DIR, { recursive: true });
  fs.mkdirSync(CODEX_PLUGINS_DIR, { recursive: true });

  copyPluginTo(AGENTS_PLUGIN_DIR);
  console.log(`Copied plugin to ${AGENTS_PLUGIN_DIR}`);

  copyPluginTo(CODEX_PLUGIN_DIR);
  console.log(`Mirrored plugin to ${CODEX_PLUGIN_DIR}`);

  writeMarketplace(AGENTS_MARKETPLACE_PATH);
  writeMarketplace(CODEX_MARKETPLACE_PATH);

  console.log('\nDone. To activate:');
  console.log('  1. Restart Codex');
  console.log('  2. Type /plugins');
  console.log('  3. Verify "context-pin" is available');
}

try {
  installPlugin();
} catch (err) {
  console.error(`Installation failed: ${err.message}`);
  process.exit(1);
}
