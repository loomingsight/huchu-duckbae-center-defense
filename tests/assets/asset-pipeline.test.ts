import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Asset build scripts are executable ESM JavaScript without declaration files.
import { buildShelter } from '../../scripts/assets/build-assets.mjs';

const characters = [
  'huchu',
  'deokbae',
  'enemy-poop-male',
  'enemy-poop-female',
  'enemy-offleash-male',
  'enemy-offleash-female',
  'enemy-trader',
  'enemy-breeder-male',
  'enemy-breeder-female',
];

describe('runtime assets', () => {
  it.each(characters)('%s는 4×2 RGBA 시트다', async (name) => {
    const meta = await sharp(`public/assets/characters/${name}.png`).metadata();
    expect(meta).toMatchObject({ width: 768, height: 512, channels: 4, format: 'png' });
  });

  it('보호소는 4×1 RGBA 시트다', async () => {
    const meta = await sharp('public/assets/shelter/shelter-states.png').metadata();
    expect(meta).toMatchObject({ width: 1024, height: 256, channels: 4, format: 'png' });
  });

  it('보호소 원본의 네 열을 각각 trim해 빌드한다', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-shelter-build-'));
    await expect(buildShelter(path.join(root, 'shelter-states.png'))).resolves.toBeUndefined();
  });

  it('맵은 승인 해상도의 WebP다', async () => {
    const meta = await sharp('public/assets/map/map-background.webp').metadata();
    expect(meta).toMatchObject({ width: 941, height: 1672, format: 'webp' });
  });
});
