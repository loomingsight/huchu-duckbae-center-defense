import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const FRAME_SIZE = 256;
const TAIL_FRAME_COUNT = 4;
const TAIL_ROOT_X = 202;
const TAIL_ROOT_Y = 150;
const TAIL_MAX_WIDTH = 126;
const TAIL_MAX_HEIGHT = 126;

export async function normalizeTailOverlay(input, output) {
  const metadata = await sharp(input).metadata();
  if (
    metadata.width === undefined
    || metadata.height === undefined
    || metadata.width < TAIL_FRAME_COUNT
  ) {
    throw new Error('Tail source must contain four horizontal cells');
  }
  const composites = [];
  for (let index = 0; index < TAIL_FRAME_COUNT; index += 1) {
    const left = Math.round(index * metadata.width / TAIL_FRAME_COUNT);
    const right = Math.round((index + 1) * metadata.width / TAIL_FRAME_COUNT);
    const cell = await sharp(input)
      .extract({ left, top: 0, width: right - left, height: metadata.height })
      .png()
      .toBuffer();
    const { data: trimmed, info: trimmedInfo } = await sharp(cell)
      .ensureAlpha()
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 2 })
      .png()
      .toBuffer({ resolveWithObject: true });
    const scale = Math.min(
      TAIL_MAX_WIDTH / trimmedInfo.width,
      TAIL_MAX_HEIGHT / trimmedInfo.height,
    );
    const width = Math.max(1, Math.round(trimmedInfo.width * scale));
    const height = Math.max(1, Math.round(trimmedInfo.height * scale));
    const { data: normalized, info } = await sharp(trimmed)
      .resize(width, height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .png({ compressionLevel: 9, palette: false })
      .toBuffer({ resolveWithObject: true });
    composites.push({
      input: normalized,
      left: index * FRAME_SIZE + TAIL_ROOT_X - info.width + 1,
      top: TAIL_ROOT_Y - Math.round(info.height / 2),
    });
  }
  await mkdir(path.dirname(output), { recursive: true });
  await sharp({
    create: {
      width: FRAME_SIZE * TAIL_FRAME_COUNT,
      height: FRAME_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9, palette: false })
    .toFile(output);
}

export async function buildTailSwipeBody(input, output) {
  const metadata = await sharp(input).metadata();
  if (metadata.width !== FRAME_SIZE * 6 || metadata.height !== FRAME_SIZE) {
    throw new Error('Huchu tail body source must be a 1536x256 sheet');
  }
  const masks = Array.from({ length: 6 }, (_, index) => (
    `<g transform="translate(${index * FRAME_SIZE},0)">`
      + '<ellipse fill="white" cx="61" cy="87" rx="52" ry="50"/>'
      + '<rect fill="white" x="0" y="30" width="80" height="90"/>'
      + '<path fill="white" d="M78 101C99 106 118 108 139 114L137 133C116 130 99 126 80 124Z"/>'
      + '</g>'
  )).join('');
  const mask = Buffer.from(
    `<svg width="${FRAME_SIZE * 6}" height="${FRAME_SIZE}" xmlns="http://www.w3.org/2000/svg">${masks}</svg>`,
  );
  await mkdir(path.dirname(output), { recursive: true });
  await sharp(input)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-out' }])
    .png({ compressionLevel: 9, palette: false })
    .toFile(output);
}

export async function prepareTailSwipeAssets({
  overlayInput,
  overlayOutput,
  bodyInput,
  bodyOutput,
}) {
  await Promise.all([
    normalizeTailOverlay(overlayInput, overlayOutput),
    buildTailSwipeBody(bodyInput, bodyOutput),
  ]);
}

export async function main(args = process.argv.slice(2)) {
  const [
    overlayInput = 'tmp/imagegen/tail-swipe/alpha.png',
    overlayOutput = 'assets/source/generated/v2/huchu-tail-overlay.png',
    bodyInput = 'assets/source/generated/v2/huchu-attack.png',
    bodyOutput = 'assets/source/generated/v2/huchu-tail-swipe.png',
  ] = args;
  await prepareTailSwipeAssets({ overlayInput, overlayOutput, bodyInput, bodyOutput });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
