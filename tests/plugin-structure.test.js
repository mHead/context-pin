const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// --- Helpers ---

function readJSON(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

function readRaw(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

const SKILLS_DIR = path.join(ROOT, 'skills');
const SKILL_DIRS = fs.readdirSync(SKILLS_DIR).filter(
  d => fs.statSync(path.join(SKILLS_DIR, d)).isDirectory()
);

function readSkillFrontmatter(skillDir) {
  const content = readRaw(`skills/${skillDir}/SKILL.md`);
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fm = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\S+):\s*(.+)$/);
    if (m) fm[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return fm;
}

function forEachSkill(fn) {
  for (const dir of SKILL_DIRS) {
    fn(dir, readSkillFrontmatter(dir), readRaw(`skills/${dir}/SKILL.md`));
  }
}

function forEachHook(hooksObj, fn) {
  for (const [event, groups] of Object.entries(hooksObj)) {
    for (const group of groups) {
      for (const hook of group.hooks) {
        fn(hook, event);
      }
    }
  }
}

// --- Constants ---

const VALID_HOOK_EVENTS = new Set([
  'SessionStart', 'InstructionsLoaded', 'UserPromptSubmit',
  'PreToolUse', 'PermissionRequest', 'PermissionDenied',
  'PostToolUse', 'PostToolUseFailure', 'Notification',
  'SubagentStart', 'SubagentStop', 'TaskCreated', 'TaskCompleted',
  'Stop', 'StopFailure', 'TeammateIdle', 'ConfigChange',
  'CwdChanged', 'FileChanged', 'WorktreeCreate', 'WorktreeRemove',
  'PreCompact', 'PostCompact', 'SessionEnd', 'Elicitation', 'ElicitationResult',
]);

const VALID_HOOK_TYPES = new Set(['command', 'http', 'prompt', 'agent']);
const VALID_EFFORT = new Set(['low', 'medium', 'high', 'max']);
const VALID_PLUGIN_FIELDS = new Set([
  'name', 'version', 'description', 'author', 'homepage', 'repository',
  'license', 'keywords', 'commands', 'agents', 'skills', 'hooks',
  'mcpServers', 'outputStyles', 'lspServers', 'userConfig', 'channels',
]);

// ==============================
// plugin.json
// ==============================

describe('plugin.json schema', () => {
  const plugin = readJSON('.claude-plugin/plugin.json');

  it('is located at .claude-plugin/plugin.json', () => {
    assert.ok(exists('.claude-plugin/plugin.json'));
  });

  it('has required name field as kebab-case string (max 64)', () => {
    assert.equal(typeof plugin.name, 'string');
    assert.match(plugin.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(plugin.name.length <= 64);
  });

  it('version is semver format if present', () => {
    if (plugin.version) assert.match(plugin.version, /^\d+\.\d+\.\d+/);
  });

  it('description is a string if present', () => {
    if (plugin.description) assert.equal(typeof plugin.description, 'string');
  });

  it('author is an object with valid fields if present', () => {
    if (plugin.author) {
      assert.equal(typeof plugin.author, 'object');
      assert.ok(!Array.isArray(plugin.author));
      for (const key of Object.keys(plugin.author)) {
        assert.ok(['name', 'email', 'url'].includes(key), `unexpected author field: ${key}`);
      }
    }
  });

  it('keywords is an array of strings if present', () => {
    if (plugin.keywords) {
      assert.ok(Array.isArray(plugin.keywords));
      for (const kw of plugin.keywords) assert.equal(typeof kw, 'string');
    }
  });

  it('contains only valid top-level fields', () => {
    for (const key of Object.keys(plugin)) {
      assert.ok(VALID_PLUGIN_FIELDS.has(key), `invalid field: "${key}"`);
    }
  });

  it('does not contain claudeMd field (not in spec)', () => {
    assert.equal(plugin.claudeMd, undefined);
  });

  it('.claude-plugin/ contains only plugin.json', () => {
    assert.deepEqual(fs.readdirSync(path.join(ROOT, '.claude-plugin')).sort(), ['marketplace.json', 'plugin.json']);
  });
});

// ==============================
// hooks.json
// ==============================

describe('hooks.json schema', () => {
  const hooksFile = readJSON('hooks/hooks.json');
  const { hooks } = hooksFile;

  it('is located at hooks/hooks.json', () => {
    assert.ok(exists('hooks/hooks.json'));
  });

  it('has root "hooks" object (not array)', () => {
    assert.equal(typeof hooks, 'object');
    assert.ok(!Array.isArray(hooks));
  });

  it('only uses valid event names', () => {
    for (const event of Object.keys(hooks)) {
      assert.ok(VALID_HOOK_EVENTS.has(event), `invalid event: "${event}"`);
    }
  });

  it('each event maps to array of matcher groups with hooks arrays', () => {
    for (const [event, groups] of Object.entries(hooks)) {
      assert.ok(Array.isArray(groups), `${event}: not an array`);
      for (const group of groups) {
        assert.ok(Array.isArray(group.hooks), `${event}: matcher group missing hooks array`);
      }
    }
  });

  it('each hook has valid type and required fields', () => {
    forEachHook(hooks, (hook, event) => {
      assert.ok(VALID_HOOK_TYPES.has(hook.type), `${event}: invalid type "${hook.type}"`);
      if (hook.type === 'command') {
        assert.equal(typeof hook.command, 'string', `${event}: missing command`);
      }
      if (hook.timeout !== undefined) {
        assert.equal(typeof hook.timeout, 'number');
        assert.ok(hook.timeout > 0);
      }
    });
  });

  it('uses ${CLAUDE_PLUGIN_ROOT} not $PLUGIN_DIR', () => {
    const raw = readRaw('hooks/hooks.json');
    assert.ok(!raw.includes('PLUGIN_DIR'));
  });

  it('command hooks reference scripts that exist', () => {
    forEachHook(hooks, (hook) => {
      if (hook.type !== 'command') return;
      const match = hook.command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)/);
      if (match) assert.ok(exists(match[1]), `missing: ${match[1]}`);
    });
  });
});

// ==============================
// Skills
// ==============================

describe('skills structure', () => {
  it('skills/ directory exists at plugin root', () => {
    assert.ok(exists('skills'));
  });

  it('each skill has SKILL.md with valid frontmatter', () => {
    forEachSkill((dir, fm) => {
      assert.ok(fm, `${dir}/SKILL.md missing frontmatter`);
    });
  });

  it('skill names are kebab-case, max 64 chars, matching directory', () => {
    forEachSkill((dir, fm) => {
      if (!fm.name) return;
      assert.match(fm.name, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${dir}: not kebab-case`);
      assert.ok(fm.name.length <= 64, `${dir}: name too long`);
      assert.equal(fm.name, dir, `${dir}: doesn't match directory`);
    });
  });

  it('skill descriptions are max 250 characters', () => {
    forEachSkill((dir, fm) => {
      if (fm.description) {
        assert.ok(fm.description.length <= 250, `${dir}: too long (${fm.description.length})`);
      }
    });
  });

  it('effort, shell, context values are valid if present', () => {
    forEachSkill((dir, fm) => {
      if (fm.effort) assert.ok(VALID_EFFORT.has(fm.effort), `${dir}: invalid effort`);
      if (fm.shell) assert.ok(['bash', 'powershell'].includes(fm.shell), `${dir}: invalid shell`);
      if (fm.context) assert.equal(fm.context, 'fork', `${dir}: invalid context`);
    });
  });

  it('SKILL.md references ${CLAUDE_PLUGIN_ROOT} not $PLUGIN_DIR', () => {
    forEachSkill((dir, _fm, content) => {
      assert.ok(!content.includes('PLUGIN_DIR'), `${dir}: uses PLUGIN_DIR`);
    });
  });

  it('skill names match plugin namespace (pin:*)', () => {
    const plugin = readJSON('.claude-plugin/plugin.json');
    const content = readRaw('skills/add/SKILL.md');
    assert.ok(content.includes(`/${plugin.name}:`));
  });
});

// ==============================
// Directory structure
// ==============================

describe('directory structure', () => {
  it('.claude-plugin/ contains only plugin.json', () => {
    assert.deepEqual(fs.readdirSync(path.join(ROOT, '.claude-plugin')).sort(), ['marketplace.json', 'plugin.json']);
  });

  it('required directories exist at plugin root', () => {
    for (const dir of ['hooks', 'skills', 'scripts']) {
      assert.ok(exists(dir), `missing: ${dir}/`);
    }
  });

  it('all hook scripts and core files exist', () => {
    for (const file of ['scripts/pre-compact.js', 'scripts/session-start.js', 'scripts/lib/pin-store.js', 'scripts/cli.js']) {
      assert.ok(exists(file), `missing: ${file}`);
    }
  });

  it('expected skill set is complete', () => {
    assert.deepEqual(new Set(SKILL_DIRS), new Set(['add', 'list', 'remove', 'move', 'clear']));
  });

  it('no paths traverse outside plugin root', () => {
    assert.ok(!readRaw('hooks/hooks.json').includes('../'));
    assert.ok(!readRaw('.claude-plugin/plugin.json').includes('../'));
  });

  it('.gitignore excludes pin data from version control', () => {
    assert.ok(exists('.gitignore'));
    const gitignore = readRaw('.gitignore');
    assert.ok(gitignore.includes('.claude/claude-pin/'), '.gitignore must exclude pin data');
    assert.ok(gitignore.includes('.claude/claude-pin.md'), '.gitignore must exclude generated md');
  });
});
