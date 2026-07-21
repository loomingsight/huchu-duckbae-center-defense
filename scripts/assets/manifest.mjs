import { readFileSync } from 'node:fs';

export const animationManifest = JSON.parse(
  readFileSync(new URL('../../src/game/assets/character-animations.json', import.meta.url), 'utf8'),
);

const hasOwn = (entry, key) => Object.prototype.hasOwnProperty.call(entry, key);

export const isSourceAnimationEntry = (entry) =>
  typeof entry?.source === 'string' &&
  typeof entry?.url === 'string' &&
  !hasOwn(entry, 'mirrorOf');

export const isMirrorAnimationEntry = (entry) =>
  typeof entry?.mirrorOf === 'string' &&
  !hasOwn(entry, 'source') &&
  !hasOwn(entry, 'url');

export function validateAnimationManifestEntry(entry) {
  const hasSource = hasOwn(entry, 'source');
  const hasUrl = hasOwn(entry, 'url');
  const hasMirror = hasOwn(entry, 'mirrorOf');
  if (hasMirror && (hasSource || hasUrl)) {
    throw new Error(`${entry.key}: exactly one of source/url or mirrorOf is required`);
  }
  if (hasMirror) {
    if (!isMirrorAnimationEntry(entry) || entry.mirrorOf.length === 0) {
      throw new Error(`${entry.key}: mirror animations require mirrorOf`);
    }
    return;
  }
  if (!isSourceAnimationEntry(entry) || entry.source.length === 0 || entry.url.length === 0) {
    throw new Error(`${entry.key}: source animations require source and url`);
  }
}

animationManifest.forEach(validateAnimationManifestEntry);
export const sourceAnimationEntries = animationManifest.filter(isSourceAnimationEntry);

export const outlinePolicy = Object.freeze({
  rgb: Object.freeze({ r: 47, g: 37, b: 31 }),
  dogPx: 6,
  regularPx: 6,
  bossPx: 5,
  shelterPx: 5,
});

export const characterSheets = [
  { key: 'enemy-trader', source: 'assets/source/characters/enemy-trader.png' },
];

export const characterOutput = (key) => `public/assets/characters/${key}.png`;

export const mapAsset = {
  source: 'assets/source/map/map-v2-simple.svg',
  output: 'public/assets/map/map-background.webp',
  width: 1080,
  height: 1920,
};

export const shelterAsset = {
  source: 'assets/source/generated/v2/shelter-states.png',
  output: 'public/assets/shelter/shelter-states.png',
  frameCount: 4,
  cellWidth: 256,
  cellHeight: 256,
  anchorX: 128,
  anchorY: 254,
  opaqueHeightPx: 204,
};
