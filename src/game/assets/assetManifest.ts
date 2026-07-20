import { AssetKeys } from './AssetKeys';

export const imageAssets = [
  { key: AssetKeys.map, url: '/assets/map/map-background.webp' },
] as const;

export const spriteSheetAssets = [
  {
    key: AssetKeys.shelter,
    url: '/assets/shelter/shelter-states.png',
    frameWidth: 256,
    frameHeight: 256,
  },
  {
    key: AssetKeys.huchu,
    url: '/assets/characters/huchu.png',
    frameWidth: 192,
    frameHeight: 256,
  },
  {
    key: AssetKeys.deokbae,
    url: '/assets/characters/deokbae.png',
    frameWidth: 192,
    frameHeight: 256,
  },
  {
    key: AssetKeys.poopMale,
    url: '/assets/characters/enemy-poop-male.png',
    frameWidth: 192,
    frameHeight: 256,
  },
  {
    key: AssetKeys.poopFemale,
    url: '/assets/characters/enemy-poop-female.png',
    frameWidth: 192,
    frameHeight: 256,
  },
  {
    key: AssetKeys.offLeashMale,
    url: '/assets/characters/enemy-offleash-male.png',
    frameWidth: 192,
    frameHeight: 256,
  },
  {
    key: AssetKeys.offLeashFemale,
    url: '/assets/characters/enemy-offleash-female.png',
    frameWidth: 192,
    frameHeight: 256,
  },
  {
    key: AssetKeys.trader,
    url: '/assets/characters/enemy-trader.png',
    frameWidth: 192,
    frameHeight: 256,
  },
  {
    key: AssetKeys.breederMale,
    url: '/assets/characters/enemy-breeder-male.png',
    frameWidth: 192,
    frameHeight: 256,
  },
  {
    key: AssetKeys.breederFemale,
    url: '/assets/characters/enemy-breeder-female.png',
    frameWidth: 192,
    frameHeight: 256,
  },
] as const;

export const requiredTextureKeys = [
  ...imageAssets.map(({ key }) => key),
  ...spriteSheetAssets.map(({ key }) => key),
] as const;

export function requiredAssetFailureCount(
  requiredKeys: readonly string[],
  textureExists: (key: string) => boolean,
  loadFailures: number | Iterable<string>,
): number {
  if (typeof loadFailures === 'number') {
    const missingTextures = requiredKeys.reduce(
      (count, key) => count + (textureExists(key) ? 0 : 1),
      0,
    );
    return Math.max(loadFailures, missingTextures);
  }
  const required = new Set(requiredKeys);
  const failures = new Set([...loadFailures].filter((key) => required.has(key)));
  requiredKeys.forEach((key) => {
    if (!textureExists(key)) failures.add(key);
  });
  return failures.size;
}
