import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { cpus, platform, release } from 'node:os';
import { relative, resolve, sep } from 'node:path';

export const DEFAULT_PERFORMANCE_HASH_PATHS = [
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
] as const;

export type PerformancePowerState = 'unavailable' | Readonly<{
  charging: boolean;
  level: number;
}>;

export interface PerformanceEnvironment {
  readonly headCommit: string;
  readonly workingTreeDirty: boolean;
  readonly workspaceTreeSha256: string;
  readonly osPlatform: string;
  readonly osRelease: string;
  readonly cpuModel: string;
  readonly browserVersion: string;
  readonly powerState: PerformancePowerState;
}

export interface CapturePerformanceEnvironmentOptions {
  readonly workspaceRoot: string;
  readonly browserVersion: string;
  readonly powerState: PerformancePowerState;
}

export interface StableRepositoryState {
  readonly headCommit: string;
  readonly workingTreeDirty: boolean;
  readonly workspaceTreeSha256: string;
}

export interface RepositoryStateReader {
  readHead(): string;
  readStatus(): string;
  hashWorkspace(): string;
}

const DEFAULT_STABLE_CAPTURE_ATTEMPTS = 3;

function lengthFrame(value: number): Buffer {
  const frame = Buffer.alloc(8);
  frame.writeBigUInt64BE(BigInt(value));
  return frame;
}

function collectFiles(workspaceRoot: string, requestedPaths: readonly string[]): string[] {
  const workspace = resolve(workspaceRoot);
  const files = new Set<string>();

  const visit = (absolutePath: string): void => {
    const info = statSync(absolutePath);
    if (info.isDirectory()) {
      for (const entry of readdirSync(absolutePath).sort()) visit(resolve(absolutePath, entry));
      return;
    }
    if (!info.isFile()) return;
    const relativePath = relative(workspace, absolutePath);
    if (relativePath === '..' || relativePath.startsWith(`..${sep}`)) {
      throw new RangeError(`Performance hash path escapes workspace: ${absolutePath}`);
    }
    files.add(relativePath.split(sep).join('/'));
  };

  for (const requestedPath of requestedPaths) {
    const absolutePath = resolve(workspace, requestedPath);
    const relativePath = relative(workspace, absolutePath);
    if (relativePath === '..' || relativePath.startsWith(`..${sep}`)) {
      throw new RangeError(`Performance hash path escapes workspace: ${requestedPath}`);
    }
    if (existsSync(absolutePath)) visit(absolutePath);
  }
  return [...files].sort();
}

export function computeWorkspaceTreeSha256(
  workspaceRoot: string,
  requestedPaths: readonly string[] = DEFAULT_PERFORMANCE_HASH_PATHS,
): string {
  const hash = createHash('sha256');
  const files = collectFiles(workspaceRoot, requestedPaths);
  hash.update(lengthFrame(files.length));
  for (const relativePath of files) {
    const pathBytes = Buffer.from(relativePath, 'utf8');
    const fileBytes = readFileSync(resolve(workspaceRoot, relativePath));
    hash.update(lengthFrame(pathBytes.length));
    hash.update(pathBytes);
    hash.update(lengthFrame(fileBytes.length));
    hash.update(fileBytes);
  }
  return hash.digest('hex');
}

function git(workspaceRoot: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', workspaceRoot, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function captureStableRepositoryState(
  reader: RepositoryStateReader,
  maxAttempts = DEFAULT_STABLE_CAPTURE_ATTEMPTS,
): StableRepositoryState {
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts <= 0) {
    throw new RangeError('Stable capture attempts must be a positive safe integer');
  }
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const headBefore = reader.readHead();
      const statusBefore = reader.readStatus();
      const hashBefore = reader.hashWorkspace();
      const hashAfter = reader.hashWorkspace();
      const statusAfter = reader.readStatus();
      const headAfter = reader.readHead();
      if (
        headBefore === headAfter
        && statusBefore === statusAfter
        && hashBefore === hashAfter
      ) {
        return {
          headCommit: headAfter,
          workingTreeDirty: statusAfter.length > 0,
          workspaceTreeSha256: hashAfter,
        };
      }
    } catch {
      // A concurrent rename can make one observation fail; retry the full framed read.
    }
  }
  throw new Error('Performance environment changed during capture');
}

export function capturePerformanceEnvironment(
  options: CapturePerformanceEnvironmentOptions,
): PerformanceEnvironment {
  const { workspaceRoot, browserVersion, powerState } = options;
  const repository = captureStableRepositoryState({
    readHead: () => git(workspaceRoot, ['rev-parse', 'HEAD']),
    readStatus: () => git(workspaceRoot, ['status', '--porcelain', '--untracked-files=all']),
    hashWorkspace: () => computeWorkspaceTreeSha256(workspaceRoot),
  });
  return {
    ...repository,
    osPlatform: platform(),
    osRelease: release(),
    cpuModel: cpus()[0]?.model ?? 'unknown',
    browserVersion,
    powerState,
  };
}
