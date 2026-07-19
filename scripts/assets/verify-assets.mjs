import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { buildMaskedMapBuffer } from './build-assets.mjs';
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
  const errors = [];
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
        errors.push(Math.abs(source[offset + channel] - encoded[offset + channel]));
      }
    }
  }
  errors.sort((a, b) => a - b);
  const mean = errors.reduce((sum, value) => sum + value, 0) / errors.length;
  const p99 = errors.at(Math.floor(errors.length * 0.99)) ?? 0;
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

await mkdir('.cache/asset-review', { recursive: true });
try {
  await verifyProvenance();
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
