import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import {
  validateApprovalEvidence,
  validateProvenanceEvidence,
} from './approval-ledger.mjs';
import { buildCharacterBuffer, buildMapBuffer } from './build-assets.mjs';
import {
  characterOutput,
  characterSheets,
  mapAsset,
  outlinePolicy,
  sourceAnimationEntries,
} from './manifest.mjs';

const ALPHA_THRESHOLD = 8;
const FRAME_SIZE = 256;

async function rgbaPixels(file, extract) {
  let pipeline = sharp(file);
  if (extract !== undefined) pipeline = pipeline.extract(extract);
  return pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

export function alphaBounds(data, width, height, threshold = ALPHA_THRESHOLD) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) <= threshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) return undefined;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    margins: {
      left: minX,
      right: width - 1 - maxX,
      top: minY,
      bottom: height - 1 - maxY,
    },
  };
}

function median(values) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle];
}

function isCanonicalOutlinePixel(data, width, x, y) {
  const offset = (y * width + x) * 4;
  return (
    (data[offset] ?? 0) === outlinePolicy.rgb.r &&
    (data[offset + 1] ?? 0) === outlinePolicy.rgb.g &&
    (data[offset + 2] ?? 0) === outlinePolicy.rgb.b &&
    (data[offset + 3] ?? 0) > ALPHA_THRESHOLD
  );
}

function chebyshevDistanceFromInner(data, width, height) {
  const unreachable = 0xffff;
  const distances = new Uint16Array(width * height);
  distances.fill(unreachable);
  const queue = new Uint32Array(width * height);
  let head = 0;
  let tail = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const alpha = data[index * 4 + 3] ?? 0;
      if (alpha <= ALPHA_THRESHOLD || isCanonicalOutlinePixel(data, width, x, y)) continue;
      distances[index] = 0;
      queue[tail] = index;
      tail += 1;
    }
  }
  while (head < tail) {
    const index = queue[head] ?? 0;
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    const nextDistance = (distances[index] ?? 0) + 1;
    for (let dy = -1; dy <= 1; dy += 1) {
      const nextY = y + dy;
      if (nextY < 0 || nextY >= height) continue;
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nextX = x + dx;
        if (nextX < 0 || nextX >= width) continue;
        const nextIndex = nextY * width + nextX;
        if ((data[nextIndex * 4 + 3] ?? 0) <= ALPHA_THRESHOLD) continue;
        if ((distances[nextIndex] ?? unreachable) !== unreachable) continue;
        distances[nextIndex] = nextDistance;
        queue[tail] = nextIndex;
        tail += 1;
      }
    }
  }
  return distances;
}

function robustFrameOutlineWidth(data, bounds, frameIndex) {
  const distances = chebyshevDistanceFromInner(data, FRAME_SIZE, FRAME_SIZE);
  const samples = [];
  let validHorizontalScanlines = 0;
  const firstY = bounds.y + Math.ceil(bounds.height * 0.15);
  const lastY = bounds.y + Math.floor(bounds.height * 0.85);
  for (let y = firstY; y <= lastY; y += 1) {
    let left = 0;
    while (left < FRAME_SIZE && (data[(y * FRAME_SIZE + left) * 4 + 3] ?? 0) <= ALPHA_THRESHOLD) left += 1;
    let right = FRAME_SIZE - 1;
    while (right >= 0 && (data[(y * FRAME_SIZE + right) * 4 + 3] ?? 0) <= ALPHA_THRESHOLD) right -= 1;
    if (
      left >= right ||
      !isCanonicalOutlinePixel(data, FRAME_SIZE, left, y) ||
      !isCanonicalOutlinePixel(data, FRAME_SIZE, right, y)
    ) continue;
    const leftDistance = distances[y * FRAME_SIZE + left] ?? 0xffff;
    const rightDistance = distances[y * FRAME_SIZE + right] ?? 0xffff;
    if (leftDistance === 0xffff || rightDistance === 0xffff) continue;
    validHorizontalScanlines += 1;
    samples.push(leftDistance, rightDistance);
  }
  if (validHorizontalScanlines < 32) {
    throw new Error(
      `frame ${frameIndex} canonical outline needs 32 valid scanlines (got ${validHorizontalScanlines})`,
    );
  }

  const firstX = bounds.x + Math.ceil(bounds.width * 0.15);
  const lastX = bounds.x + Math.floor(bounds.width * 0.85);
  let validVerticalScanlines = 0;
  for (let x = firstX; x <= lastX; x += 1) {
    let top = 0;
    while (top < FRAME_SIZE && (data[(top * FRAME_SIZE + x) * 4 + 3] ?? 0) <= ALPHA_THRESHOLD) top += 1;
    let bottom = FRAME_SIZE - 1;
    while (bottom >= 0 && (data[(bottom * FRAME_SIZE + x) * 4 + 3] ?? 0) <= ALPHA_THRESHOLD) bottom -= 1;
    if (
      top >= bottom ||
      !isCanonicalOutlinePixel(data, FRAME_SIZE, x, top) ||
      !isCanonicalOutlinePixel(data, FRAME_SIZE, x, bottom)
    ) continue;
    const topDistance = distances[top * FRAME_SIZE + x] ?? 0xffff;
    const bottomDistance = distances[bottom * FRAME_SIZE + x] ?? 0xffff;
    if (topDistance === 0xffff || bottomDistance === 0xffff) continue;
    validVerticalScanlines += 1;
    samples.push(topDistance, bottomDistance);
  }
  if (validVerticalScanlines < 32) {
    throw new Error(
      `frame ${frameIndex} canonical outline needs 32 valid vertical scanlines (got ${validVerticalScanlines})`,
    );
  }

  const minimumBinSupport = Math.max(8, Math.ceil(samples.length * 0.05));
  const histogram = new Map();
  for (const sample of samples) histogram.set(sample, (histogram.get(sample) ?? 0) + 1);
  const supportedWidths = [...histogram]
    .filter(([, count]) => count >= minimumBinSupport)
    .map(([width]) => width);
  if (supportedWidths.length === 0) {
    throw new Error(`frame ${frameIndex} canonical outline has no supported width`);
  }
  return Math.max(...supportedWidths);
}

export async function measureOutlineFramesAt390(
  file,
  { frameCount, logicalOpaqueHeight, sourceOpaqueHeight = 204 },
) {
  const scale = (logicalOpaqueHeight / sourceOpaqueHeight) * (390 / 540);
  const outlines = [];
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const { data } = await rgbaPixels(file, {
      left: frameIndex * FRAME_SIZE,
      top: 0,
      width: FRAME_SIZE,
      height: FRAME_SIZE,
    });
    const bounds = alphaBounds(data, FRAME_SIZE, FRAME_SIZE);
    if (bounds === undefined) {
      throw new Error(`frame ${frameIndex} canonical outline needs 32 valid scanlines (got 0)`);
    }
    outlines.push(robustFrameOutlineWidth(data, bounds, frameIndex) * scale);
  }
  return outlines;
}

export async function measureOutlineAt390(
  file,
  { frameCount, logicalOpaqueHeight, sourceOpaqueHeight = 204 },
) {
  return median(await measureOutlineFramesAt390(file, {
    frameCount,
    logicalOpaqueHeight,
    sourceOpaqueHeight,
  }));
}

function animationLogicalHeight(key) {
  if (key.startsWith('huchu-') || key.startsWith('deokbae-')) return 72;
  if (key.startsWith('breeder-')) return 100;
  if (key.startsWith('poop-') || key.startsWith('offleash-')) return 84;
  if (key.startsWith('dog-trader-human-')) return 100;
  if (key.startsWith('dog-trader-truck-')) return 86;
  return undefined;
}

function verifyEventMetadata(entry) {
  const emitsEvent = entry.action === 'attack' || entry.action === 'tailSwipe';
  if (emitsEvent && (entry.eventFrame === undefined || entry.eventKind === undefined)) {
    throw new Error(`${entry.key}: attack event metadata is required`);
  }
  if (!emitsEvent && (entry.eventFrame !== undefined || entry.eventKind !== undefined)) {
    throw new Error(`${entry.key}: mismatched event metadata`);
  }
  if (!emitsEvent) return;
  if (entry.eventFrame < 0 || entry.eventFrame >= entry.frameCount) {
    throw new Error(`${entry.key}: eventFrame must be inside the sheet`);
  }
  const expectedMs = entry.frameCount === 8 ? 500 : 250;
  const actualMs = (entry.eventFrame / entry.fps) * 1000;
  if (Math.abs(actualMs - expectedMs) > 1e-7) {
    throw new Error(`${entry.key}: event timing must match core timing (${expectedMs}ms)`);
  }
}

export function verifyDogTraderSourceBudget(entries = sourceAnimationEntries) {
  const dogTraderSources = entries.filter(({ key }) => key.startsWith('dog-trader-'));
  if (dogTraderSources.length !== 15) {
    throw new Error(`dog trader requires exactly 15 source sheets (got ${dogTraderSources.length})`);
  }
  const bytes = dogTraderSources.reduce(
    (total, entry) => total + entry.frameCount * entry.frameWidth * entry.frameHeight * 4,
    0,
  );
  const mebibytes = bytes / 1024 / 1024;
  if (mebibytes > 24) throw new Error(`dog trader GPU source budget exceeds 24 MiB (${mebibytes.toFixed(2)})`);
  return { bytes, mebibytes, sourceCount: dogTraderSources.length };
}

export async function verifyAnimationSheet(entry, { file = entry.source, checkOutline = true } = {}) {
  verifyEventMetadata(entry);
  const truck = entry.key.startsWith('dog-trader-truck-roll-');
  const metadata = await sharp(file).metadata();
  if (
    metadata.width !== entry.frameCount * entry.frameWidth ||
    metadata.height !== entry.frameHeight ||
    metadata.channels !== 4 ||
    metadata.format !== 'png'
  ) {
    throw new Error(`${entry.key}: wrong dimensions/count; expected ${entry.frameCount * 256}x256 RGBA PNG`);
  }
  const feet = [];
  const centers = [];
  for (let frameIndex = 0; frameIndex < entry.frameCount; frameIndex += 1) {
    const { data } = await rgbaPixels(file, {
      left: frameIndex * entry.frameWidth,
      top: 0,
      width: entry.frameWidth,
      height: entry.frameHeight,
    });
    const bounds = alphaBounds(data, entry.frameWidth, entry.frameHeight);
    if (bounds === undefined) throw new Error(`${entry.key}: empty frame ${frameIndex}`);
    if (Math.min(...Object.values(bounds.margins)) < 1) {
      throw new Error(`${entry.key}: alpha touches frame edge at frame ${frameIndex}`);
    }
    if (truck) {
      if (bounds.width < 220 || bounds.width > 240) {
        throw new Error(`${entry.key}: frame ${frameIndex} truck width must be 220-240px`);
      }
      if (bounds.height < 135 || bounds.height > 155) {
        throw new Error(`${entry.key}: frame ${frameIndex} truck height must be 135-155px`);
      }
    } else {
      const occupancy = bounds.height / entry.frameHeight;
      if (occupancy < 0.75 || occupancy > 0.85) {
        throw new Error(`${entry.key}: frame ${frameIndex} occupancy must be 75-85%`);
      }
    }
    const foot = bounds.y + bounds.height;
    if (Math.abs(foot - 254) > 2) {
      throw new Error(`${entry.key}: frame ${frameIndex} foot anchor must be 254±2px`);
    }
    feet.push(foot);
    centers.push(bounds.x + bounds.width / 2);
    if (entry.key.startsWith('huchu-')) {
      const logicalSilhouette = (bounds.height / entry.opaqueHeightPx) * 72;
      if (Math.abs(logicalSilhouette - 72) > 2) {
        throw new Error(`${entry.key}: rendered Huchu silhouette must be 72±2 logical pixels`);
      }
    }
  }
  if (Math.max(...feet) - Math.min(...feet) > 2) {
    throw new Error(`${entry.key}: within-sheet foot spread exceeds 2px`);
  }
  if (Math.max(...centers) - Math.min(...centers) > 3) {
    throw new Error(`${entry.key}: within-sheet center spread exceeds 3px`);
  }
  const logicalOpaqueHeight = animationLogicalHeight(entry.key);
  if (checkOutline && logicalOpaqueHeight !== undefined) {
    const outlines = await measureOutlineFramesAt390(file, {
      frameCount: entry.frameCount,
      logicalOpaqueHeight,
      sourceOpaqueHeight: entry.opaqueHeightPx,
    });
    for (const [frameIndex, outline] of outlines.entries()) {
      if (outline < 1.5 || outline > 2) {
        throw new Error(
          `${entry.key}: frame ${frameIndex} outline at 390px must be 1.5-2px (got ${outline.toFixed(2)})`,
        );
      }
    }
  }
}

export function percentileFromByteHistogram(histogram, count, quantile) {
  if (count === 0) return 0;
  const targetIndex = Math.min(count - 1, Math.floor(count * quantile));
  let cumulative = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    cumulative += histogram[value];
    if (cumulative > targetIndex) return value;
  }
  return histogram.length - 1;
}

export async function verifyGeneratedApprovals(root = '.') {
  const manifest = path.resolve(root, 'assets/source/generated-approvals.json');
  const entries = JSON.parse(await readFile(manifest, 'utf8'));
  const approvalFailures = [];
  for (const entry of entries) {
    const actual = createHash('sha256')
      .update(await readFile(path.resolve(root, entry.source)))
      .digest('hex');
    if (actual !== entry.sha256) {
      approvalFailures.push({
        source: entry.source,
        reason: 'SHA-256 differs from generated approval',
        expected: entry.sha256,
        actual,
      });
    }
  }
  return approvalFailures;
}

export function expectedLiveGeneratedSources(
  entries = sourceAnimationEntries,
) {
  return [...new Set(entries.map(({ source }) => source))].sort();
}

async function readLedgerRows(file) {
  const rows = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(rows)) throw new Error(`${file} must contain a JSON array`);
  return rows;
}

export async function verifyRequiredGeneratedSourceCoverage(
  root = '.',
  {
    requiredSources = expectedLiveGeneratedSources(),
    approvalPath = path.resolve(root, 'assets/source/generated-approvals.json'),
    provenancePath = path.resolve(root, 'assets/source/provenance.json'),
  } = {},
) {
  const [approvals, provenance] = await Promise.all([
    readLedgerRows(approvalPath),
    readLedgerRows(provenancePath),
  ]);
  const approvalSources = new Set(approvals.map(({ source }) => source));
  const provenanceSources = new Set(provenance.map(({ source }) => source));
  const failures = [];
  for (const source of [...new Set(requiredSources)].sort()) {
    if (!approvalSources.has(source)) {
      failures.push({
        source,
        ledger: 'generated-approvals',
        reason: 'required generated source is missing from approval ledger',
      });
    }
    if (!provenanceSources.has(source)) {
      failures.push({
        source,
        ledger: 'provenance',
        reason: 'required generated source is missing from provenance ledger',
      });
    }
  }
  return failures;
}

export async function verifyRequiredGeneratedSourceEvidence(
  root = '.',
  {
    requiredSources = expectedLiveGeneratedSources(),
    approvalPath = path.resolve(root, 'assets/source/generated-approvals.json'),
    provenancePath = path.resolve(root, 'assets/source/provenance.json'),
  } = {},
) {
  const [approvals, provenance] = await Promise.all([
    readLedgerRows(approvalPath),
    readLedgerRows(provenancePath),
  ]);
  const approvalBySource = new Map(approvals.map((row) => [row.source, row]));
  const provenanceBySource = new Map(provenance.map((row) => [row.source, row]));
  const required = [...new Set(requiredSources)].sort();
  const requiredSet = new Set(required);
  const reviewHashes = new Map();
  const failures = [];

  for (const source of required) {
    const approval = approvalBySource.get(source);
    if (approval === undefined) continue;
    try {
      const evidence = validateApprovalEvidence(approval);
      if (!/^[0-9a-f]{64}$/.test(approval.reviewSha256 ?? '')) {
        throw new Error('reviewSha256 must be a lowercase SHA-256 hex string');
      }
      let actual = reviewHashes.get(evidence.reviewArtifact);
      if (actual === undefined) {
        actual = createHash('sha256')
          .update(await readFile(path.resolve(root, evidence.reviewArtifact)))
          .digest('hex');
        reviewHashes.set(evidence.reviewArtifact, actual);
      }
      if (actual !== approval.reviewSha256) {
        throw new Error('review artifact SHA-256 differs from approval evidence');
      }
    } catch (error) {
      failures.push({
        source,
        ledger: 'generated-approvals',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const source of requiredSet) {
    const approval = approvalBySource.get(source);
    const provenanceRow = provenanceBySource.get(source);
    if (approval === undefined || provenanceRow === undefined) continue;
    try {
      validateProvenanceEvidence(provenanceRow);
      const linksMatch =
        provenanceRow.approvalDecisionId === approval.decisionId &&
        provenanceRow.approvedBy === approval.approvedBy &&
        provenanceRow.approvedAt === approval.approvedAt &&
        provenanceRow.reviewArtifact === approval.reviewArtifact &&
        provenanceRow.reviewSha256 === approval.reviewSha256;
      if (!linksMatch) {
        throw new Error('provenance approval evidence does not match approval ledger');
      }
    } catch (error) {
      failures.push({
        source,
        ledger: 'provenance',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return failures;
}

export async function verifyApprovedAttackRows(outputRoot = '.') {
  const failures = [];
  for (const entry of characterSheets.filter(({ attackEdit }) => attackEdit !== undefined)) {
    const file = characterOutput(entry.key);
    try {
      const [approvedAttack, runtimeAttack] = await Promise.all([
        sharp(entry.attackEdit)
          .extract({ left: 0, top: 512, width: 1536, height: 512 })
          .ensureAlpha()
          .resize(768, 256, { kernel: sharp.kernel.lanczos3 })
          .raw()
          .toBuffer({ resolveWithObject: true }),
        rgbaPixels(path.resolve(outputRoot, file), { left: 0, top: 256, width: 768, height: 256 }),
      ]);
      if (!approvedAttack.data.equals(runtimeAttack.data)) {
        failures.push({ file, reason: 'approved attack row changed' });
      }
    } catch (error) {
      failures.push({ file, reason: 'approved attack row changed', details: error instanceof Error ? error.message : String(error) });
    }
  }
  return failures;
}

async function rawPixelsEqual(expected, actual) {
  const [left, right] = await Promise.all([rgbaPixels(expected), rgbaPixels(actual)]);
  return left.info.width === right.info.width && left.info.height === right.info.height && left.data.equals(right.data);
}

export async function verifyRuntimeFreshness(outputRoot = '.') {
  const failures = [];
  for (const entry of characterSheets) {
    const file = characterOutput(entry.key);
    try {
      const expected = await buildCharacterBuffer(entry);
      if (!(await rawPixelsEqual(expected, path.resolve(outputRoot, file)))) {
        failures.push({ file, reason: 'runtime output is stale for current sources' });
      }
    } catch (error) {
      failures.push({ file, reason: 'runtime output is stale for current sources', details: error instanceof Error ? error.message : String(error) });
    }
  }
  for (const entry of sourceAnimationEntries) {
    const output = path.resolve(outputRoot, `public${entry.url}`);
    if (!existsSync(entry.source)) {
      failures.push({ file: entry.source, reason: 'V2 candidate missing' });
      continue;
    }
    try {
      if (!(await rawPixelsEqual(entry.source, output))) {
        failures.push({ file: `public${entry.url}`, reason: 'runtime output is stale for current sources' });
      }
    } catch (error) {
      failures.push({ file: `public${entry.url}`, reason: 'runtime output is stale for current sources', details: error instanceof Error ? error.message : String(error) });
    }
  }
  try {
    const [expected, actual] = await Promise.all([
      buildMapBuffer(),
      readFile(path.resolve(outputRoot, mapAsset.output)),
    ]);
    if (!expected.equals(actual)) failures.push({ file: mapAsset.output, reason: 'runtime output is stale for current sources' });
  } catch (error) {
    failures.push({ file: mapAsset.output, reason: 'runtime output is stale for current sources', details: error instanceof Error ? error.message : String(error) });
  }
  return failures;
}

async function verifyProvenance() {
  const entries = JSON.parse(await readFile('assets/source/provenance.json', 'utf8'));
  for (const entry of entries) {
    const actual = createHash('sha256').update(await readFile(entry.source)).digest('hex');
    if (actual !== entry.sha256) throw new Error(`${entry.source}: SHA-256 differs from provenance`);
  }
}

async function verifyMap() {
  const metadata = await sharp(mapAsset.output).metadata();
  if (metadata.width !== 1080 || metadata.height !== 1920 || metadata.format !== 'webp') {
    throw new Error('map must be a 1080x1920 WebP');
  }
  const [expected, actual] = await Promise.all([buildMapBuffer(), readFile(mapAsset.output)]);
  if (!expected.equals(actual)) throw new Error('map runtime output is stale for exact SVG source');
}

export async function main({ approvalMode = 'strict' } = {}) {
  if (approvalMode !== 'strict' && approvalMode !== 'candidate') {
    throw new Error(`Unknown approval mode: ${approvalMode}`);
  }
  const failures = [];
  const capture = async (file, operation) => {
    try {
      await operation();
    } catch (error) {
      failures.push({ file, reason: error instanceof Error ? error.message : String(error) });
    }
  };
  await mkdir('.cache/asset-review', { recursive: true });
  await capture('assets/source/provenance.json', verifyProvenance);
  await capture('dog-trader-source-budget', async () => verifyDogTraderSourceBudget());
  failures.push(...(await verifyGeneratedApprovals()));
  let deferredApprovalCoverage = [];
  await capture('generated-source-coverage', async () => {
    const coverageFailures = await verifyRequiredGeneratedSourceCoverage();
    if (approvalMode === 'strict') failures.push(...coverageFailures);
    else deferredApprovalCoverage = coverageFailures;
  });
  if (approvalMode === 'strict') {
    await capture('generated-source-approval-evidence', async () => {
      failures.push(...(await verifyRequiredGeneratedSourceEvidence()));
    });
  }
  failures.push(...(await verifyApprovedAttackRows()));
  failures.push(...(await verifyRuntimeFreshness()));
  for (const entry of sourceAnimationEntries) {
    if (existsSync(entry.source)) {
      await capture(entry.source, () => verifyAnimationSheet(entry, { file: entry.source }));
    }
  }
  await capture(mapAsset.output, verifyMap);
  await writeFile('.cache/asset-review/asset-report.json', `${JSON.stringify({
    approvalMode,
    deferredApprovalCoverage,
    failures,
  }, null, 2)}\n`);
  if (failures.length > 0) {
    console.error(JSON.stringify({ failures }, null, 2));
    process.exitCode = 1;
    return;
  }
  const genericCount = sourceAnimationEntries.filter(({ key }) => !key.startsWith('dog-trader-')).length;
  const dogTraderCount = sourceAnimationEntries.length - genericCount;
  if (approvalMode === 'candidate' && deferredApprovalCoverage.length > 0) {
    console.log(
      `Approval coverage deferred for ${deferredApprovalCoverage.length} required source/ledger rows`,
    );
  }
  console.log(`Verified ${genericCount} generic animation sheets and ${dogTraderCount} dog trader source sheets`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main({ approvalMode: process.argv.includes('--candidate') ? 'candidate' : 'strict' });
}
