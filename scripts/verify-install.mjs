import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const spec = process.argv[2];
if (process.argv.length > 3 || spec?.startsWith('-')) {
  console.error('Usage: node scripts/verify-install.mjs [git-install-spec]');
  process.exit(1);
}

const temp = mkdtempSync(join(tmpdir(), 'pstack-verify-'));
try {
  const home = join(temp, 'home');
  const agentDir = join(temp, 'agent');
  const work = join(temp, 'work');
  const copy = join(temp, 'relocated-plugin');
  const env = {
    PATH: process.env.PATH,
    HOME: home,
    PI_CODING_AGENT_DIR: agentDir,
    XDG_CONFIG_HOME: join(temp, 'xdg-config'),
    XDG_DATA_HOME: join(temp, 'xdg-data'),
    XDG_CACHE_HOME: join(temp, 'xdg-cache'),
    XDG_STATE_HOME: join(temp, 'xdg-state'),
    TMPDIR: join(temp, 'tmp'),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    ...(process.env.SSH_AUTH_SOCK ? { SSH_AUTH_SOCK: process.env.SSH_AUTH_SOCK } : {}),
  };
  for (const dir of [home, agentDir, work, env.XDG_CONFIG_HOME, env.XDG_DATA_HOME, env.XDG_CACHE_HOME, env.XDG_STATE_HOME, env.TMPDIR]) mkdirSync(dir, { recursive: true });
  cpSync(source, copy, { recursive: true, filter: path => path !== join(source, '.git') && path !== join(source, 'node_modules') });
  writeFileSync(join(agentDir, 'models.yml'), `providers:\n  pstack-verification:\n    baseUrl: http://127.0.0.1:9/v1\n    apiKey: unused-offline-verification\n    api: openai-completions\n    models:\n      - id: offline\n        name: Offline plugin verification\n        reasoning: false\n        input: [text]\n        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }\n        contextWindow: 8192\n        maxTokens: 256\n`);
  const sentinel = join(agentDir, 'skills', 'verification-sentinel');
  mkdirSync(sentinel, { recursive: true });
  writeFileSync(join(sentinel, 'SKILL.md'), '---\nname: verification-sentinel\ndescription: Unrelated installation sentinel.\n---\n\nSentinel.\n');

  function check(condition, message) {
    if (!condition) throw new Error(message);
  }
  function omp(args, input) {
    // Git installation output may contain credentials supplied in the spec or remote URL.
    const gitInstall = args[0] === 'plugin' && args[1] === 'install';
    const result = spawnSync('omp', args, { cwd: work, env, input, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024, ...(gitInstall ? { stdio: 'ignore' } : {}) });
    const label = gitInstall ? 'plugin install' : args.join(' ');
    if (result.error || result.status !== 0) {
      const details = gitInstall ? '' : `\n${result.stderr || result.stdout || ''}`;
      throw new Error(`omp ${label} failed (${result.error?.message || `exit ${result.status}`})${details}`);
    }
    return result.stdout;
  }
  function names(root) {
    const dirs = readdirSync(join(root, 'skills'), { withFileTypes: true }).filter(entry => entry.isDirectory());
    const entries = dirs.map(entry => {
      const file = join(root, 'skills', entry.name, 'SKILL.md');
      check(existsSync(file), `Missing ${file}`);
      const text = readFileSync(file, 'utf8');
      const match = text.match(/^---\r?\n[\s\S]*?^name:\s*["']?(pstack-[\w-]+)["']?\s*$/m);
      check(match, `Missing pstack name in ${file}`);
      return { name: match[1], file };
    });
    const metadata = JSON.parse(readFileSync(join(root, 'UPSTREAM.json'), 'utf8'));
    const localSkills = metadata.localSkills ?? [];
    const expectedCount = metadata.skillCount + localSkills.length;
    check(entries.length === expectedCount && new Set(entries.map(entry => entry.name)).size === expectedCount, `Expected ${expectedCount} unique pstack skills, found ${entries.length} directories and ${new Set(entries.map(entry => entry.name)).size} names`);
    for (const name of localSkills) check(entries.some(entry => entry.name === `pstack-${name}`), `Missing local skill pstack-${name}`);
    return entries;
  }
  function markdownFiles(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? markdownFiles(path) : entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
    });
  }
  function checkMarkdown(root, skills) {
    for (const entry of skills) {
      const text = readFileSync(entry.file, 'utf8');
      const adapter = text.match(/\]\(([^)]+docs\/harness\/omp\.md)\)/);
      check(adapter && !isAbsolute(adapter[1]) && realpathSync(resolve(dirname(entry.file), adapter[1])) === realpathSync(join(root, 'docs/harness/omp.md')), `Relocated omp adapter does not resolve from ${entry.file}`);
    }
    for (const dir of ['skills', 'docs', 'agents']) {
      for (const file of markdownFiles(join(root, dir))) {
        const text = readFileSync(file, 'utf8');
        for (const match of text.matchAll(/\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^)]*["'])?\s*\)/g)) {
          const target = match[1].replace(/^<|>$/g, '').split('#')[0].split('?')[0];
          if (!target || target === 'url' || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target) || /[{}$*<>]/.test(target)) continue;
          const decoded = decodeURIComponent(target);
          check(!isAbsolute(decoded), `Machine-local dependency ${target} referenced by ${file}`);
          const path = resolve(dirname(file), decoded);
          check(existsSync(path), `Missing local dependency ${target} referenced by ${file}`);
        }
      }
    }
  }
  function rpc() {
    const types = ['get_available_commands', 'get_state'];
    const input = types.map(type => JSON.stringify({ id: type, type })).join('\n') + '\n';
    const output = omp(['--model', 'pstack-verification/offline', '--mode', 'rpc', '--no-session', '--no-title'], input);
    const frames = output.trim().split('\n').map(line => JSON.parse(line));
    const responses = types.map(type => frames.find(frame => frame.type === 'response' && frame.id === type));
    for (let i = 0; i < types.length; i++) check(responses[i]?.success, `RPC ${types[i]} failed: ${responses[i]?.error || 'missing response'}`);
    const commands = responses[0].data.commands;
    const task = responses[1].data.dumpTools?.find(tool => tool.name === 'task');
    check(Array.isArray(commands) && typeof task?.description === 'string', 'RPC command list or task descriptor missing');
    return { commands, description: task.description };
  }
  const expectedAgents = ['pstack-poteto-agent', 'pstack-comment-sicko'];
  const expected = names(copy);
  function state(label, present, skills) {
    const { commands, description } = rpc();
    for (const { name } of skills) {
      const found = commands.some(command => command.name === `skill:${name}` && command.source === 'skill');
      check(found === present, `${label}: skill:${name} is ${found ? 'visible' : 'missing'} before cutover`);
    }
    for (const agent of expectedAgents) check(description.includes(agent) === present, `${label}: ${agent} is ${description.includes(agent) ? 'visible' : 'missing'} before cutover`);
    check(commands.some(command => command.name === 'skill:verification-sentinel' && command.source === 'skill'), `${label}: unrelated sentinel skill missing before cutover`);
  }
  function install() {
    if (spec) omp(['plugin', 'install', spec]);
    else omp(['plugin', 'link', copy]);
  }

  install();
  const installed = join(home, '.omp', 'plugins', 'node_modules', 'pstack-omp');
  check(existsSync(installed), 'Installed plugin directory not found');
  const skills = names(installed);
  if (!spec) check(expected.map(entry => entry.name).sort().join('\n') === skills.map(entry => entry.name).sort().join('\n'), 'Installed skill names differ from local export');
  for (const agent of expectedAgents) {
    const files = readdirSync(join(installed, 'agents')).filter(file => file.endsWith('.md'));
    check(files.length === 2 && files.some(file => new RegExp(`^name:\\s*${agent}\\s*$`, 'm').test(readFileSync(join(installed, 'agents', file), 'utf8'))), `Installed agent ${agent} missing or unexpected agent count`);
  }
  checkMarkdown(installed, skills);
  for (const { name, file } of skills) {
    const output = omp(['read', `skill://${name}`]);
    const match = output.match(/\[Skill file: ([^\]]+)\]/);
    check(match && realpathSync(match[1]) === realpathSync(file), `skill://${name} did not resolve to installed copy`);
    if (!spec) check(realpathSync(file).startsWith(realpathSync(copy) + '/'), `skill://${name} did not resolve to relocated copy`);
  }
  state('installed', true, skills);
  omp(['plugin', 'disable', 'pstack-omp']);
  state('disabled', false, skills);
  omp(['plugin', 'enable', 'pstack-omp']);
  state('enabled', true, skills);
  omp(['plugin', 'uninstall', 'pstack-omp']);
  state('uninstalled', false, skills);
  install();
  state('reinstalled', true, skills);
  console.log(`Verified ${skills.length} skills, 2 agents, Markdown dependencies, relocation, and plugin lifecycle.`);
} catch (error) {
  console.error(`Installation verification failed before cutover: ${error.message}`);
  process.exitCode = 1;
} finally {
  rmSync(temp, { recursive: true, force: true });
}
