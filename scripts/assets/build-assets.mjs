import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import {
  animationManifest,
  characterOutput,
  characterSheets,
  isSourceAnimationEntry,
  mapAsset,
  shelterAsset,
  validateAnimationManifestEntry,
} from './manifest.mjs';

const pngOptions = { compressionLevel: 9, palette: false };

async function resizedRow(source, top) {
  return sharp(source)
    .extract({ left: 0, top, width: 1536, height: 512 })
    .ensureAlpha()
    .resize(768, 256, { kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer();
}

export async function buildCharacterBuffer(entry) {
  if (entry.attackEdit === undefined) {
    return sharp(entry.source)
      .ensureAlpha()
      .resize(768, 512, { kernel: sharp.kernel.lanczos3 })
      .png(pngOptions)
      .toBuffer();
  }

  const [top, bottom] = await Promise.all([
    resizedRow(entry.source, 0),
    resizedRow(entry.attackEdit, 512),
  ]);
  return sharp(Buffer.concat([top, bottom]), {
    raw: { width: 768, height: 512, channels: 4 },
  })
    .png(pngOptions)
    .toBuffer();
}

export async function buildCharacter(entry, output = characterOutput(entry.key)) {
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, await buildCharacterBuffer(entry));
}

export async function buildMaskedMapBuffer() {
  return sharp(mapAsset.source)
    .resize(mapAsset.width, mapAsset.height, { fit: 'fill' })
    .removeAlpha()
    .png()
    .toBuffer();
}

export async function buildMapBuffer() {
  const lossless = await buildMaskedMapBuffer();
  return sharp(lossless)
    .webp({ quality: 85, effort: 6, smartSubsample: true })
    .toBuffer();
}

export async function buildMap(output = mapAsset.output) {
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, await buildMapBuffer());
}

export async function buildShelterBuffer() {
  const metadata = await sharp(shelterAsset.source).metadata();
  if (
    metadata.width !== shelterAsset.frameCount * shelterAsset.cellWidth ||
    metadata.height !== shelterAsset.cellHeight ||
    metadata.channels !== 4
  ) {
    throw new Error('V2 shelter source must be a 1024x256 RGBA sheet');
  }
  return sharp(shelterAsset.source)
    .png(pngOptions)
    .toBuffer();
}

export async function buildShelter(output = shelterAsset.output) {
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, await buildShelterBuffer());
}

export async function buildAnimationSheet(
  entry,
  { sourceRoot = '.', outputRoot = '.' } = {},
) {
  validateAnimationManifestEntry(entry);
  if (!isSourceAnimationEntry(entry)) {
    throw new Error(`Cannot build logical mirror animation ${entry.key}`);
  }
  const source = path.resolve(sourceRoot, entry.source);
  try {
    await access(source);
  } catch {
    throw new Error(`V2 candidate missing: ${entry.source}`);
  }
  const metadata = await sharp(source).metadata();
  if (
    metadata.width !== entry.frameCount * entry.frameWidth ||
    metadata.height !== entry.frameHeight ||
    metadata.channels !== 4 ||
    metadata.format !== 'png'
  ) {
    throw new Error(
      `${entry.key} source must be ${entry.frameCount * entry.frameWidth}x${entry.frameHeight} RGBA PNG`,
    );
  }
  const output = path.resolve(outputRoot, `public${entry.url}`);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, await sharp(source).png(pngOptions).toBuffer());
}

export async function buildAnimationAssets(
  entries = animationManifest,
  options = {},
) {
  entries.forEach(validateAnimationManifestEntry);
  for (const entry of entries) {
    if (isSourceAnimationEntry(entry)) await buildAnimationSheet(entry, options);
  }
}

export async function buildAssets({ outputRoot = '.' } = {}) {
  const outputPath = (relative) => path.resolve(outputRoot, relative);
  await buildAnimationAssets(animationManifest, { sourceRoot: '.', outputRoot });
  await Promise.all([
    ...characterSheets.map((entry) =>
      buildCharacter(entry, outputPath(characterOutput(entry.key)))),
    buildMap(outputPath(mapAsset.output)),
    buildShelter(outputPath(shelterAsset.output)),
  ]);
}

export async function main() {
  await buildAssets();
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
