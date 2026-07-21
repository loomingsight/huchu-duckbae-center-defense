import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Asset build scripts are executable ESM JavaScript without declaration files.
import { buildAssets, buildCharacter } from '../../scripts/assets/build-assets.mjs';
// @ts-expect-error Asset verifier is executable ESM JavaScript without declaration files.
import { expectedLiveGeneratedSources, measureOutlineAt390, percentileFromByteHistogram, verifyAnimationSheet, verifyGeneratedApprovals, verifyRequiredGeneratedSourceCoverage, verifyRequiredGeneratedSourceEvidence, verifyRuntimeFreshness, verifyV2ShelterSheet } from '../../scripts/assets/verify-assets.mjs';
import { SHELTER_V2 } from '../../src/game/assets/assetManifest';
import { HUCHU_PRESENTATION } from '../../src/game/presentation/PresentationConfig';
// @ts-expect-error Asset manifest scripts are executable ESM JavaScript without declaration files.
import { characterOutput, characterSheets, shelterAsset, sourceAnimationEntries } from '../../scripts/assets/manifest.mjs';

const SHARP_INTEGRATION_TIMEOUT_MS = 15_000;
const V2_CANDIDATES_PRESENT = [
  ...sourceAnimationEntries.map(({ source }: { source: string }) => source),
  shelterAsset.source,
].every(existsSync);

async function changeRgbaPixel(file: string, x: number, y: number) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * 4;
  data[offset] = 255;
  data[offset + 1] = 0;
  data[offset + 2] = 0;
  data[offset + 3] = 255;
  await sharp(data, { raw: info }).png({ compressionLevel: 9, palette: false }).toFile(file);
}

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

  it('live manifest source 하나라도 approval ledger에서 빠지면 strict coverage가 실패한다', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-asset-approval-coverage-'));
    const requiredSources = [
      'assets/source/generated/v2/huchu-walk.png',
      'assets/source/generated/v2/deokbae-walk.png',
    ];
    await mkdir(path.join(root, 'assets/source/generated/v2'), { recursive: true });
    await Promise.all(requiredSources.map(async (source, index) => {
      await writeFile(path.join(root, source), Buffer.from(`candidate-${index}`));
    }));
    const rows = await Promise.all(requiredSources.map(async (source) => ({
      source,
      sha256: createHash('sha256').update(await readFile(path.join(root, source))).digest('hex'),
    })));
    await writeFile(
      path.join(root, 'assets/source/generated-approvals.json'),
      `${JSON.stringify(rows.slice(0, 1), null, 2)}\n`,
    );
    await writeFile(
      path.join(root, 'assets/source/provenance.json'),
      `${JSON.stringify(rows, null, 2)}\n`,
    );

    expect(await verifyRequiredGeneratedSourceCoverage(root, { requiredSources })).toEqual([
      {
        source: requiredSources[1],
        ledger: 'generated-approvals',
        reason: 'required generated source is missing from approval ledger',
      },
    ]);
  });

  it('live manifest source 하나라도 provenance ledger에서 빠지면 strict coverage가 실패한다', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-asset-provenance-coverage-'));
    const requiredSources = [
      'assets/source/generated/v2/huchu-attack.png',
      'assets/source/generated/dog-trader/human-walk-north.png',
    ];
    await mkdir(path.join(root, 'assets/source/generated/v2'), { recursive: true });
    await mkdir(path.join(root, 'assets/source/generated/dog-trader'), { recursive: true });
    await Promise.all(requiredSources.map(async (source, index) => {
      await writeFile(path.join(root, source), Buffer.from(`candidate-${index}`));
    }));
    const rows = await Promise.all(requiredSources.map(async (source) => ({
      source,
      sha256: createHash('sha256').update(await readFile(path.join(root, source))).digest('hex'),
    })));
    await writeFile(
      path.join(root, 'assets/source/generated-approvals.json'),
      `${JSON.stringify(rows, null, 2)}\n`,
    );
    await writeFile(
      path.join(root, 'assets/source/provenance.json'),
      `${JSON.stringify(rows.slice(1), null, 2)}\n`,
    );

    expect(await verifyRequiredGeneratedSourceCoverage(root, { requiredSources })).toEqual([
      {
        source: requiredSources[0],
        ledger: 'provenance',
        reason: 'required generated source is missing from provenance ledger',
      },
    ]);
  });

  it('strict coverage의 기본 required set은 live source 32개와 shelter 하나다', () => {
    const requiredSources = expectedLiveGeneratedSources();
    expect(requiredSources).toHaveLength(33);
    expect(new Set(requiredSources).size).toBe(33);
    expect(requiredSources).toContain('assets/source/generated/v2/shelter-states.png');
    expect(requiredSources).not.toContain(expect.stringContaining('public/'));
  });

  it('required approval evidence의 schema와 review artifact hash를 fail-closed 검증한다', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-asset-review-evidence-'));
    const source = 'assets/source/generated/v2/huchu-walk.png';
    const reviewArtifact = 'assets/review/v2-candidate.png';
    const sourceBytes = Buffer.from('generated-source');
    const reviewBytes = Buffer.from('review-evidence');
    await mkdir(path.join(root, path.dirname(source)), { recursive: true });
    await mkdir(path.join(root, path.dirname(reviewArtifact)), { recursive: true });
    await writeFile(path.join(root, source), sourceBytes);
    await writeFile(path.join(root, reviewArtifact), reviewBytes);
    const sha256 = createHash('sha256').update(sourceBytes).digest('hex');
    const reviewSha256 = createHash('sha256').update(reviewBytes).digest('hex');
    const approval = {
      source,
      sha256,
      approvedBy: 'jadon',
      approvedAt: '2026-07-21T00:00:00.000Z',
      decisionId: 'visual-review-2026-07-21',
      reviewArtifact,
      reviewSha256,
    };
    const provenance = {
      source,
      sha256,
      provider: 'openai-imagegen',
      references: [],
      generatedAt: '2026-07-20',
      approvalDecisionId: approval.decisionId,
      approvedBy: approval.approvedBy,
      approvedAt: approval.approvedAt,
      reviewArtifact,
      reviewSha256,
    };
    await writeFile(
      path.join(root, 'assets/source/generated-approvals.json'),
      `${JSON.stringify([approval], null, 2)}\n`,
    );
    await writeFile(
      path.join(root, 'assets/source/provenance.json'),
      `${JSON.stringify([provenance], null, 2)}\n`,
    );

    await expect(verifyRequiredGeneratedSourceEvidence(root, { requiredSources: [source] }))
      .resolves.toEqual([]);
    await writeFile(path.join(root, reviewArtifact), Buffer.from('changed-review-evidence'));
    await expect(verifyRequiredGeneratedSourceEvidence(root, { requiredSources: [source] }))
      .resolves.toEqual([
        expect.objectContaining({
          source,
          ledger: 'generated-approvals',
          reason: 'review artifact SHA-256 differs from approval evidence',
        }),
      ]);

    await writeFile(path.join(root, reviewArtifact), reviewBytes);
    await writeFile(
      path.join(root, 'assets/source/provenance.json'),
      `${JSON.stringify([{
        ...provenance,
        generatedAt: '2026-07-20T00:00:00.000Z',
      }], null, 2)}\n`,
    );
    await expect(verifyRequiredGeneratedSourceEvidence(root, { requiredSources: [source] }))
      .resolves.toEqual([
        expect.objectContaining({
          source,
          ledger: 'provenance',
          reason: 'generatedAt must be an ISO date',
        }),
      ]);
  });
});

describe('legacy runtime freshness', () => {
  it('V2 후보 유무와 무관하게 legacy character mutation을 검사한다', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-legacy-runtime-'));
    for (const entry of characterSheets) {
      await buildCharacter(entry, path.join(root, characterOutput(entry.key)));
    }
    const legacyOutputs = new Set(characterSheets.map(({ key }: { key: string }) =>
      characterOutput(key)));
    expect((await verifyRuntimeFreshness(root)).filter(({ file }: { file: string }) =>
      legacyOutputs.has(file))).toEqual([]);

    const relative = characterOutput(characterSheets[0]!.key);
    await changeRgbaPixel(path.join(root, relative), 0, 0);

    expect(await verifyRuntimeFreshness(root)).toContainEqual(
      expect.objectContaining({
        file: relative,
        reason: 'runtime output is stale for current sources',
      }),
    );
  }, SHARP_INTEGRATION_TIMEOUT_MS);
});

describe.skipIf(!V2_CANDIDATES_PRESENT)(
  'runtime asset freshness [V2 character/shelter candidates missing]',
  () => {
  async function freshOutputRoot() {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-asset-runtime-'));
    await buildAssets({ outputRoot: root });
    expect(await verifyRuntimeFreshness(root)).toEqual([]);
    return root;
  }

  it.each([
    { key: 'huchu-attack', relative: 'public/assets/characters/huchu/attack.png' },
    { key: 'poop-female-attack', relative: 'public/assets/characters/poop-guardian/female-attack.png' },
  ])(
    '$key source와 runtime sheet가 다르면 실패한다',
    async ({ relative }) => {
      const root = await freshOutputRoot();
      await changeRgbaPixel(path.join(root, relative), 0, 0);

      expect(await verifyRuntimeFreshness(root)).toContainEqual(
        expect.objectContaining({
          file: relative,
          reason: 'runtime output is stale for current sources',
        }),
      );
    },
    SHARP_INTEGRATION_TIMEOUT_MS,
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
  }, SHARP_INTEGRATION_TIMEOUT_MS);

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
  }, SHARP_INTEGRATION_TIMEOUT_MS);
  },
);

describe('map WebP error statistics', () => {
  it('256-bin histogram에서 기존 index 방식의 p99를 계산한다', () => {
    const histogram = new Uint32Array(256);
    histogram[0] = 990;
    histogram[255] = 10;

    expect(percentileFromByteHistogram(histogram, 1_000, 0.99)).toBe(255);
  });
});

describe('V2 sheet structural verification', () => {
  async function writeStrictSheet(
    file: string,
    frameCount: number,
    distinct = false,
    options: {
      height?: number;
      top?: number;
      leftAt?: (index: number) => number;
      omitFrame?: number;
    } = {},
  ) {
    const height = options.height ?? 204;
    const composites = Array.from({ length: frameCount }, (_, index) => ({
      input: Buffer.from(
        `<svg width="100" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="${height}" fill="rgb(${distinct ? 20 + index : 20},80,120)"/></svg>`,
      ),
      left: index * 256 + (options.leftAt?.(index) ?? 78),
      top: options.top ?? 50,
    })).filter((_, index) => index !== options.omitFrame);
    await sharp({ create: { width: frameCount * 256, height: 256, channels: 4, background: 'transparent' } })
      .composite(composites)
      .png()
      .toFile(file);
  }

  it('accepts a normalized source sheet and rejects alpha touching an edge', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-v2-verify-'));
    const file = path.join(root, 'walk.png');
    const entry = {
      key: 'fixture-walk', action: 'walk', source: 'walk.png', url: '/walk.png',
      frameCount: 6, frameWidth: 256, frameHeight: 256, opaqueHeightPx: 204,
      fps: 10, loop: true,
    };
    await writeStrictSheet(file, 6);
    await expect(verifyAnimationSheet(entry, { file })).resolves.toBeUndefined();

    const edgeFile = path.join(root, 'edge.png');
    await sharp(file).composite([{ input: Buffer.from('<svg width="1" height="1" xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1" fill="red"/></svg>'), left: 0, top: 0 }]).png().toFile(edgeFile);
    await expect(verifyAnimationSheet(entry, { file: edgeFile })).rejects.toThrow('alpha touches frame edge');
  });

  it('rejects empty, undersized, anchor-drifted, and center-drifted frames', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-v2-invariants-'));
    const entry = {
      key: 'fixture-walk', action: 'walk', source: 'walk.png', url: '/walk.png',
      frameCount: 6, frameWidth: 256, frameHeight: 256, opaqueHeightPx: 204,
      fps: 10, loop: true,
    };
    const empty = path.join(root, 'empty.png');
    await writeStrictSheet(empty, 6, false, { omitFrame: 5 });
    await expect(verifyAnimationSheet(entry, { file: empty })).rejects.toThrow('empty frame 5');

    const undersized = path.join(root, 'undersized.png');
    await writeStrictSheet(undersized, 6, false, { height: 190, top: 64 });
    await expect(verifyAnimationSheet(entry, { file: undersized })).rejects.toThrow('occupancy must be 75-85%');

    const anchor = path.join(root, 'anchor.png');
    await writeStrictSheet(anchor, 6, false, { top: 45 });
    await expect(verifyAnimationSheet(entry, { file: anchor })).rejects.toThrow('foot anchor must be 254±2px');

    const center = path.join(root, 'center.png');
    await writeStrictSheet(center, 6, false, { leftAt: (index) => index === 5 ? 82 : 78 });
    await expect(verifyAnimationSheet(entry, { file: center })).rejects.toThrow('center spread exceeds 3px');
  });

  it('rejects attack metadata that drifts from the core timing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-v2-timing-'));
    const file = path.join(root, 'attack.png');
    await writeStrictSheet(file, 6);
    const entry = {
      key: 'fixture-attack', action: 'attack', source: 'attack.png', url: '/attack.png',
      frameCount: 6, frameWidth: 256, frameHeight: 256, opaqueHeightPx: 204,
      fps: 10, loop: false, eventFrame: 3, eventKind: 'directHit',
    };
    await expect(verifyAnimationSheet(entry, { file })).rejects.toThrow('event timing must match core timing');
  });

  it('verifies four distinct shelter states and the 390/540 fit height', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-v2-shelter-'));
    const file = path.join(root, 'shelter.png');
    await writeStrictSheet(file, 4, true);
    await expect(verifyV2ShelterSheet({ file, sourceFile: file })).resolves.toBeUndefined();

    const renderedOpaqueHeight =
      (HUCHU_PRESENTATION.shelterOpaqueHeightLogical / SHELTER_V2.opaqueHeightPx) *
      (390 / HUCHU_PRESENTATION.logicalWidth) *
      SHELTER_V2.opaqueHeightPx;
    expect(Array.from({ length: 4 }, () => renderedOpaqueHeight)).toEqual([
      expect.closeTo(72.22, 2),
      expect.closeTo(72.22, 2),
      expect.closeTo(72.22, 2),
      expect.closeTo(72.22, 2),
    ]);
    expect(renderedOpaqueHeight).toBeGreaterThanOrEqual(68);
    expect(renderedOpaqueHeight).toBeLessThanOrEqual(74);

    const duplicate = path.join(root, 'duplicate-shelter.png');
    await writeStrictSheet(duplicate, 4);
    await expect(verifyV2ShelterSheet({ file: duplicate, sourceFile: duplicate }))
      .rejects.toThrow('four distinct pixel hashes');
  });

  it('measures a 6px dog rim as 1.5-2px at the 390px FIT scale', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-outline-'));
    const file = path.join(root, 'outline.png');
    const frame = Buffer.from(
      '<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg"><rect x="78" y="50" width="100" height="204" fill="rgb(47,37,31)"/><rect x="84" y="56" width="88" height="192" fill="#f1d7a5"/></svg>',
    );
    await sharp(frame).ensureAlpha().png().toFile(file);

    const outline = await measureOutlineAt390(file, {
      frameCount: 1,
      logicalOpaqueHeight: 72,
      sourceOpaqueHeight: 204,
    });
    expect(outline).toBeGreaterThanOrEqual(1.5);
    expect(outline).toBeLessThanOrEqual(2);
  });

  it('does not misclassify dark clothing as a canonical outline', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-dark-clothing-'));
    const file = path.join(root, 'dark-clothing.png');
    await sharp(Buffer.from(
      '<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg"><rect x="78" y="50" width="100" height="204" fill="#202020"/></svg>',
    )).ensureAlpha().png().toFile(file);

    await expect(measureOutlineAt390(file, {
      frameCount: 1,
      logicalOpaqueHeight: 100,
      sourceOpaqueHeight: 204,
    })).rejects.toThrow('canonical outline needs 32 valid scanlines');
  });

  it('rejects canonical lines disconnected from the opaque inner artwork', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-disconnected-outline-'));
    const file = path.join(root, 'disconnected-outline.png');
    await sharp(Buffer.from(
      '<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg"><rect x="78" y="50" width="1" height="204" fill="rgb(47,37,31)"/><rect x="177" y="50" width="1" height="204" fill="rgb(47,37,31)"/><rect x="84" y="50" width="88" height="204" fill="#f1d7a5"/></svg>',
    )).ensureAlpha().png().toFile(file);

    await expect(measureOutlineAt390(file, {
      frameCount: 1,
      logicalOpaqueHeight: 72,
      sourceOpaqueHeight: 204,
    })).rejects.toThrow('frame 0 canonical outline needs 32 valid scanlines');
  });

  it('rejects a connected side-only rim with no canonical top or bottom coverage', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-side-only-outline-'));
    const file = path.join(root, 'side-only-outline.png');
    await sharp(Buffer.from(
      '<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg"><rect x="78" y="50" width="6" height="204" fill="rgb(47,37,31)"/><rect x="84" y="50" width="88" height="204" fill="#f1d7a5"/><rect x="172" y="50" width="6" height="204" fill="rgb(47,37,31)"/></svg>',
    )).ensureAlpha().png().toFile(file);

    await expect(measureOutlineAt390(file, {
      frameCount: 1,
      logicalOpaqueHeight: 72,
      sourceOpaqueHeight: 204,
    })).rejects.toThrow('frame 0 canonical outline needs 32 valid vertical scanlines');
  });

  it('rejects an actual 12px canonical rim instead of masking it to policy width', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-outline-overrun-'));
    const file = path.join(root, 'outline-overrun.png');
    await sharp(Buffer.from(
      '<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg"><rect x="78" y="50" width="100" height="204" fill="rgb(47,37,31)"/><rect x="90" y="62" width="76" height="180" fill="#f1d7a5"/></svg>',
    )).ensureAlpha().png().toFile(file);

    const outline = await measureOutlineAt390(file, {
      frameCount: 1,
      logicalOpaqueHeight: 72,
      sourceOpaqueHeight: 204,
    });
    expect(outline).toBeGreaterThan(2);
  });

  it('requires at least 32 valid canonical scanlines in every frame', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-outline-per-frame-'));
    const file = path.join(root, 'partial-outline.png');
    const first = Buffer.from(
      '<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg"><rect x="78" y="50" width="100" height="204" fill="rgb(47,37,31)"/><rect x="84" y="56" width="88" height="192" fill="#f1d7a5"/></svg>',
    );
    const second = Buffer.from(
      '<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg"><rect x="78" y="50" width="100" height="204" fill="#f1d7a5"/></svg>',
    );
    await sharp({ create: { width: 512, height: 256, channels: 4, background: 'transparent' } })
      .composite([{ input: first, left: 0, top: 0 }, { input: second, left: 256, top: 0 }])
      .png()
      .toFile(file);

    await expect(measureOutlineAt390(file, {
      frameCount: 2,
      logicalOpaqueHeight: 72,
      sourceOpaqueHeight: 204,
    })).rejects.toThrow('frame 1 canonical outline needs 32 valid scanlines');
  });

  it('rejects one overly thick frame even when the other five frames have a valid rim', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-outline-one-thick-frame-'));
    const file = path.join(root, 'one-thick-frame.png');
    const frames = Array.from({ length: 6 }, (_, index) => {
      const inset = index === 5 ? 12 : 6;
      return {
        input: Buffer.from(
          `<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg"><rect x="78" y="50" width="100" height="204" fill="rgb(47,37,31)"/><rect x="${78 + inset}" y="${50 + inset}" width="${100 - inset * 2}" height="${204 - inset * 2}" fill="#f1d7a5"/></svg>`,
        ),
        left: index * 256,
        top: 0,
      };
    });
    await sharp({ create: { width: 1536, height: 256, channels: 4, background: 'transparent' } })
      .composite(frames)
      .png()
      .toFile(file);
    const entry = {
      key: 'huchu-outline-fixture', action: 'walk', source: file, url: '/outline.png',
      frameCount: 6, frameWidth: 256, frameHeight: 256, opaqueHeightPx: 204,
      fps: 10, loop: true,
    };

    await expect(verifyAnimationSheet(entry, { file }))
      .rejects.toThrow('frame 5 outline at 390px must be 1.5-2px');
  });

  it('ignores sparse diagonal-run outliers without hiding a uniformly thick rim', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-outline-diagonal-'));
    const file = path.join(root, 'diagonal-outline.png');
    await sharp(Buffer.from(
      '<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg"><rect x="78" y="50" width="100" height="204" fill="rgb(47,37,31)"/><path d="M84 56 L92 72 L84 88 L84 216 L92 232 L84 248 H172 L164 232 L172 216 V88 L164 72 L172 56 Z" fill="#f1d7a5"/></svg>',
    )).ensureAlpha().png().toFile(file);

    const outline = await measureOutlineAt390(file, {
      frameCount: 1,
      logicalOpaqueHeight: 72,
      sourceOpaqueHeight: 204,
    });
    expect(outline).toBeGreaterThanOrEqual(1.5);
    expect(outline).toBeLessThanOrEqual(2);
  });

  it.skipIf(!V2_CANDIDATES_PRESENT)(
    'strictly verifies all 32 animation source sheets and one shelter [V2 candidates missing]',
    async () => {
      for (const entry of sourceAnimationEntries) {
        await expect(verifyAnimationSheet(entry, { file: entry.source })).resolves.toBeUndefined();
      }
      await expect(verifyV2ShelterSheet({
        file: shelterAsset.source,
        sourceFile: shelterAsset.source,
        checkOutline: true,
      })).resolves.toBeUndefined();
    },
    SHARP_INTEGRATION_TIMEOUT_MS,
  );
});
