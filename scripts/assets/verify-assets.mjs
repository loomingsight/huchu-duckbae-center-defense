import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import {
  buildCharacterBuffer,
  buildMapBuffer,
  buildMaskedMapBuffer,
  buildShelterBuffer,
} from './build-assets.mjs';
import { characterOutput, characterSheets, mapAsset, shelterAsset } from './manifest.mjs';

const failures = [];
const fail = (file, reason, details = {}) => failures.push({ file, reason, ...details });

async function rgbaPixels(file, extract) {
  let pipeline = sharp(file);
  if (extract !== undefined) pipeline = pipeline.extract(extract);
  return pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function alphaBounds(data, width, height, threshold = 8) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] <= threshold) continue;
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

async function verifyCharacter(entry) {
  const file = characterOutput(entry.key);
  const metadata = await sharp(file).metadata();
  if (
    metadata.width !== 768 ||
    metadata.height !== 512 ||
    metadata.channels !== 4 ||
    metadata.format !== 'png'
  ) {
    fail(file, 'expected 768x512 RGBA PNG', { metadata });
    return;
  }
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const frame = await rgbaPixels(file, {
        left: column * 192,
        top: row * 256,
        width: 192,
        height: 256,
      });
      const bbox = alphaBounds(frame.data, 192, 256);
      if (bbox === undefined) fail(file, 'empty frame', { row, column });
      else if (Math.min(...Object.values(bbox.margins)) < 3) {
        fail(file, 'frame needs 3px transparent margin', {
          row,
          column,
          bbox,
          margins: bbox.margins,
        });
      }
    }
  }
  if (entry.attackEdit !== undefined) {
    const expectedTopPng = await sharp(entry.source)
      .extract({ left: 0, top: 0, width: 1536, height: 512 })
      .ensureAlpha()
      .resize(768, 256, { kernel: sharp.kernel.lanczos3 })
      .png()
      .toBuffer();
    const [expectedTop, actualTop, oldBottom, actualBottom] = await Promise.all([
      rgbaPixels(expectedTopPng),
      rgbaPixels(file, { left: 0, top: 0, width: 768, height: 256 }),
      rgbaPixels(
        await sharp(entry.source)
          .extract({ left: 0, top: 512, width: 1536, height: 512 })
          .ensureAlpha()
          .resize(768, 256, { kernel: sharp.kernel.lanczos3 })
          .png()
          .toBuffer(),
      ),
      rgbaPixels(file, { left: 0, top: 256, width: 768, height: 256 }),
    ]);
    if (!expectedTop.data.equals(actualTop.data)) fail(file, 'approved walk row changed');
    let difference = 0;
    for (let index = 0; index < oldBottom.data.length; index += 1) {
      difference += Math.abs(oldBottom.data[index] - actualBottom.data[index]);
    }
    if (difference / oldBottom.data.length < 5) {
      fail(file, 'attack row is too similar to rejected whistle row');
    }
  }
}

async function verifyShelter() {
  const file = shelterAsset.output;
  const metadata = await sharp(file).metadata();
  if (
    metadata.width !== 1024 ||
    metadata.height !== 256 ||
    metadata.channels !== 4 ||
    metadata.format !== 'png'
  ) {
    fail(file, 'expected 1024x256 RGBA PNG', { metadata });
    return;
  }
  for (let column = 0; column < 4; column += 1) {
    const frame = await rgbaPixels(file, {
      left: column * 256,
      top: 0,
      width: 256,
      height: 256,
    });
    const bbox = alphaBounds(frame.data, 256, 256);
    if (bbox === undefined) {
      fail(file, 'empty shelter frame', { row: 0, column });
      continue;
    }
    const anchorY = bbox.y + bbox.height;
    if (Math.abs(anchorY - shelterAsset.anchorY) > 2) {
      fail(file, 'shelter ground anchor differs', { row: 0, column, bbox, anchorY });
    }
    if (Math.min(bbox.margins.left, bbox.margins.right, bbox.margins.top, bbox.margins.bottom) < 16) {
      fail(file, 'shelter needs 16px transparent margin', {
        row: 0,
        column,
        bbox,
        margins: bbox.margins,
      });
    }
  }
}

function outsideEditMask(x, y) {
  const rasterGuard = 2;
  const dx = (x - mapAsset.centerX) / (mapAsset.radiusX + mapAsset.feather + rasterGuard);
  const dy = (y - mapAsset.centerY) / (mapAsset.radiusY + mapAsset.feather + rasterGuard);
  return dx * dx + dy * dy > 1;
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

async function verifyMap() {
  const metadata = await sharp(mapAsset.output).metadata();
  if (
    metadata.width !== mapAsset.width ||
    metadata.height !== mapAsset.height ||
    metadata.format !== 'webp'
  ) {
    fail(mapAsset.output, 'unexpected map dimensions or codec', { metadata });
    return;
  }
  const [source, lossless, encoded] = await Promise.all([
    sharp(mapAsset.source).removeAlpha().raw().toBuffer(),
    sharp(await buildMaskedMapBuffer()).removeAlpha().raw().toBuffer(),
    sharp(mapAsset.output).removeAlpha().raw().toBuffer(),
  ]);
  const errorHistogram = new Uint32Array(256);
  let errorCount = 0;
  let errorSum = 0;
  for (let y = 0; y < mapAsset.height; y += 1) {
    for (let x = 0; x < mapAsset.width; x += 1) {
      if (!outsideEditMask(x, y)) continue;
      const offset = (y * mapAsset.width + x) * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        if (source[offset + channel] !== lossless[offset + channel]) {
          fail(mapAsset.output, 'lossless composite changed a pixel outside the edit mask', {
            x,
            y,
            channel,
          });
          return;
        }
        const error = Math.abs(source[offset + channel] - encoded[offset + channel]);
        errorHistogram[error] += 1;
        errorCount += 1;
        errorSum += error;
      }
    }
  }
  const mean = errorCount === 0 ? 0 : errorSum / errorCount;
  const p99 = percentileFromByteHistogram(errorHistogram, errorCount, 0.99);
  if (mean > 3 || p99 > 12) {
    fail(mapAsset.output, 'WebP drift outside edit mask exceeds tolerance', { mean, p99 });
  }
}

async function verifyProvenance() {
  const entries = JSON.parse(await readFile('assets/source/provenance.json', 'utf8'));
  for (const entry of entries) {
    const actual = createHash('sha256').update(await readFile(entry.source)).digest('hex');
    if (actual !== entry.sha256) {
      fail(entry.source, 'SHA-256 differs from provenance', { expected: entry.sha256, actual });
    }
  }
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

async function rawPixelsEqual(expected, actual) {
  const [expectedPixels, actualPixels] = await Promise.all([
    rgbaPixels(expected),
    rgbaPixels(actual),
  ]);
  return (
    expectedPixels.info.width === actualPixels.info.width &&
    expectedPixels.info.height === actualPixels.info.height &&
    expectedPixels.info.channels === actualPixels.info.channels &&
    expectedPixels.data.equals(actualPixels.data)
  );
}

export async function verifyRuntimeFreshness(outputRoot = '.') {
  const freshnessFailures = [];
  for (const entry of characterSheets) {
    const file = characterOutput(entry.key);
    try {
      const expected = await buildCharacterBuffer(entry);
      if (!(await rawPixelsEqual(expected, path.resolve(outputRoot, file)))) {
        freshnessFailures.push({ file, reason: 'runtime output is stale for current sources' });
      }
    } catch (error) {
      freshnessFailures.push({
        file,
        reason: 'runtime output is stale for current sources',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const shelterFile = shelterAsset.output;
  try {
    const expectedShelter = await buildShelterBuffer();
    if (!(await rawPixelsEqual(expectedShelter, path.resolve(outputRoot, shelterFile)))) {
      freshnessFailures.push({
        file: shelterFile,
        reason: 'runtime output is stale for current sources',
      });
    }
  } catch (error) {
    freshnessFailures.push({
      file: shelterFile,
      reason: 'runtime output is stale for current sources',
      details: error instanceof Error ? error.message : String(error),
    });
  }

  const mapFile = mapAsset.output;
  try {
    const [expectedMap, actualMap] = await Promise.all([
      buildMapBuffer(),
      readFile(path.resolve(outputRoot, mapFile)),
    ]);
    if (!expectedMap.equals(actualMap)) {
      freshnessFailures.push({ file: mapFile, reason: 'runtime output is stale for current sources' });
    }
  } catch (error) {
    freshnessFailures.push({
      file: mapFile,
      reason: 'runtime output is stale for current sources',
      details: error instanceof Error ? error.message : String(error),
    });
  }

  return freshnessFailures;
}

export async function main() {
  await mkdir('.cache/asset-review', { recursive: true });
  try {
    await verifyProvenance();
    failures.push(...(await verifyGeneratedApprovals()));
    failures.push(...(await verifyRuntimeFreshness()));
    for (const entry of characterSheets) await verifyCharacter(entry);
    await Promise.all([verifyShelter(), verifyMap()]);
  } catch (error) {
    fail('asset-pipeline', error instanceof Error ? error.message : String(error));
  }
  await writeFile(
    '.cache/asset-review/asset-report.json',
    `${JSON.stringify({ failures }, null, 2)}\n`,
  );
  if (failures.length > 0) {
    console.error(JSON.stringify({ failures }, null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
