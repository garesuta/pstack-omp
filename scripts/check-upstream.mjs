import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const shaPattern = /^[a-f0-9]{40}$/;
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const validPath = path => typeof path === 'string' && /^[\w.-]+(?:\/[\w.-]+)*$/.test(path) && path.split('/').every(part => part !== '.' && part !== '..');

export async function checkUpstream(baseline, { fetchImpl = globalThis.fetch, token } = {}) {
  const report = {
    status: 'unknown',
    current: { version: baseline?.version ?? null, commit: baseline?.commit ?? null },
    candidate: null,
    changes: [],
    compareUrl: null,
  };
  try {
    const repository = typeof baseline?.repository === 'string' && baseline.repository.match(/^https:\/\/github\.com\/([\w-]+\/[\w.-]+)\/?$/);
    if (!repository || !shaPattern.test(baseline.commit) || !versionPattern.test(baseline.version)
      || !validPath(baseline.sourceDirectory) || !validPath(baseline.originalSkillsDirectory)
      || posix.basename(baseline.originalSkillsDirectory) !== 'skills') {
      throw new Error('Invalid UPSTREAM.json repository, commit, version, or source paths.');
    }
    const originalRoot = posix.dirname(baseline.originalSkillsDirectory);
    if (originalRoot === '.') throw new Error('UPSTREAM.json must identify the upstream plugin directory.');
    const roots = [...new Set([originalRoot, baseline.sourceDirectory])];
    const api = `https://api.github.com/repos/${repository[1]}`;
    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'pstack-omp-upstream-check',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    async function get(path, raw = false) {
      let response;
      try {
        response = await fetchImpl(`${api}${path}`, {
          headers: raw ? { ...headers, Accept: 'application/vnd.github.raw+json' } : headers,
          signal: AbortSignal.timeout(15000),
          redirect: 'error',
        });
      } catch {
        throw new Error('GitHub request failed or timed out; check network access.');
      }
      if (!response.ok) {
        const hint = response.status === 403 || response.status === 429 ? ' Check GitHub rate limits and token permissions.' : '';
        throw new Error(`GitHub returned HTTP ${response.status}.${hint}`);
      }
      try {
        return await response.json();
      } catch {
        throw new Error('GitHub returned invalid or incomplete JSON.');
      }
    }
    const ref = await get('/git/ref/heads/main');
    const commit = ref?.object?.sha;
    if (ref?.object?.type !== 'commit' || !shaPattern.test(commit)) throw new Error('GitHub returned an invalid main branch revision.');
    const manifest = await get(`/contents/${originalRoot}/plugin.json?ref=${commit}`, true);
    if (manifest?.name !== 'pstack' || typeof manifest.version !== 'string' || !versionPattern.test(manifest.version)) {
      throw new Error('Upstream plugin manifest has an invalid name or version.');
    }
    report.candidate = { version: manifest.version, commit };
    report.compareUrl = `${baseline.repository.replace(/\/$/, '')}/compare/${baseline.commit}...${commit}`;
    async function filesAt(revision) {
      const payload = await get(`/git/trees/${revision}?recursive=1`);
      if (payload?.truncated !== false || !Array.isArray(payload.tree)) throw new Error('GitHub returned a truncated or invalid source tree.');
      const entries = new Map();
      for (const entry of payload.tree) {
        if (typeof entry?.path !== 'string' || !shaPattern.test(entry.sha)
          || !['tree', 'blob', 'commit'].includes(entry.type) || !/^\d{6}$/.test(entry.mode) || entries.has(entry.path)) {
          throw new Error('GitHub returned an invalid source tree entry.');
        }
        entries.set(entry.path, entry);
      }
      for (const root of roots) {
        if (entries.get(root)?.type !== 'tree') throw new Error(`Upstream source directory is missing or changed: ${root}`);
      }
      return new Map([...entries].filter(([path, entry]) => entry.type !== 'tree' && roots.some(root => path.startsWith(`${root}/`))));
    }
    const before = await filesAt(baseline.commit);
    const after = commit === baseline.commit ? before : await filesAt(commit);
    const changes = [];
    for (const path of [...new Set([...before.keys(), ...after.keys()])].sort()) {
      const oldFile = before.get(path);
      const newFile = after.get(path);
      if (!oldFile) changes.push({ path, change: 'added' });
      else if (!newFile) changes.push({ path, change: 'removed' });
      else if (oldFile.sha !== newFile.sha || oldFile.mode !== newFile.mode || oldFile.type !== newFile.type) changes.push({ path, change: 'modified' });
    }
    report.changes = changes;
    report.status = changes.length || baseline.version !== manifest.version ? 'update-available' : 'current';
  } catch (error) {
    report.changes = [];
    report.error = error.message;
  }
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: node scripts/check-upstream.mjs [--json]\nRead-only check against upstream main. Exit: 0 current/update available, 1 unknown, 2 usage error.');
    return;
  }
  if (args.length > 1 || (args.length === 1 && args[0] !== '--json')) {
    console.error('Usage: node scripts/check-upstream.mjs [--json]');
    process.exitCode = 2;
    return;
  }
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  let report;
  let portVersion = null;
  try {
    portVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
    const baseline = JSON.parse(readFileSync(join(root, 'UPSTREAM.json'), 'utf8'));
    report = await checkUpstream(baseline, { token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN });
  } catch {
    report = { status: 'unknown', current: null, candidate: null, changes: [], compareUrl: null, error: 'Cannot read package.json or UPSTREAM.json from the installed package.' };
  }
  report = { portVersion, ...report };
  if (args[0] === '--json') console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`pstack-omp ${portVersion ?? 'unknown'}: ${report.status}`);
    if (report.current) console.log(`Bundled upstream: ${report.current.version} (${report.current.commit})`);
    if (report.candidate) console.log(`Upstream main: ${report.candidate.version} (${report.candidate.commit})`);
    for (const change of report.changes) console.log(`${change.change}: ${change.path}`);
    if (report.compareUrl) console.log(`Compare: ${report.compareUrl}`);
    if (report.error) console.log(`Check failed: ${report.error}`);
    if (report.status === 'update-available') console.log('Upstream changes require omp review, not direct installation. Keep current, inspect the diff, or approve migration preparation.');
  }
  process.exitCode = report.status === 'unknown' ? 1 : 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
