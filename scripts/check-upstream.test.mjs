import test from 'node:test';
import assert from 'node:assert/strict';
import { checkUpstream } from './check-upstream.mjs';

const baseSha = 'a'.repeat(40);
const nextSha = 'b'.repeat(40);
const baseline = {
  repository: 'https://github.com/cursor/plugins',
  commit: baseSha,
  version: '1.2.3',
  sourceDirectory: 'harness/pstack/claude-code',
  originalSkillsDirectory: 'pstack/skills',
};
const tree = [
  { path: 'pstack', type: 'tree', mode: '040000', sha: '1'.repeat(40) },
  { path: 'pstack/skills', type: 'tree', mode: '040000', sha: '2'.repeat(40) },
  { path: 'pstack/skills/example.md', type: 'blob', mode: '100644', sha: '3'.repeat(40) },
  { path: 'harness', type: 'tree', mode: '040000', sha: '4'.repeat(40) },
  { path: 'harness/pstack', type: 'tree', mode: '040000', sha: '5'.repeat(40) },
  { path: 'harness/pstack/claude-code', type: 'tree', mode: '040000', sha: '6'.repeat(40) },
  { path: 'harness/pstack/claude-code/plugin.json', type: 'blob', mode: '100644', sha: '7'.repeat(40) },
  { path: 'other/file', type: 'blob', mode: '100644', sha: '8'.repeat(40) },
];

function fixture({ sha = nextSha, candidateTree = tree, manifest = { name: 'pstack', version: '1.2.3' }, overrides = {} } = {}) {
  const requests = [];
  const responses = {
    '/repos/cursor/plugins/git/ref/heads/main': { object: { type: 'commit', sha } },
    [`/repos/cursor/plugins/contents/pstack/plugin.json?ref=${sha}`]: manifest,
    [`/repos/cursor/plugins/git/trees/${baseSha}?recursive=1`]: { truncated: false, tree },
    [`/repos/cursor/plugins/git/trees/${sha}?recursive=1`]: { truncated: false, tree: candidateTree },
    ...overrides,
  };
  return {
    requests,
    fetchImpl: async (url) => {
      requests.push(url);
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://api.github.com');
      const key = parsed.pathname + parsed.search;
      assert.ok(Object.hasOwn(responses, key), `Unexpected request: ${url}`);
      const value = responses[key];
      if (value instanceof Error) throw value;
      if (value instanceof Response) return value;
      return Response.json(value);
    },
  };
}

function check(options = {}, input = baseline) {
  const api = fixture(options);
  return { api, result: checkUpstream(input, { fetchImpl: api.fetchImpl }) };
}

function unknown(result) {
  assert.equal(result.status, 'unknown');
  assert.deepEqual(result.changes, []);
  assert.equal(typeof result.error, 'string');
}

test('same commit is current', async () => {
  const { result } = check({ sha: baseSha });
  const actual = await result;
  assert.equal(actual.status, 'current');
  assert.deepEqual(actual.current, { version: '1.2.3', commit: baseSha });
  assert.deepEqual(actual.changes, []);
});

test('unrelated monorepo changes remain current and candidate requests use resolved SHA', async () => {
  const candidateTree = tree.map((entry) => entry.path === 'other/file' ? { ...entry, sha: '9'.repeat(40) } : entry);
  const { api, result } = check({ candidateTree });
  const actual = await result;
  assert.equal(actual.status, 'current');
  assert.deepEqual(actual.changes, []);
  assert.ok(api.requests.some((url) => url.includes(`/contents/pstack/plugin.json?ref=${nextSha}`)));
  assert.ok(api.requests.some((url) => url.includes(`/git/trees/${nextSha}?recursive=1`)));
});

test('content change without a version bump is an update', async () => {
  const candidateTree = tree.map((entry) => entry.path === 'pstack/skills/example.md' ? { ...entry, sha: '9'.repeat(40) } : entry);
  const { result } = check({ candidateTree });
  const actual = await result;
  assert.equal(actual.status, 'update-available');
  assert.deepEqual(actual.candidate, { version: '1.2.3', commit: nextSha });
  assert.deepEqual(actual.changes, [{ path: 'pstack/skills/example.md', change: 'modified' }]);
  assert.equal(actual.compareUrl, `https://github.com/cursor/plugins/compare/${baseSha}...${nextSha}`);
});

test('version change alone is an update', async () => {
  const { result } = check({ manifest: { name: 'pstack', version: '1.2.4' } });
  const actual = await result;
  assert.equal(actual.status, 'update-available');
  assert.deepEqual(actual.candidate, { version: '1.2.4', commit: nextSha });
  assert.deepEqual(actual.changes, []);
});

test('added, removed, mode and type changes are reported', async () => {
  const candidateTree = tree
    .filter((entry) => entry.path !== 'pstack/skills/example.md')
    .map((entry) => entry.path === 'harness/pstack/claude-code/plugin.json'
      ? { ...entry, mode: '100755' }
      : entry);
  candidateTree.push(
    { path: 'pstack/skills/new.md', type: 'blob', mode: '100644', sha: '9'.repeat(40) },
    { path: 'pstack/submodule', type: 'commit', mode: '160000', sha: 'c'.repeat(40) },
  );
  const { result } = check({ candidateTree });
  const actual = await result;
  assert.equal(actual.status, 'update-available');
  assert.deepEqual(new Map(actual.changes.map(({ path, change }) => [path, change])), new Map([
    ['harness/pstack/claude-code/plugin.json', 'modified'],
    ['pstack/skills/example.md', 'removed'],
    ['pstack/skills/new.md', 'added'],
    ['pstack/submodule', 'added'],
  ]));
});

test('type changes at an existing path are meaningful', async () => {
  const candidateTree = tree.map((entry) => entry.path === 'pstack/skills/example.md'
    ? { ...entry, type: 'commit', mode: '160000' }
    : entry);
  const { result } = check({ candidateTree });
  const actual = await result;
  assert.equal(actual.status, 'update-available');
  assert.deepEqual(actual.changes, [{ path: 'pstack/skills/example.md', change: 'modified' }]);
});

test('invalid baseline metadata is unknown without network access', async () => {
  for (const input of [null, { ...baseline, commit: 'main' }, { ...baseline, repository: 'https://example.com/repo' }, { ...baseline, version: '' }]) {
    const { api, result } = check({}, input);
    unknown(await result);
    assert.deepEqual(api.requests, []);
  }
});

test('malformed API responses, truncation, network errors and rate limits are unknown', async () => {
  const ref = '/repos/cursor/plugins/git/ref/heads/main';
  const manifest = `/repos/cursor/plugins/contents/pstack/plugin.json?ref=${nextSha}`;
  const baseTree = `/repos/cursor/plugins/git/trees/${baseSha}?recursive=1`;
  const nextTree = `/repos/cursor/plugins/git/trees/${nextSha}?recursive=1`;
  const cases = [
    { [ref]: { object: { type: 'tag', sha: nextSha } } },
    { [ref]: { object: { type: 'commit', sha: 'main' } } },
    { [manifest]: { name: 'other', version: '1.2.3' } },
    { [manifest]: { name: 'pstack', version: '' } },
    { [manifest]: new Response('not json', { status: 200 }) },
    { [baseTree]: { truncated: true, tree } },
    { [nextTree]: { truncated: false, tree: tree.filter((entry) => entry.path !== 'pstack') } },
    { [nextTree]: { truncated: false, tree: tree.filter((entry) => entry.path !== 'harness/pstack/claude-code') } },
    { [nextTree]: { truncated: false, tree: [...tree, { path: 'pstack/bad', type: 'blob' }] } },
    { [ref]: new Error('offline') },
    { [ref]: Response.json({ message: 'API rate limit exceeded' }, { status: 403 }) },
  ];
  for (const overrides of cases) {
    const { result } = check({ overrides });
    unknown(await result);
  }
});

