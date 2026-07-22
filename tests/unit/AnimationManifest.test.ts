import { describe, expect, it } from 'vitest';
import {
  animationEntries,
  animationEntry,
  animationFrameAt,
  isSourceAnimationEntry,
  resolveAnimationEntry,
  runtimeTextureKeys,
  validateAnimationEntry,
  type AnimationManifestEntry,
} from '../../src/game/assets/AnimationManifest';
import { animationSpriteSheetAssets } from '../../src/game/assets/assetManifest';

const requiredAnimationKeys = [
  'huchu-walk',
  'huchu-attack',
  'huchu-tail-swipe',
  'deokbae-walk',
  'deokbae-attack',
  'poop-male-walk',
  'poop-male-attack',
  'poop-female-walk',
  'poop-female-attack',
  'offleash-male-walk',
  'offleash-male-attack',
  'offleash-female-walk',
  'offleash-female-attack',
  'breeder-male-walk',
  'breeder-male-attack',
  'breeder-female-walk',
  'breeder-female-attack',
] as const;

describe('AnimationManifest', () => {
  it('declares the exact 17 V2 source sheets', () => {
    const genericEntries = animationEntries.filter(({ key }) => !key.startsWith('dog-trader-'));
    expect(genericEntries.map(({ key }) => key)).toEqual(requiredAnimationKeys);
    expect(animationEntries).toHaveLength(41);
    expect(animationEntries.filter(isSourceAnimationEntry)).toHaveLength(32);
  });

  it('exposes tail-swipe event metadata', () => {
    expect(animationEntry('huchu-tail-swipe')).toMatchObject({
      frameCount: 6,
      frameWidth: 256,
      frameHeight: 256,
      fps: 12,
      loop: false,
      eventFrame: 3,
      eventKind: 'directHit',
    });
  });

  it('clamps a non-looping animation to its last frame', () => {
    expect(animationFrameAt(animationEntry('breeder-male-attack'), 500)).toBe(5);
  });

  it('rejects an event frame outside the sheet', () => {
    const invalid = Object.assign({}, animationEntry('huchu-attack'), { eventFrame: 6 });
    expect(() => validateAnimationEntry(invalid)).toThrow('eventFrame must be inside the sheet');
  });

  it('requires source/url and mirrorOf to be mutually exclusive', () => {
    const source = animationEntry('huchu-walk');
    const mixed = { ...source, mirrorOf: 'virtual-west' } as unknown as AnimationManifestEntry;
    const missingUrl = {
      ...source,
      url: undefined,
    } as unknown as AnimationManifestEntry;
    const mirrorWithUrl = {
      key: 'virtual-east',
      action: 'walk',
      frameCount: 6,
      frameWidth: 256,
      frameHeight: 256,
      opaqueHeightPx: 204,
      fps: 10,
      loop: true,
      mirrorOf: source.key,
      url: '/invalid.png',
    } as unknown as AnimationManifestEntry;

    expect(isSourceAnimationEntry(mixed)).toBe(false);
    expect(() => validateAnimationEntry(mixed))
      .toThrow('exactly one of source/url or mirrorOf');
    expect(() => validateAnimationEntry(missingUrl))
      .toThrow('source animations require source and url');
    expect(() => validateAnimationEntry(mirrorWithUrl))
      .toThrow('exactly one of source/url or mirrorOf');
  });

  it('keeps mirror rows logical and loads only source textures', () => {
    const mirror: AnimationManifestEntry = {
      key: 'virtual-east',
      action: 'attack',
      frameCount: 8,
      frameWidth: 256,
      frameHeight: 256,
      opaqueHeightPx: 204,
      fps: 10,
      loop: false,
      eventFrame: 5,
      eventKind: 'projectileRelease',
      direction: 'east',
      mirrorOf: 'source-west',
      eventSocket: { x: 92, y: 130 },
    };

    expect(isSourceAnimationEntry(mirror)).toBe(false);
    expect(runtimeTextureKeys([animationEntry('huchu-walk'), mirror])).toEqual(['huchu-walk']);
    expect(resolveAnimationEntry(
      { ...mirror, mirrorOf: 'huchu-walk' },
      [animationEntry('huchu-walk'), mirror],
    )).toEqual({
      source: animationEntry('huchu-walk'),
      flipX: true,
    });
  });

  it('maps only concrete manifest rows into preload assets', () => {
    expect(animationSpriteSheetAssets).toHaveLength(32);
    expect(animationSpriteSheetAssets.every(({ frameWidth, frameHeight }) =>
      frameWidth === 256 && frameHeight === 256)).toBe(true);
  });
});
