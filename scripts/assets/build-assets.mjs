import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { characterOutput, characterSheets, mapAsset, shelterAsset } from './manifest.mjs';

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const pngOptions = { compressionLevel: 9, palette: false };

async function resizedRow(source, top) {
  return sharp(source)
    .extract({ left: 0, top, width: 1536, height: 512 })
    .ensureAlpha()
    .resize(768, 256, { kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer();
}

export async function buildCharacter(entry) {
  const output = characterOutput(entry.key);
  if (entry.attackEdit === undefined) {
    await sharp(entry.source)
      .ensureAlpha()
      .resize(768, 512, { kernel: sharp.kernel.lanczos3 })
      .png(pngOptions)
      .toFile(output);
    return;
  }

  const [top, bottom] = await Promise.all([
    resizedRow(entry.source, 0),
    resizedRow(entry.attackEdit, 512),
  ]);
  await sharp(Buffer.concat([top, bottom]), {
    raw: { width: 768, height: 512, channels: 4 },
  })
    .png(pngOptions)
    .toFile(output);
}

async function mapMask() {
  const core = `<svg width="${mapAsset.width}" height="${mapAsset.height}" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="${mapAsset.centerX}" cy="${mapAsset.centerY}" rx="${mapAsset.radiusX}" ry="${mapAsset.radiusY}" fill="white"/>
  </svg>`;
  const outer = `<svg width="${mapAsset.width}" height="${mapAsset.height}" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="${mapAsset.centerX}" cy="${mapAsset.centerY}" rx="${mapAsset.radiusX + mapAsset.feather}" ry="${mapAsset.radiusY + mapAsset.feather}" fill="white"/>
  </svg>`;
  const blurred = await sharp(Buffer.from(core)).blur(mapAsset.feather / 3).png().toBuffer();
  return sharp(blurred)
    .composite([{ input: Buffer.from(outer), blend: 'dest-in' }])
    .png()
    .toBuffer();
}

export async function buildMaskedMapBuffer() {
  const [mask, edit] = await Promise.all([
    mapMask(),
    sharp(mapAsset.edit)
      .resize(mapAsset.width, mapAsset.height, { fit: 'fill' })
      .ensureAlpha()
      .png()
      .toBuffer(),
  ]);
  const maskedEdit = await sharp(edit)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
  return sharp(mapAsset.source)
    .ensureAlpha()
    .composite([{ input: maskedEdit, left: 0, top: 0, blend: 'over' }])
    .removeAlpha()
    .png()
    .toBuffer();
}

export async function buildMap() {
  const lossless = await buildMaskedMapBuffer();
  await sharp(lossless)
    .webp({ quality: 85, effort: 6, smartSubsample: true })
    .toFile(mapAsset.output);
}

async function extractShelterFrames() {
  const metadata = await sharp(shelterAsset.source).metadata();
  if (metadata.width === undefined || metadata.height === undefined || metadata.width % 4 !== 0) {
    throw new Error('shelter-states-edit.png must contain four equal columns');
  }
  const sourceCellWidth = metadata.width / 4;
  return Promise.all(
    Array.from({ length: 4 }, async (_, index) => {
      const cell = await sharp(shelterAsset.source)
        .extract({
          left: index * sourceCellWidth,
          top: 0,
          width: sourceCellWidth,
          height: metadata.height,
        })
        .ensureAlpha()
        .png()
        .toBuffer();
      const result = await sharp(cell)
        .trim({ background: transparent, threshold: 8 })
        .png()
        .toBuffer({ resolveWithObject: true });
      if (result.info.width === 0 || result.info.height === 0) {
        throw new Error(`shelter frame ${index} is empty`);
      }
      return result;
    }),
  );
}

export async function buildShelter() {
  const frames = await extractShelterFrames();
  const maxWidth = Math.max(...frames.map((frame) => frame.info.width));
  const maxHeight = Math.max(...frames.map((frame) => frame.info.height));
  const scale = Math.min(224 / maxWidth, 208 / maxHeight);
  const composites = await Promise.all(
    frames.map(async (frame, index) => {
      const width = Math.max(1, Math.round(frame.info.width * scale));
      const height = Math.max(1, Math.round(frame.info.height * scale));
      const input = await sharp(frame.data)
        .resize(width, height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
        .png(pngOptions)
        .toBuffer();
      return {
        input,
        left: index * shelterAsset.cellWidth + shelterAsset.anchorX - Math.round(width / 2),
        top: shelterAsset.anchorY - height,
      };
    }),
  );
  await sharp({ create: { width: 1024, height: 256, channels: 4, background: transparent } })
    .composite(composites)
    .png(pngOptions)
    .toFile(shelterAsset.output);
}

export async function main() {
  await Promise.all([
    mkdir('public/assets/characters', { recursive: true }),
    mkdir('public/assets/map', { recursive: true }),
    mkdir('public/assets/shelter', { recursive: true }),
  ]);
  for (const entry of characterSheets) await buildCharacter(entry);
  await Promise.all([buildMap(), buildShelter()]);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
