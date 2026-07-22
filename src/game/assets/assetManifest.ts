import { AssetKeys } from './AssetKeys';
import { animationEntries, isSourceAnimationEntry } from './AnimationManifest';

const withBaseUrl = (url: string): string =>
  `${import.meta.env.BASE_URL}${url.replace(/^\/+/, '')}`;

export const imageAssets = [
  { key: AssetKeys.map, url: withBaseUrl('/assets/map/map-background.webp') },
] as const;

export const spriteSheetAssets = [
  {
    key: AssetKeys.trader,
    url: withBaseUrl('/assets/characters/enemy-trader.png'),
    frameWidth: 192,
    frameHeight: 256,
  },
] as const;

export const animationSpriteSheetAssets = animationEntries
  .filter(isSourceAnimationEntry)
  .map(({ key, url, frameWidth, frameHeight }) => ({
    key,
    url: withBaseUrl(url),
    frameWidth,
    frameHeight,
  }));

export const requiredTextureKeys = [
  ...imageAssets.map(({ key }) => key),
  ...spriteSheetAssets.map(({ key }) => key),
  ...animationSpriteSheetAssets.map(({ key }) => key),
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
