import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Asset build scripts are executable ESM JavaScript without declaration files.
import { buildAssets } from '../../scripts/assets/build-assets.mjs';
// @ts-expect-error Asset verifier is executable ESM JavaScript without declaration files.
import { percentileFromByteHistogram, verifyApprovedAttackRows, verifyGeneratedApprovals, verifyRuntimeFreshness } from '../../scripts/assets/verify-assets.mjs';

describe('asset approval validation', () => {
  it('승인된 generated source가 바뀌면 실패한다', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-asset-approval-'));
    const source = 'assets/source/generated/approved.png';
    const approved = Buffer.from('approved-generated-asset');
    await mkdir(path.join(root, path.dirname(source)), { recursive: true });
    await writeFile(path.join(root, source), approved);
    await writeFile(
      path.join(root, 'assets/source/generated-approvals.json'),
      `${JSON.stringify(
        [
          {
            source,
            sha256: createHash('sha256').update(approved).digest('hex'),
          },
        ],
        null,
        2,
      )}\n`,
    );

    expect(await verifyGeneratedApprovals(root)).toEqual([]);
    await writeFile(path.join(root, source), Buffer.from('tampered-generated-asset'));
    expect(await verifyGeneratedApprovals(root)).toEqual([
      expect.objectContaining({ source, reason: 'SHA-256 differs from generated approval' }),
    ]);
  });
});

describe('runtime asset freshness', () => {
  async function freshOutputRoot() {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-asset-runtime-'));
    await buildAssets({ outputRoot: root });
    expect(await verifyRuntimeFreshness(root)).toEqual([]);
    return root;
  }

  async function changeRgbaPixel(file: string, x: number, y: number) {
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const offset = (y * info.width + x) * 4;
    data[offset] = 255;
    data[offset + 1] = 0;
    data[offset + 2] = 0;
    data[offset + 3] = 255;
    await sharp(data, { raw: info }).png({ compressionLevel: 9, palette: false }).toFile(file);
  }

  it.each(['enemy-poop-male', 'enemy-poop-female'])(
    '%s attack edit와 runtime bottom row가 다르면 실패한다',
    async (key) => {
      const root = await freshOutputRoot();
      const relative = `public/assets/characters/${key}.png`;
      await changeRgbaPixel(path.join(root, relative), 0, 300);

      expect(await verifyRuntimeFreshness(root)).toContainEqual(
        expect.objectContaining({
          file: relative,
          reason: 'runtime output is stale for current sources',
        }),
      );
    },
  );

  it('shelter source와 runtime RGBA가 다르면 실패한다', async () => {
    const root = await freshOutputRoot();
    const relative = 'public/assets/shelter/shelter-states.png';
    await changeRgbaPixel(path.join(root, relative), 0, 0);

    expect(await verifyRuntimeFreshness(root)).toContainEqual(
      expect.objectContaining({
        file: relative,
        reason: 'runtime output is stale for current sources',
      }),
    );
  });

  it('map composite와 committed WebP가 다르면 실패한다', async () => {
    const root = await freshOutputRoot();
    const relative = 'public/assets/map/map-background.webp';
    const file = path.join(root, relative);
    const bytes = await readFile(file);
    const lastIndex = bytes.length - 1;
    if (lastIndex < 0) throw new Error('map build produced an empty WebP');
    bytes[lastIndex] = (bytes[lastIndex] ?? 0) ^ 1;
    await writeFile(file, bytes);

    expect(await verifyRuntimeFreshness(root)).toContainEqual(
      expect.objectContaining({
        file: relative,
        reason: 'runtime output is stale for current sources',
      }),
    );
  });
});

describe('approved attack rows', () => {
  const attacks = [
    {
      base: 'assets/source/characters/enemy-poop-male-base.png',
      edit: 'assets/source/generated/enemy-poop-male-throw-edit.png',
      output: 'public/assets/characters/enemy-poop-male.png',
    },
    {
      base: 'assets/source/characters/enemy-poop-female-base.png',
      edit: 'assets/source/generated/enemy-poop-female-throw-edit.png',
      output: 'public/assets/characters/enemy-poop-female.png',
    },
  ] as const;

  async function resizedRawRow(source: string, top: number) {
    return sharp(source)
      .extract({ left: 0, top, width: 1536, height: 512 })
      .ensureAlpha()
      .resize(768, 256, { kernel: sharp.kernel.lanczos3 })
      .raw()
      .toBuffer();
  }

  async function writeRuntimeSheet(
    root: string,
    entry: (typeof attacks)[number],
    attackTop: number,
  ) {
    const [walk, attack] = await Promise.all([
      resizedRawRow(entry.base, 0),
      resizedRawRow(entry.edit, attackTop),
    ]);
    const output = path.join(root, entry.output);
    await mkdir(path.dirname(output), { recursive: true });
    await sharp(Buffer.concat([walk, attack]), {
      raw: { width: 768, height: 512, channels: 4 },
    })
      .png({ compressionLevel: 9, palette: false })
      .toFile(output);
  }

  it('승인 edit의 다른 행으로 runtime attack row를 교체하면 실패한다', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-approved-attack-'));
    for (const entry of attacks) await writeRuntimeSheet(root, entry, 512);
    expect(await verifyApprovedAttackRows(root)).toEqual([]);

    await writeRuntimeSheet(root, attacks[0], 0);

    expect(await verifyApprovedAttackRows(root)).toContainEqual({
      file: attacks[0].output,
      reason: 'approved attack row changed',
    });
  });
});

describe('map WebP error statistics', () => {
  it('256-bin histogram에서 기존 index 방식의 p99를 계산한다', () => {
    const histogram = new Uint32Array(256);
    histogram[0] = 990;
    histogram[255] = 10;

    expect(percentileFromByteHistogram(histogram, 1_000, 0.99)).toBe(255);
  });
});
