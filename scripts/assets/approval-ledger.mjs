import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, readFile, realpath, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a nonempty string`);
  }
  return value.trim();
}

function normalizeRepoRelativePath(value, field) {
  const relativePath = nonEmptyString(value, field);
  if (
    path.isAbsolute(relativePath) ||
    relativePath.includes('\\') ||
    path.posix.normalize(relativePath) !== relativePath ||
    relativePath === '..' ||
    relativePath.startsWith('../')
  ) {
    throw new Error(`${field} must be a normalized repo-relative path`);
  }
  return relativePath;
}

export function validateApprovalEvidence(approvalEvidence) {
  if (approvalEvidence === undefined || approvalEvidence === null) {
    throw new Error('approvalEvidence is required');
  }
  const approvedBy = nonEmptyString(approvalEvidence.approvedBy, 'approvedBy');
  const approvedAt = nonEmptyString(approvalEvidence.approvedAt, 'approvedAt');
  if (
    !ISO_TIMESTAMP.test(approvedAt) ||
    Number.isNaN(Date.parse(approvedAt)) ||
    new Date(approvedAt).toISOString() !== approvedAt
  ) {
    throw new Error('approvedAt must be an ISO timestamp with UTC milliseconds');
  }
  return {
    approvedBy,
    approvedAt,
    decisionId: nonEmptyString(approvalEvidence.decisionId, 'decisionId'),
    reviewArtifact: normalizeRepoRelativePath(approvalEvidence.reviewArtifact, 'reviewArtifact'),
  };
}

function validateGenerationMetadata(provider, generatedAt) {
  const normalizedProvider = nonEmptyString(provider, 'provider');
  if (
    typeof generatedAt !== 'string' ||
    !ISO_DATE.test(generatedAt) ||
    Number.isNaN(Date.parse(`${generatedAt}T00:00:00.000Z`)) ||
    new Date(`${generatedAt}T00:00:00.000Z`).toISOString().slice(0, 10) !== generatedAt
  ) {
    throw new Error('generatedAt must be an ISO date');
  }
  return { provider: normalizedProvider, generatedAt };
}

function validateReferences(references) {
  if (!Array.isArray(references)) throw new Error('references must be an array');
  return references.map((reference) => normalizeRepoRelativePath(reference, 'reference'));
}

export function validateProvenanceEvidence(provenance) {
  if (provenance === null || typeof provenance !== 'object') {
    throw new Error('provenance evidence must be an object');
  }
  return {
    ...validateGenerationMetadata(provenance.provider, provenance.generatedAt),
    references: validateReferences(provenance.references),
  };
}

function validateSources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) throw new Error('sources must not be empty');
  return sources.map((entry) => {
    if (entry === null || typeof entry !== 'object') throw new Error('source entry must be an object');
    return {
      source: normalizeRepoRelativePath(entry.source, 'source'),
      references: validateReferences(entry.references ?? []),
    };
  });
}

async function resolveGitRepositoryRoot(root) {
  const resolvedRoot = path.resolve(root);
  let gitTopLevel;
  try {
    gitTopLevel = execFileSync(
      'git',
      ['-C', resolvedRoot, 'rev-parse', '--show-toplevel'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
  } catch {
    throw new Error('root must be the Git repository top-level');
  }
  const [realRoot, realGitTopLevel] = await Promise.all([
    realpath(resolvedRoot),
    realpath(gitTopLevel),
  ]);
  if (realRoot !== realGitTopLevel) throw new Error('root must be the Git repository top-level');
  return { resolvedRoot, realRoot };
}

function staysInsideRoot(realRoot, candidate) {
  const relative = path.relative(realRoot, candidate);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function resolveCommittedReviewEvidence(repository, approvalEvidence) {
  const normalized = validateApprovalEvidence(approvalEvidence);
  const { resolvedRoot, realRoot } = repository;
  const reviewFile = path.resolve(resolvedRoot, normalized.reviewArtifact);
  if (!staysInsideRoot(realRoot, await realpath(reviewFile))) {
    throw new Error('reviewArtifact must stay inside root');
  }
  const reviewStats = await lstat(reviewFile);
  let committedTreeEntry;
  try {
    committedTreeEntry = execFileSync(
      'git',
      ['-C', resolvedRoot, 'ls-tree', 'HEAD', '--', normalized.reviewArtifact],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    throw new Error('reviewArtifact must be a committed regular file');
  }
  if (!reviewStats.isFile() || !/^100(?:644|755) blob [0-9a-f]+\t/.test(committedTreeEntry)) {
    throw new Error('reviewArtifact must be a committed regular file');
  }
  const reviewBytes = await readFile(reviewFile);
  let committedBytes;
  try {
    committedBytes = execFileSync(
      'git',
      ['-C', resolvedRoot, 'show', `HEAD:${normalized.reviewArtifact}`],
      { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    throw new Error('reviewArtifact must be committed at HEAD');
  }
  if (!reviewBytes.equals(committedBytes)) {
    throw new Error('reviewArtifact must match committed bytes');
  }
  return {
    ...normalized,
    reviewSha256: createHash('sha256').update(reviewBytes).digest('hex'),
  };
}

export function parseApprovalCliArgs(args) {
  const allowed = new Map([
    ['--root', 'root'],
    ['--generated-at', 'generatedAt'],
    ['--approved-by', 'approvedBy'],
    ['--approved-at', 'approvedAt'],
    ['--decision-id', 'decisionId'],
    ['--review-artifact', 'reviewArtifact'],
  ]);
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const field = allowed.get(flag);
    if (field === undefined) throw new Error(`Unknown approval argument: ${flag}`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${flag}`);
    }
    if (values[field] !== undefined) throw new Error(`Duplicate approval argument: ${flag}`);
    values[field] = value;
  }
  const approvalEvidence = values.approvedBy === undefined &&
    values.approvedAt === undefined &&
    values.decisionId === undefined &&
    values.reviewArtifact === undefined
    ? undefined
    : {
      approvedBy: values.approvedBy,
      approvedAt: values.approvedAt,
      decisionId: values.decisionId,
      reviewArtifact: values.reviewArtifact,
    };
  const normalizedApprovalEvidence = validateApprovalEvidence(approvalEvidence);
  const normalizedGeneratedAt = validateGenerationMetadata('approval-cli', values.generatedAt).generatedAt;
  return {
    root: values.root ?? '.',
    generatedAt: normalizedGeneratedAt,
    approvalEvidence: normalizedApprovalEvidence,
  };
}

async function readRows(file) {
  try {
    const rows = JSON.parse(await readFile(file, 'utf8'));
    if (!Array.isArray(rows)) throw new Error(`${file} must contain a JSON array`);
    return rows;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return [];
    throw error;
  }
}

async function safeUnlink(file) {
  if (file === undefined) return;
  try {
    await unlink(file);
  } catch (error) {
    if (!error || typeof error !== 'object' || error.code !== 'ENOENT') throw error;
  }
}

async function stageBytes(file, bytes) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    return temporary;
  } catch (error) {
    await safeUnlink(temporary);
    throw error;
  }
}

async function readOptionalBytes(file) {
  try {
    return await readFile(file);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function restoreSnapshot(file, snapshot) {
  if (snapshot === undefined) {
    await safeUnlink(file);
    return;
  }
  let temporary;
  try {
    temporary = await stageBytes(file, snapshot);
    await rename(temporary, file);
  } finally {
    await safeUnlink(temporary);
  }
}

async function writeLedgerPairTransaction({
  approvalPath,
  approvalRows,
  provenancePath,
  provenanceRows,
  commitRename = rename,
  cleanupUnlink = safeUnlink,
}) {
  const [approvalSnapshot, provenanceSnapshot] = await Promise.all([
    readOptionalBytes(approvalPath),
    readOptionalBytes(provenancePath),
  ]);
  let stagedApproval;
  let stagedProvenance;
  try {
    stagedApproval = await stageBytes(
      approvalPath,
      `${JSON.stringify(approvalRows, null, 2)}\n`,
    );
    stagedProvenance = await stageBytes(
      provenancePath,
      `${JSON.stringify(provenanceRows, null, 2)}\n`,
    );
    await commitRename(stagedApproval, approvalPath);
    stagedApproval = undefined;
    await commitRename(stagedProvenance, provenancePath);
    stagedProvenance = undefined;
  } catch (error) {
    await Promise.allSettled([
      cleanupUnlink(stagedApproval),
      cleanupUnlink(stagedProvenance),
    ]);
    const rollbackResults = await Promise.allSettled([
      restoreSnapshot(approvalPath, approvalSnapshot),
      restoreSnapshot(provenancePath, provenanceSnapshot),
    ]);
    const finalCleanupResults = await Promise.allSettled([
      cleanupUnlink(stagedApproval),
      cleanupUnlink(stagedProvenance),
    ]);
    const recoveryErrors = [...rollbackResults, ...finalCleanupResults]
      .filter(({ status }) => status === 'rejected')
      .map(({ reason }) => reason);
    if (recoveryErrors.length > 0) {
      throw new AggregateError([error, ...recoveryErrors], 'ledger transaction and rollback failed');
    }
    throw error;
  }
}

function mergedRows(existing, updates) {
  const bySource = new Map(existing.map((row) => [row.source, row]));
  for (const row of updates) bySource.set(row.source, row);
  return [...bySource.values()].sort((left, right) =>
    left.source < right.source ? -1 : left.source > right.source ? 1 : 0,
  );
}

async function acquireLedgerLock(approvalPath) {
  const lockDirectory = `${path.resolve(approvalPath)}.lock`;
  await mkdir(path.dirname(lockDirectory), { recursive: true });
  const deadline = Date.now() + 10_000;
  while (true) {
    try {
      await mkdir(lockDirectory);
      return async () => rmdir(lockDirectory);
    } catch (error) {
      if (!error || typeof error !== 'object' || error.code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) throw new Error(`approval ledger is locked: ${lockDirectory}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

async function acquireLedgerLocks(paths) {
  const releases = [];
  try {
    for (const ledgerPath of [...new Set(paths)].sort()) {
      releases.push(await acquireLedgerLock(ledgerPath));
    }
  } catch (error) {
    const releaseResults = await Promise.allSettled(releases.reverse().map((release) => release()));
    const releaseErrors = releaseResults
      .filter(({ status }) => status === 'rejected')
      .map(({ reason }) => reason);
    if (releaseErrors.length > 0) {
      throw new AggregateError([error, ...releaseErrors], 'ledger lock acquisition and cleanup failed');
    }
    throw error;
  }
  return async () => {
    const results = await Promise.allSettled(releases.reverse().map((release) => release()));
    const errors = results
      .filter(({ status }) => status === 'rejected')
      .map(({ reason }) => reason);
    if (errors.length > 0) throw new AggregateError(errors, 'ledger lock cleanup failed');
  };
}

async function canonicalLedgerPath(file) {
  const resolved = path.resolve(file);
  const suffix = [];
  let candidate = resolved;
  while (true) {
    try {
      return path.join(await realpath(candidate), ...suffix);
    } catch (error) {
      if (!error || typeof error !== 'object' || error.code !== 'ENOENT') throw error;
      const parent = path.dirname(candidate);
      if (parent === candidate) return resolved;
      suffix.unshift(path.basename(candidate));
      candidate = parent;
    }
  }
}

export async function updateApprovalLedgers({
  root = '.',
  sources,
  approvalPath = path.resolve(root, 'assets/source/generated-approvals.json'),
  provenancePath = path.resolve(root, 'assets/source/provenance.json'),
  provider,
  generatedAt,
  approvalEvidence,
  commitRename,
  cleanupUnlink,
}) {
  const normalizedSources = validateSources(sources);
  const generation = validateProvenanceEvidence({ provider, generatedAt, references: [] });
  validateApprovalEvidence(approvalEvidence);
  const repository = await resolveGitRepositoryRoot(root);
  const [canonicalApprovalPath, canonicalProvenancePath] = await Promise.all([
    canonicalLedgerPath(approvalPath),
    canonicalLedgerPath(provenancePath),
  ]);
  if (canonicalApprovalPath === canonicalProvenancePath) {
    throw new Error('approvalPath and provenancePath must be different files');
  }
  if (
    !staysInsideRoot(repository.realRoot, canonicalApprovalPath) ||
    !staysInsideRoot(repository.realRoot, canonicalProvenancePath)
  ) {
    throw new Error('ledger paths must stay inside the real Git repository root');
  }
  const resolvedSourceFiles = await Promise.all(normalizedSources.map(async ({ source }) => {
    const resolvedSource = await realpath(path.resolve(repository.resolvedRoot, source));
    if (!staysInsideRoot(repository.realRoot, resolvedSource)) {
      throw new Error('source must stay inside the real Git repository root');
    }
    return resolvedSource;
  }));
  const approval = await resolveCommittedReviewEvidence(repository, approvalEvidence);
  const updates = await Promise.all(
    normalizedSources.map(async ({ source, references }, index) => {
      const sha256 = createHash('sha256')
        .update(await readFile(resolvedSourceFiles[index]))
        .digest('hex');
      return {
        approval: { source, sha256, ...approval },
        provenance: {
          source,
          sha256,
          provider: generation.provider,
          references,
          generatedAt: generation.generatedAt,
          approvalDecisionId: approval.decisionId,
          approvedBy: approval.approvedBy,
          approvedAt: approval.approvedAt,
          reviewArtifact: approval.reviewArtifact,
          reviewSha256: approval.reviewSha256,
        },
      };
    }),
  );
  const releaseLock = await acquireLedgerLocks([canonicalApprovalPath, canonicalProvenancePath]);
  try {
    const [approvals, provenance] = await Promise.all([
      readRows(canonicalApprovalPath),
      readRows(canonicalProvenancePath),
    ]);
    await writeLedgerPairTransaction({
      approvalPath: canonicalApprovalPath,
      approvalRows: mergedRows(approvals, updates.map(({ approval }) => approval)),
      provenancePath: canonicalProvenancePath,
      provenanceRows: mergedRows(provenance, updates.map(({ provenance: row }) => row)),
      commitRename,
      cleanupUnlink,
    });
  } finally {
    await releaseLock();
  }
}
