import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeHorizontalSheet } from './prepare-v2-character-sheets.mjs';
import { sourceAnimationEntries } from './manifest.mjs';

export const DOG_TRADER_SOURCE_ENTRIES = Object.freeze(
  sourceAnimationEntries.filter(({ key }) => key.startsWith('dog-trader-')),
);

export async function normalizeDogTraderSheet({ input, output, frameCount, kind }) {
  if (kind !== 'human' && kind !== 'truck') throw new Error(`Unknown dog trader sheet kind: ${kind}`);
  await normalizeHorizontalSheet({
    input,
    output,
    frameCount,
    targetOpaqueHeight: kind === 'human' ? 204 : 150,
    maxOpaqueWidth: kind === 'truck' ? 240 : undefined,
    equalCells: true,
    outlineWidthPx: kind === 'human' ? 5 : 4,
  });
}

export async function prepareDogTraderSheets(inputDir, outputDir) {
  if (DOG_TRADER_SOURCE_ENTRIES.length !== 15) {
    throw new Error(`Expected 15 dog trader source entries, got ${DOG_TRADER_SOURCE_ENTRIES.length}`);
  }
  for (const entry of DOG_TRADER_SOURCE_ENTRIES) {
    const stem = path.basename(entry.source, '.png');
    await normalizeDogTraderSheet({
      input: path.join(inputDir, `${stem}.png`),
      output: path.join(outputDir, `${stem}.png`),
      frameCount: entry.frameCount,
      kind: entry.action === 'truckRoll' ? 'truck' : 'human',
    });
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , inputDir, outputDir] = process.argv;
  if (inputDir === undefined || outputDir === undefined) {
    throw new Error('Usage: prepare-dog-trader-sheets.mjs <input-dir> <output-dir>');
  }
  await prepareDogTraderSheets(inputDir, outputDir);
}
