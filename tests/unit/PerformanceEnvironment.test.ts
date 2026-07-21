import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  captureStableRepositoryState,
  computeWorkspaceTreeSha256,
  DEFAULT_PERFORMANCE_HASH_PATHS,
} from '../performance/PerformanceEnvironment';

describe('performance environment workspace hash', () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
  });

  function workspace(): string {
    const root = mkdtempSync(join(tmpdir(), 'huchu-perf-env-'));
    roots.push(root);
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'public', 'assets'), { recursive: true });
    writeFileSync(join(root, 'src', 'z.ts'), 'z');
    writeFileSync(join(root, 'src', 'a.ts'), 'a');
    writeFileSync(join(root, 'public', 'assets', 'sprite.bin'), Buffer.from([0, 1, 2, 3]));
    writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n');
    return root;
  }

  it('hashes sorted length-framed relative paths and bytes deterministically', () => {
    const root = workspace();
    const forward = computeWorkspaceTreeSha256(root, ['src', 'public/assets', 'package.json']);
    const reordered = computeWorkspaceTreeSha256(root, ['package.json', 'public/assets', 'src']);

    expect(forward).toMatch(/^[a-f0-9]{64}$/);
    expect(reordered).toBe(forward);

    writeFileSync(join(root, 'src', 'a.ts'), 'A');
    expect(computeWorkspaceTreeSha256(root, ['src', 'public/assets', 'package.json'])).not.toBe(forward);
  });

  it('uses framing that distinguishes ambiguous path and byte concatenations', () => {
    const left = workspace();
    const right = workspace();
    rmSync(join(left, 'src'), { recursive: true });
    rmSync(join(right, 'src'), { recursive: true });
    mkdirSync(join(left, 'src'), { recursive: true });
    mkdirSync(join(right, 'src'), { recursive: true });
    writeFileSync(join(left, 'src', 'ab'), 'c');
    writeFileSync(join(right, 'src', 'a'), 'bc');

    expect(computeWorkspaceTreeSha256(left, ['src'])).not.toBe(
      computeWorkspaceTreeSha256(right, ['src']),
    );
  });

  it('covers runtime assets and every performance/build entrypoint named by the release gate', () => {
    expect(DEFAULT_PERFORMANCE_HASH_PATHS).toEqual(expect.arrayContaining([
      'src',
      'tests/e2e/helpers.ts',
      'tests/performance',
      'public/assets',
      'index.html',
      'package.json',
      'package-lock.json',
      'playwright.config.ts',
      'vite.config.ts',
      'tsconfig.json',
    ]));
  });

  it('retries a torn repository observation and returns only matching head, status, and hash reads', () => {
    const heads = ['head-a', 'head-a', 'head-a', 'head-a'];
    const statuses = [' M src/a.ts', ' M src/b.ts', ' M src/b.ts', ' M src/b.ts'];
    const hashes = ['hash-a', 'hash-a', 'hash-b', 'hash-b'];

    const state = captureStableRepositoryState({
      readHead: () => heads.shift()!,
      readStatus: () => statuses.shift()!,
      hashWorkspace: () => hashes.shift()!,
    });

    expect(state).toEqual({
      headCommit: 'head-a',
      workingTreeDirty: true,
      workspaceTreeSha256: 'hash-b',
    });
  });

  it('rejects a repository that cannot produce a stable observation within the retry budget', () => {
    let statusRead = 0;
    expect(() => captureStableRepositoryState({
      readHead: () => 'head-a',
      readStatus: () => `status-${statusRead += 1}`,
      hashWorkspace: () => 'hash-a',
    }, 2)).toThrow(new Error('Performance environment changed during capture'));
  });

  it('retries a transient file read error before returning a stable observation', () => {
    let hashReadCount = 0;
    const state = captureStableRepositoryState({
      readHead: () => 'head-a',
      readStatus: () => '',
      hashWorkspace: () => {
        hashReadCount += 1;
        if (hashReadCount === 1) throw new Error('ENOENT during concurrent rename');
        return 'hash-a';
      },
    });

    expect(state).toEqual({
      headCommit: 'head-a',
      workingTreeDirty: false,
      workspaceTreeSha256: 'hash-a',
    });
    expect(hashReadCount).toBe(3);
  });
});
