import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { outlinePolicy, sourceAnimationEntries } from './manifest.mjs';

const FRAME_SIZE = 256;
const TARGET_OPAQUE_HEIGHT = 204;
const GROUND_ANCHOR_Y = 254;
const ALPHA_THRESHOLD = 8;
const BOUNDARY_SEARCH_FRACTION = 0.22;
const MAX_BOUNDARY_OCCUPANCY_RATIO = 0.035;
const pngOptions = { compressionLevel: 9, palette: false };

function alphaBounds(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) <= ALPHA_THRESHOLD) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) return undefined;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function columnOccupancy(data, width, height) {
  return Array.from({ length: width }, (_, x) => {
    let count = 0;
    for (let y = 0; y < height; y += 1) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) > ALPHA_THRESHOLD) count += 1;
    }
    return count;
  });
}

export function equalCellBoundaryAlphaCounts(data, width, height, frameCount) {
  const cuts = Array.from({ length: frameCount + 1 }, (_, index) =>
    Math.round(index * width / frameCount));
  return cuts.slice(1, -1).map((cut, index) => {
    let count = 0;
    for (let y = 0; y < height; y += 1) {
      for (const x of [cut - 1, cut]) {
        if ((data[(y * width + x) * 4 + 3] ?? 0) > ALPHA_THRESHOLD) count += 1;
      }
    }
    return { boundary: index + 1, cut, count };
  });
}

export async function sourceEqualCellBoundaryAlphaCounts(input, frameCount) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return equalCellBoundaryAlphaCounts(data, info.width, info.height, frameCount);
}

function horizontalFrameRanges(data, width, height, frameCount, input, equalCells = false) {
  if (!Number.isInteger(frameCount) || frameCount < 1 || width < frameCount * 2) {
    throw new Error(`${input} could not isolate exactly ${frameCount} horizontal frames`);
  }
  if (equalCells) {
    const cuts = Array.from({ length: frameCount + 1 }, (_, index) =>
      Math.round(index * width / frameCount));
    const occupiedBoundary = equalCellBoundaryAlphaCounts(data, width, height, frameCount)
      .find(({ count }) => count > 0);
    if (occupiedBoundary !== undefined) {
      throw new Error(
        `${input} meaningful alpha touches equal-cell boundary ${occupiedBoundary.boundary} (${occupiedBoundary.count} pixels)`,
      );
    }
    return Array.from({ length: frameCount }, (_, index) => ({
      left: cuts[index],
      width: cuts[index + 1] - cuts[index],
    }));
  }
  const occupancy = columnOccupancy(data, width, height);
  const nominalCellWidth = width / frameCount;
  const searchRadius = Math.max(1, Math.floor(nominalCellWidth * BOUNDARY_SEARCH_FRACTION));
  const maximumBoundaryOccupancy = Math.ceil(height * MAX_BOUNDARY_OCCUPANCY_RATIO);
  const cuts = [0];
  for (let index = 1; index < frameCount; index += 1) {
    const expected = Math.round(index * nominalCellWidth);
    const first = Math.max(1, expected - searchRadius);
    const last = Math.min(width - 1, expected + searchRadius);
    let best;
    for (let cut = first; cut <= last; cut += 1) {
      const left = occupancy[cut - 1] ?? height;
      const right = occupancy[cut] ?? height;
      const candidate = {
        cut,
        score: left + right,
        distance: Math.abs(cut - expected),
        maximum: Math.max(left, right),
      };
      if (
        best === undefined ||
        candidate.score < best.score ||
        (candidate.score === best.score && candidate.distance < best.distance) ||
        (candidate.score === best.score &&
          candidate.distance === best.distance &&
          candidate.cut < best.cut)
      ) {
        best = candidate;
      }
    }
    if (best === undefined || best.maximum > maximumBoundaryOccupancy) {
      throw new Error(
        `${input} could not isolate exactly ${frameCount} horizontal frames at boundary ${index}`,
      );
    }
    cuts.push(best.cut);
  }
  cuts.push(width);
  return Array.from({ length: frameCount }, (_, index) => ({
    left: cuts[index],
    width: cuts[index + 1] - cuts[index],
  }));
}

async function sourceFrames(input, frameCount, equalCells = false) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ranges = horizontalFrameRanges(data, info.width, info.height, frameCount, input, equalCells);
  return Promise.all(
    Array.from({ length: frameCount }, async (_, index) => {
      const range = ranges[index];
      const frame = await sharp(data, { raw: info })
        .extract({ left: range.left, top: 0, width: range.width, height: info.height })
        .raw()
        .toBuffer({ resolveWithObject: true });
      const bounds = alphaBounds(frame.data, frame.info.width, frame.info.height);
      if (bounds === undefined) {
        throw new Error(
          `${input} could not isolate exactly ${frameCount} horizontal frames: frame ${index} is empty`,
        );
      }
      const pixels = await sharp(frame.data, { raw: frame.info }).extract(bounds).png().toBuffer();
      return { pixels, bounds };
    }),
  );
}

function dilatedMask(alphaMask, width, height, radius) {
  const horizontal = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    let active = 0;
    for (let x = 0; x < width; x += 1) {
      const enter = x + radius;
      const leave = x - radius - 1;
      if (enter < width) active += alphaMask[y * width + enter] ?? 0;
      if (leave >= 0) active -= alphaMask[y * width + leave] ?? 0;
      if (active > 0) horizontal[y * width + x] = 1;
    }
  }
  const dilated = new Uint8Array(width * height);
  for (let x = 0; x < width; x += 1) {
    let active = 0;
    for (let y = 0; y < height; y += 1) {
      const enter = y + radius;
      const leave = y - radius - 1;
      if (enter < height) active += horizontal[enter * width + x] ?? 0;
      if (leave >= 0) active -= horizontal[leave * width + x] ?? 0;
      if (active > 0) dilated[y * width + x] = 1;
    }
  }
  return dilated;
}

async function resizedFrameWithOutline(pixels, width, height, outlineWidthPx) {
  const resized = await sharp(pixels)
    .resize(width, height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (outlineWidthPx === 0) {
    return {
      input: await sharp(resized.data, { raw: resized.info }).png(pngOptions).toBuffer(),
      width,
      height,
    };
  }
  for (let offset = 0; offset < resized.data.length; offset += 4) {
    if (
      (resized.data[offset] ?? 0) === outlinePolicy.rgb.r &&
      (resized.data[offset + 1] ?? 0) === outlinePolicy.rgb.g &&
      (resized.data[offset + 2] ?? 0) === outlinePolicy.rgb.b &&
      (resized.data[offset + 3] ?? 0) > ALPHA_THRESHOLD
    ) {
      resized.data[offset + 2] = outlinePolicy.rgb.b + 1;
    }
  }
  const outerWidth = width + outlineWidthPx * 2;
  const outerHeight = height + outlineWidthPx * 2;
  const alphaMask = new Uint8Array(outerWidth * outerHeight);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((resized.data[(y * width + x) * 4 + 3] ?? 0) > ALPHA_THRESHOLD) {
        alphaMask[(y + outlineWidthPx) * outerWidth + x + outlineWidthPx] = 1;
      }
    }
  }
  const shell = Buffer.alloc(outerWidth * outerHeight * 4);
  const dilated = dilatedMask(alphaMask, outerWidth, outerHeight, outlineWidthPx);
  for (let index = 0; index < dilated.length; index += 1) {
    if (dilated[index] === 0) continue;
    const offset = index * 4;
    shell[offset] = outlinePolicy.rgb.r;
    shell[offset + 1] = outlinePolicy.rgb.g;
    shell[offset + 2] = outlinePolicy.rgb.b;
    shell[offset + 3] = 255;
  }
  const inner = await sharp(resized.data, { raw: resized.info }).png(pngOptions).toBuffer();
  return {
    input: await sharp(shell, {
      raw: { width: outerWidth, height: outerHeight, channels: 4 },
    })
      .composite([{ input: inner, left: outlineWidthPx, top: outlineWidthPx }])
      .png(pngOptions)
      .toBuffer(),
    width: outerWidth,
    height: outerHeight,
  };
}

export async function normalizeHorizontalSheet({
  input,
  output,
  frameCount,
  targetOpaqueHeight = TARGET_OPAQUE_HEIGHT,
  maxOpaqueWidth,
  equalCells = false,
  outlineWidthPx = 0,
}) {
  const frames = await sourceFrames(input, frameCount, equalCells);
  const commonWidth = Math.max(...frames.map(({ bounds }) => bounds.width));
  const commonHeight = Math.max(...frames.map(({ bounds }) => bounds.height));
  const innerTargetHeight = targetOpaqueHeight - outlineWidthPx * 2;
  if (innerTargetHeight < 1) throw new Error(`${input} outline exceeds target opaque height`);
  const heightScale = innerTargetHeight / commonHeight;
  const widthScale = maxOpaqueWidth === undefined
    ? Number.POSITIVE_INFINITY
    : (maxOpaqueWidth - outlineWidthPx * 2) / commonWidth;
  const scale = Math.min(heightScale, widthScale);
  if (Math.round(commonWidth * scale) + outlineWidthPx * 2 > FRAME_SIZE - 2) {
    throw new Error(`${input} cannot preserve ratio with a 1px horizontal margin`);
  }
  const composites = await Promise.all(
    frames.map(async ({ pixels, bounds }, index) => {
      const innerWidth = Math.max(1, Math.round(bounds.width * scale));
      const innerHeight = Math.max(1, Math.round(bounds.height * scale));
      const outlined = await resizedFrameWithOutline(
        pixels,
        innerWidth,
        innerHeight,
        outlineWidthPx,
      );
      const left = index * FRAME_SIZE + Math.round((FRAME_SIZE - outlined.width) / 2);
      const top = GROUND_ANCHOR_Y - outlined.height;
      if (
        left <= index * FRAME_SIZE ||
        left + outlined.width >= (index + 1) * FRAME_SIZE ||
        top <= 0
      ) {
        throw new Error(`${input} frame ${index} touches a normalized cell edge`);
      }
      return {
        input: outlined.input,
        left,
        top,
      };
    }),
  );
  await mkdir(path.dirname(output), { recursive: true });
  await sharp({
    create: {
      width: frameCount * FRAME_SIZE,
      height: FRAME_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png(pngOptions)
    .toFile(output);
}

export async function prepareV2CharacterSheets(inputDir, outputDir) {
  for (const entry of sourceAnimationEntries) {
    const stem = path.basename(entry.source, '.png');
    await normalizeHorizontalSheet({
      input: path.join(inputDir, `${stem}.png`),
      output: path.join(outputDir, `${stem}.png`),
      frameCount: entry.frameCount,
      targetOpaqueHeight: entry.opaqueHeightPx,
      outlineWidthPx: entry.key.startsWith('breeder-')
        ? outlinePolicy.bossPx
        : entry.key.startsWith('poop-') || entry.key.startsWith('offleash-')
          ? outlinePolicy.regularPx
          : outlinePolicy.dogPx,
    });
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , inputDir, outputDir] = process.argv;
  if (inputDir === undefined || outputDir === undefined) {
    throw new Error('Usage: prepare-v2-character-sheets.mjs <alpha-dir> <output-dir>');
  }
  await prepareV2CharacterSheets(inputDir, outputDir);
}
