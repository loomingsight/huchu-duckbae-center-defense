import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, readdir, rename, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Asset build scripts are executable ESM JavaScript without declaration files.
import { buildAnimationAssets, buildAnimationSheet, buildAssets } from '../../scripts/assets/build-assets.mjs';
// @ts-expect-error Asset approval scripts are executable ESM JavaScript without declaration files.
import { parseApprovalCliArgs, updateApprovalLedgers, validateProvenanceEvidence } from '../../scripts/assets/approval-ledger.mjs';
// @ts-expect-error Asset approval scripts are executable ESM JavaScript without declaration files.
import { approveV2CharacterAssets } from '../../scripts/assets/approve-v2-character-assets.mjs';
// @ts-expect-error Asset manifest scripts are executable ESM JavaScript without declaration files.
import * as assetManifestScript from '../../scripts/assets/manifest.mjs';
// @ts-expect-error Asset preparation scripts are executable ESM JavaScript without declaration files.
import { normalizeHorizontalSheet } from '../../scripts/assets/prepare-v2-character-sheets.mjs';

const sourceEntry = {
  key: 'fixture-walk',
  action: 'walk',
  source: 'assets/source/generated/v2/fixture-walk.png',
  url: '/assets/characters/fixture/walk.png',
  frameCount: 6,
  frameWidth: 256,
  frameHeight: 256,
  opaqueHeightPx: 204,
  fps: 10,
  loop: true,
};

const { characterOutput, characterSheets, mapAsset, sourceAnimationEntries } = assetManifestScript;
const V2_CANDIDATES_PRESENT = sourceAnimationEntries
  .map(({ source }: { source: string }) => source)
  .every(existsSync);

const APPROVAL_EVIDENCE = {
  approvedBy: 'jadon',
  approvedAt: '2026-07-21T08:30:00.000Z',
  decisionId: 'asset-review-v2-2026-07-21',
  reviewArtifact: 'docs/reviews/v2-assets.png',
} as const;

async function commitReviewArtifact(root: string, contents = Buffer.from('reviewed V2 asset board')) {
  const artifact = path.join(root, APPROVAL_EVIDENCE.reviewArtifact);
  await mkdir(path.dirname(artifact), { recursive: true });
  await writeFile(artifact, contents);
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', APPROVAL_EVIDENCE.reviewArtifact], { cwd: root });
  execFileSync(
    'git',
    ['-c', 'user.name=Asset Test', '-c', 'user.email=asset-test@example.invalid', 'commit', '-qm', 'review artifact'],
    { cwd: root },
  );
  return contents;
}

async function writeFixtureSheet(file: string, frameCount = 6) {
  const width = frameCount * 256;
  const frames = Array.from({ length: frameCount }, (_, index) => ({
    input: Buffer.from(
      `<svg width="100" height="204" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="204" fill="rgb(${20 + index},80,120)"/></svg>`,
    ),
    left: index * 256 + 78,
    top: 50,
  }));
  await sharp({ create: { width, height: 256, channels: 4, background: 'transparent' } })
    .composite(frames)
    .png()
    .toFile(file);
}

async function writeNonDivisibleStrip(
  file: string,
  {
    characterCount = 6,
    bridgeMiddlePair = false,
    heightAt = () => 204,
    colorAt = (index: number) => `${30 + index * 20},80,120`,
  }: {
    characterCount?: number;
    bridgeMiddlePair?: boolean;
    heightAt?: (index: number) => number;
    colorAt?: (index: number) => string;
  } = {},
) {
  const width = 1774;
  const height = 300;
  const composites = Array.from({ length: characterCount }, (_, index) => {
    const center = Math.round((index + 0.5) * width / characterCount);
    const characterHeight = heightAt(index);
    return {
      input: Buffer.from(
        `<svg width="120" height="${characterHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="${characterHeight}" fill="rgb(${colorAt(index)})"/></svg>`,
      ),
      left: center - 60,
      top: 274 - characterHeight,
    };
  });
  if (bridgeMiddlePair && characterCount === 6) {
    const leftCenter = Math.round(2.5 * width / characterCount);
    const rightCenter = Math.round(3.5 * width / characterCount);
    composites.push({
      input: Buffer.from(
        `<svg width="${rightCenter - leftCenter - 119}" height="1" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="1" fill="rgb(70,80,120)"/></svg>`,
      ),
      left: leftCenter + 60,
      top: 170,
    });
  }
  await sharp({ create: { width, height, channels: 4, background: 'transparent' } })
    .composite(composites)
    .png()
    .toFile(file);
}

const characters = ['enemy-trader'];
const supersededRuntimeCharacters = [
  'enemy-poop-male',
  'enemy-poop-female',
  'enemy-offleash-male',
  'enemy-offleash-female',
  'enemy-breeder-male',
  'enemy-breeder-female',
];

describe('runtime assets', () => {
  it.each(characters)('%s는 4×2 RGBA 시트다', async (name) => {
    const meta = await sharp(`public/assets/characters/${name}.png`).metadata();
    expect(meta).toMatchObject({ width: 768, height: 512, channels: 4, format: 'png' });
  });

  it.each(supersededRuntimeCharacters)('%s legacy runtime sheet는 제거한다', (name) => {
    expect(existsSync(`public/assets/characters/${name}.png`)).toBe(false);
  });

  it('superseded runtime의 source/provenance 입력은 보존한다', () => {
    expect([
      'assets/source/characters/enemy-poop-male-base.png',
      'assets/source/characters/enemy-poop-female-base.png',
      'assets/source/characters/enemy-offleash-male.png',
      'assets/source/characters/enemy-offleash-female.png',
      'assets/source/characters/enemy-breeder-male.png',
      'assets/source/characters/enemy-breeder-female.png',
      'assets/source/generated/enemy-poop-male-throw-edit.png',
      'assets/source/generated/enemy-poop-female-throw-edit.png',
    ].every(existsSync)).toBe(true);
  });

  it('맵은 승인 해상도의 WebP다', async () => {
    const meta = await sharp('public/assets/map/map-background.webp').metadata();
    expect(meta).toMatchObject({ width: 1080, height: 1920, format: 'webp' });
  });

  it.skipIf(!V2_CANDIDATES_PRESENT)(
    'clean output root에 trader fallback과 모든 V2 runtime asset만 생성한다 [V2 candidates missing]',
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), 'huchu-clean-asset-build-'));

      await buildAssets({ outputRoot: root });

      const expected = [
        ...characterSheets.map(({ key }: { key: string }) => characterOutput(key)),
        ...sourceAnimationEntries.map(({ url }: { url: string }) => `public${url}`),
        mapAsset.output,
      ];
      await Promise.all(expected.map((relative) =>
        expect(access(path.join(root, relative))).resolves.toBeUndefined()));
      await Promise.all(supersededRuntimeCharacters.map((name) =>
        expect(access(path.join(root, `public/assets/characters/${name}.png`))).rejects.toThrow()));
    },
    30_000,
  );
});

describe('generic animation build', () => {
  it('reports an explicit candidate-missing reason', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-animation-missing-'));
    await expect(buildAnimationSheet(sourceEntry, { sourceRoot: root, outputRoot: root }))
      .rejects.toThrow(`V2 candidate missing: ${sourceEntry.source}`);
  });

  it('losslessly recompresses a source row without resizing or rearranging frames', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-animation-build-'));
    const source = path.join(root, sourceEntry.source);
    await mkdir(path.dirname(source), { recursive: true });
    await writeFixtureSheet(source);

    await buildAnimationSheet(sourceEntry, { sourceRoot: root, outputRoot: root });
    const output = path.join(root, `public${sourceEntry.url}`);
    const [expected, actual] = await Promise.all([
      sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    ]);
    expect(actual.info).toMatchObject({ width: 1536, height: 256, channels: 4 });
    expect(actual.data.equals(expected.data)).toBe(true);
  });

  it('skips mirror rows without creating a second texture', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-animation-mirror-'));
    const source = path.join(root, sourceEntry.source);
    await mkdir(path.dirname(source), { recursive: true });
    await writeFixtureSheet(source);
    const { source: _source, url: _url, ...base } = sourceEntry;
    const mirror = {
      ...base,
      key: 'fixture-east',
      direction: 'east',
      mirrorOf: sourceEntry.key,
    };

    await buildAnimationAssets([sourceEntry, mirror], { sourceRoot: root, outputRoot: root });

    await expect(access(path.join(root, `public${sourceEntry.url}`))).resolves.toBeUndefined();
    expect(await readFile(path.join(root, `public${sourceEntry.url}`))).not.toHaveLength(0);
    await expect(access(path.join(root, 'public/assets/characters/fixture-east.png'))).rejects.toThrow();
  });

  it('uses the same exclusive source/mirror predicate and validation as runtime TypeScript', () => {
    const mixed = { ...sourceEntry, mirrorOf: 'fixture-west' };

    expect(assetManifestScript.isSourceAnimationEntry(mixed)).toBe(false);
    expect(() => assetManifestScript.validateAnimationManifestEntry(mixed))
      .toThrow('exactly one of source/url or mirrorOf');
  });

  it('normalizes a horizontal candidate to 256px frames with a 204px common height', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-animation-normalize-'));
    const input = path.join(root, 'input.png');
    const output = path.join(root, 'output.png');
    await writeFixtureSheet(input);

    await normalizeHorizontalSheet({ input, output, frameCount: 6 });

    const metadata = await sharp(output).metadata();
    expect(metadata).toMatchObject({ width: 1536, height: 256, channels: 4, format: 'png' });
    for (let frame = 0; frame < 6; frame += 1) {
      const { data, info } = await sharp(output)
        .extract({ left: frame * 256, top: 0, width: 256, height: 256 })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const opaqueRows = new Set<number>();
      for (let offset = 3; offset < data.length; offset += 4) {
        if ((data[offset] ?? 0) > 8) opaqueRows.add(Math.floor((offset - 3) / 4 / info.width));
      }
      expect(opaqueRows.size).toBe(204);
      expect(Math.max(...opaqueRows)).toBe(253);
    }
  });

  it('segments a non-divisible source width into six deterministic independent frames', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-animation-non-divisible-'));
    const input = path.join(root, 'input.png');
    const output = path.join(root, 'output.png');
    await writeNonDivisibleStrip(input);

    await normalizeHorizontalSheet({ input, output, frameCount: 6 });

    expect(await sharp(output).metadata()).toMatchObject({ width: 1536, height: 256, channels: 4 });
    const centerColors = [];
    for (let frame = 0; frame < 6; frame += 1) {
      const pixel = await sharp(output)
        .extract({ left: frame * 256 + 128, top: 150, width: 1, height: 1 })
        .ensureAlpha()
        .raw()
        .toBuffer();
      centerColors.push([...pixel]);
    }
    expect(new Set(centerColors.map((color) => color.join(','))).size).toBe(6);
  });

  it('splits a low-alpha bridge instead of merging adjacent characters', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-animation-bridge-'));
    const input = path.join(root, 'input.png');
    const output = path.join(root, 'output.png');
    await writeNonDivisibleStrip(input, { bridgeMiddlePair: true });

    await normalizeHorizontalSheet({ input, output, frameCount: 6 });

    const third = await sharp(output)
      .extract({ left: 2 * 256, top: 0, width: 256, height: 256 })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const fourth = await sharp(output)
      .extract({ left: 3 * 256, top: 0, width: 256, height: 256 })
      .ensureAlpha()
      .raw()
      .toBuffer();
    expect(third.equals(fourth)).toBe(false);
  });

  it('rejects a wrong character count instead of slicing through a character', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-animation-wrong-count-'));
    const input = path.join(root, 'input.png');
    const output = path.join(root, 'output.png');
    await writeNonDivisibleStrip(input, { characterCount: 5 });

    await expect(normalizeHorizontalSheet({ input, output, frameCount: 6 }))
      .rejects.toThrow('could not isolate exactly 6 horizontal frames');
  });

  it('adds a canonical 6px shell while retaining one common scale across poses', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-animation-outline-shell-'));
    const input = path.join(root, 'input.png');
    const output = path.join(root, 'output.png');
    await writeNonDivisibleStrip(input, { heightAt: (index) => index === 0 ? 180 : 204 });

    await normalizeHorizontalSheet({ input, output, frameCount: 6, outlineWidthPx: 6 });

    const heights = [];
    for (let frame = 0; frame < 6; frame += 1) {
      const { data } = await sharp(output)
        .extract({ left: frame * 256, top: 0, width: 256, height: 256 })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const opaqueRows = new Set<number>();
      for (let offset = 3; offset < data.length; offset += 4) {
        if ((data[offset] ?? 0) > 8) opaqueRows.add(Math.floor((offset - 3) / 4 / 256));
      }
      heights.push(opaqueRows.size);
    }
    expect(heights[1]).toBe(204);
    expect(heights[0]).toBeLessThan(heights[1]!);
    expect((heights[0]! - 12) / (heights[1]! - 12)).toBeCloseTo(180 / 204, 2);

    const row = await sharp(output)
      .extract({ left: 256, top: 150, width: 256, height: 1 })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const firstOpaque = Array.from({ length: 256 }, (_, x) => x)
      .find((x) => (row[x * 4 + 3] ?? 0) > 8);
    expect(firstOpaque).toBeDefined();
    for (let offset = 0; offset < 6; offset += 1) {
      const pixel = (firstOpaque! + offset) * 4;
      expect([...row.subarray(pixel, pixel + 4)]).toEqual([47, 37, 31, 255]);
    }
  });

  it('keeps canonical-colored artwork distinguishable from the synthesized shell', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-animation-outline-collision-'));
    const input = path.join(root, 'input.png');
    const output = path.join(root, 'output.png');
    await writeNonDivisibleStrip(input, { colorAt: () => '47,37,31' });

    await normalizeHorizontalSheet({ input, output, frameCount: 6, outlineWidthPx: 6 });

    const row = await sharp(output)
      .extract({ left: 0, top: 150, width: 256, height: 1 })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const firstOpaque = Array.from({ length: 256 }, (_, x) => x)
      .find((x) => (row[x * 4 + 3] ?? 0) > 8);
    let canonicalRun = 0;
    for (let x = firstOpaque!; x < 256; x += 1) {
      const offset = x * 4;
      if (
        row[offset] !== 47 ||
        row[offset + 1] !== 37 ||
        row[offset + 2] !== 31 ||
        row[offset + 3] !== 255
      ) break;
      canonicalRun += 1;
    }
    expect(canonicalRun).toBe(6);
  });
});

describe('merge-safe approval ledger', () => {
  it('CLI argument parsing requires the full explicit approval decision', () => {
    expect(() => parseApprovalCliArgs([])).toThrow('approvalEvidence is required');
    expect(parseApprovalCliArgs([
      '--root', '/tmp/candidate-root',
      '--approved-by', APPROVAL_EVIDENCE.approvedBy,
      '--approved-at', APPROVAL_EVIDENCE.approvedAt,
      '--decision-id', APPROVAL_EVIDENCE.decisionId,
      '--review-artifact', APPROVAL_EVIDENCE.reviewArtifact,
      '--generated-at', '2026-07-21',
    ])).toEqual({
      root: '/tmp/candidate-root',
      generatedAt: '2026-07-21',
      approvalEvidence: APPROVAL_EVIDENCE,
    });
    expect(() => parseApprovalCliArgs([
      '--approved-by', APPROVAL_EVIDENCE.approvedBy,
      '--approved-at', APPROVAL_EVIDENCE.approvedAt,
      '--decision-id', APPROVAL_EVIDENCE.decisionId,
      '--review-artifact', APPROVAL_EVIDENCE.reviewArtifact,
    ])).toThrow('generatedAt must be an ISO date');
  });

  it('exports the strict provenance-generation contract used by release verification', () => {
    expect(validateProvenanceEvidence({
      provider: 'imagegen',
      generatedAt: '2026-07-21',
      references: ['assets/source/reference.png'],
    })).toEqual({
      provider: 'imagegen',
      generatedAt: '2026-07-21',
      references: ['assets/source/reference.png'],
    });
    expect(() => validateProvenanceEvidence({
      provider: 'imagegen',
      generatedAt: '2026-02-30',
      references: [],
    })).toThrow('generatedAt must be an ISO date');
  });

  it('records committed human-review evidence, preserves foreign rows, sorts all keys, and is idempotent', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-approval-ledger-'));
    const approvalPath = path.join(root, 'generated-approvals.json');
    const provenancePath = path.join(root, 'provenance.json');
    const ownedSource = 'assets/source/generated/v2/fixture.png';
    await mkdir(path.join(root, path.dirname(ownedSource)), { recursive: true });
    await writeFile(path.join(root, ownedSource), Buffer.from('approved fixture'));
    const reviewContents = await commitReviewArtifact(root);
    await writeFile(approvalPath, `${JSON.stringify([{ source: 'foreign-entry', sha256: 'foreign' }], null, 2)}\n`);
    await writeFile(provenancePath, `${JSON.stringify([{ source: 'foreign-entry', sha256: 'foreign', provider: 'foreign' }], null, 2)}\n`);

    const options = {
      root,
      sources: [{ source: ownedSource, references: ['reference.png'] }],
      approvalPath,
      provenancePath,
      provider: 'imagegen',
      generatedAt: '2026-07-21',
      approvalEvidence: APPROVAL_EVIDENCE,
    };
    await updateApprovalLedgers(options);
    const firstApproval = await readFile(approvalPath, 'utf8');
    const firstProvenance = await readFile(provenancePath, 'utf8');
    await updateApprovalLedgers(options);

    expect(await readFile(approvalPath, 'utf8')).toBe(firstApproval);
    expect(await readFile(provenancePath, 'utf8')).toBe(firstProvenance);
    expect(JSON.parse(firstApproval).map(({ source }: { source: string }) => source)).toEqual([
      ownedSource,
      'foreign-entry',
    ]);
    expect(JSON.parse(firstApproval)).toContainEqual({
      source: ownedSource,
      sha256: createHash('sha256').update('approved fixture').digest('hex'),
      ...APPROVAL_EVIDENCE,
      reviewSha256: createHash('sha256').update(reviewContents).digest('hex'),
    });
    expect(JSON.parse(firstProvenance)).toContainEqual(expect.objectContaining({
      source: ownedSource,
      provider: 'imagegen',
      references: ['reference.png'],
      generatedAt: '2026-07-21',
      approvalDecisionId: APPROVAL_EVIDENCE.decisionId,
      approvedBy: APPROVAL_EVIDENCE.approvedBy,
      approvedAt: APPROVAL_EVIDENCE.approvedAt,
      reviewArtifact: APPROVAL_EVIDENCE.reviewArtifact,
      reviewSha256: createHash('sha256').update(reviewContents).digest('hex'),
    }));
  });

  it('serializes concurrent approval decisions without losing either owned or foreign row', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-approval-concurrent-'));
    const approvalPath = path.join(root, 'generated-approvals.json');
    const provenancePath = path.join(root, 'provenance.json');
    const secondEvidence = {
      ...APPROVAL_EVIDENCE,
      decisionId: 'asset-review-v2-concurrent-second',
      reviewArtifact: 'docs/reviews/v2-assets-second.png',
    };
    await commitReviewArtifact(root);
    await writeFile(path.join(root, secondEvidence.reviewArtifact), Buffer.from('second reviewed board'));
    execFileSync('git', ['add', secondEvidence.reviewArtifact], { cwd: root });
    execFileSync(
      'git',
      ['-c', 'user.name=Asset Test', '-c', 'user.email=asset-test@example.invalid', 'commit', '-qm', 'second review artifact'],
      { cwd: root },
    );
    const sourceA = 'assets/source/generated/v2/concurrent-a.png';
    const sourceB = 'assets/source/generated/v2/concurrent-b.png';
    await mkdir(path.join(root, path.dirname(sourceA)), { recursive: true });
    await Promise.all([
      writeFile(path.join(root, sourceA), Buffer.from('candidate A')),
      writeFile(path.join(root, sourceB), Buffer.from('candidate B')),
    ]);
    const foreign = { source: 'foreign-entry', sha256: 'foreign' };
    await writeFile(approvalPath, `${JSON.stringify([foreign], null, 2)}\n`);
    await writeFile(provenancePath, `${JSON.stringify([foreign], null, 2)}\n`);

    const common = { root, approvalPath, provenancePath, provider: 'imagegen', generatedAt: '2026-07-21' };
    await Promise.all([
      updateApprovalLedgers({
        ...common,
        sources: [{ source: sourceA, references: ['assets/source/reference-a.png'] }],
        approvalEvidence: APPROVAL_EVIDENCE,
      }),
      updateApprovalLedgers({
        ...common,
        sources: [{ source: sourceB, references: ['assets/source/reference-b.png'] }],
        approvalEvidence: secondEvidence,
      }),
    ]);

    expect(JSON.parse(await readFile(approvalPath, 'utf8')).map(({ source }: { source: string }) => source))
      .toEqual([sourceA, sourceB, 'foreign-entry']);
    expect(JSON.parse(await readFile(provenancePath, 'utf8')).map(({ source }: { source: string }) => source))
      .toEqual([sourceA, sourceB, 'foreign-entry']);
  });

  it('serializes concurrent decisions that share only the provenance ledger', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-approval-shared-provenance-'));
    const approvalA = path.join(root, 'approval-a.json');
    const approvalB = path.join(root, 'approval-b.json');
    const provenancePath = path.join(root, 'shared-provenance.json');
    const secondEvidence = {
      ...APPROVAL_EVIDENCE,
      decisionId: 'asset-review-shared-provenance-second',
      reviewArtifact: 'docs/reviews/shared-provenance-second.png',
    };
    await commitReviewArtifact(root);
    await writeFile(path.join(root, secondEvidence.reviewArtifact), Buffer.from('second reviewed board'));
    execFileSync('git', ['add', secondEvidence.reviewArtifact], { cwd: root });
    execFileSync(
      'git',
      ['-c', 'user.name=Asset Test', '-c', 'user.email=asset-test@example.invalid', 'commit', '-qm', 'second review artifact'],
      { cwd: root },
    );
    const sourceA = 'assets/source/generated/v2/shared-a.png';
    const sourceB = 'assets/source/generated/v2/shared-b.png';
    await mkdir(path.join(root, path.dirname(sourceA)), { recursive: true });
    await Promise.all([
      writeFile(path.join(root, sourceA), Buffer.from('candidate A')),
      writeFile(path.join(root, sourceB), Buffer.from('candidate B')),
    ]);
    await writeFile(approvalA, '[]\n');
    await writeFile(approvalB, '[]\n');
    await writeFile(provenancePath, `${JSON.stringify([{ source: 'foreign-entry', sha256: 'foreign' }], null, 2)}\n`);

    const common = { root, provenancePath, provider: 'imagegen', generatedAt: '2026-07-21' };
    await Promise.all([
      updateApprovalLedgers({
        ...common,
        approvalPath: approvalA,
        sources: [{ source: sourceA, references: ['assets/source/reference-a.png'] }],
        approvalEvidence: APPROVAL_EVIDENCE,
      }),
      updateApprovalLedgers({
        ...common,
        approvalPath: approvalB,
        sources: [{ source: sourceB, references: ['assets/source/reference-b.png'] }],
        approvalEvidence: secondEvidence,
      }),
    ]);

    expect(JSON.parse(await readFile(provenancePath, 'utf8')).map(({ source }: { source: string }) => source))
      .toEqual([sourceA, sourceB, 'foreign-entry']);
  });

  it('rolls both ledgers back and removes staged files when the second replacement fails', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-approval-transaction-'));
    const approvalPath = path.join(root, 'generated-approvals.json');
    const provenancePath = path.join(root, 'provenance.json');
    const source = 'assets/source/generated/v2/fixture.png';
    await mkdir(path.join(root, path.dirname(source)), { recursive: true });
    await writeFile(path.join(root, source), Buffer.from('candidate'));
    await commitReviewArtifact(root);
    const originalApproval = `${JSON.stringify([{ source: 'old-approval', sha256: 'old' }], null, 2)}\n`;
    const originalProvenance = `${JSON.stringify([{ source: 'old-provenance', sha256: 'old' }], null, 2)}\n`;
    await writeFile(approvalPath, originalApproval);
    await writeFile(provenancePath, originalProvenance);
    let replacement = 0;

    await expect(updateApprovalLedgers({
      root,
      sources: [{ source, references: ['assets/source/reference.png'] }],
      approvalPath,
      provenancePath,
      provider: 'imagegen',
      generatedAt: '2026-07-21',
      approvalEvidence: APPROVAL_EVIDENCE,
      commitRename: async (from: string, to: string) => {
        replacement += 1;
        if (replacement === 2) throw new Error('injected second replacement failure');
        await rename(from, to);
      },
    })).rejects.toThrow('injected second replacement failure');
    expect(await readFile(approvalPath, 'utf8')).toBe(originalApproval);
    expect(await readFile(provenancePath, 'utf8')).toBe(originalProvenance);
    expect((await readdir(root)).filter((name) => name.includes('.tmp'))).toEqual([]);
  });

  it('continues rollback and retries cleanup when the first staged cleanup attempt fails', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-approval-cleanup-recovery-'));
    const approvalPath = path.join(root, 'generated-approvals.json');
    const provenancePath = path.join(root, 'provenance.json');
    const source = 'assets/source/generated/v2/fixture.png';
    await mkdir(path.join(root, path.dirname(source)), { recursive: true });
    await writeFile(path.join(root, source), Buffer.from('candidate'));
    await commitReviewArtifact(root);
    const originalApproval = '[]\n';
    const originalProvenance = '[]\n';
    await writeFile(approvalPath, originalApproval);
    await writeFile(provenancePath, originalProvenance);
    let replacement = 0;
    let cleanupFailures = 0;

    await expect(updateApprovalLedgers({
      root,
      sources: [{ source, references: ['assets/source/reference.png'] }],
      approvalPath,
      provenancePath,
      provider: 'imagegen',
      generatedAt: '2026-07-21',
      approvalEvidence: APPROVAL_EVIDENCE,
      commitRename: async (from: string, to: string) => {
        replacement += 1;
        if (replacement === 2) throw new Error('injected replacement failure');
        await rename(from, to);
      },
      cleanupUnlink: async (file: string | undefined) => {
        if (file === undefined) return;
        if (cleanupFailures === 0) {
          cleanupFailures += 1;
          throw Object.assign(new Error('injected cleanup EACCES'), { code: 'EACCES' });
        }
        try {
          await unlink(file);
        } catch (error) {
          if (!error || typeof error !== 'object' || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      },
    })).rejects.toThrow('injected replacement failure');
    expect(cleanupFailures).toBe(1);
    expect(await readFile(approvalPath, 'utf8')).toBe(originalApproval);
    expect(await readFile(provenancePath, 'utf8')).toBe(originalProvenance);
    expect((await readdir(root)).filter((name) => name.includes('.tmp') || name.endsWith('.lock')))
      .toEqual([]);
  });

  it('cleans restore temps and releases both locks when rollback replacement itself fails', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-approval-rollback-recovery-'));
    const approvalPath = path.join(root, 'generated-approvals.json');
    const provenancePath = path.join(root, 'provenance.json');
    const source = 'assets/source/generated/v2/fixture.png';
    await mkdir(path.join(root, path.dirname(source)), { recursive: true });
    await writeFile(path.join(root, source), Buffer.from('candidate'));
    await commitReviewArtifact(root);
    await writeFile(approvalPath, '[]\n');
    await writeFile(provenancePath, '[]\n');
    let replacement = 0;

    await expect(updateApprovalLedgers({
      root,
      sources: [{ source, references: ['assets/source/reference.png'] }],
      approvalPath,
      provenancePath,
      provider: 'imagegen',
      generatedAt: '2026-07-21',
      approvalEvidence: APPROVAL_EVIDENCE,
      commitRename: async (from: string, to: string) => {
        replacement += 1;
        if (replacement === 2) {
          await unlink(approvalPath);
          await mkdir(approvalPath);
          throw new Error('injected replacement and rollback-target failure');
        }
        await rename(from, to);
      },
    })).rejects.toThrow('ledger transaction and rollback failed');
    expect(await readFile(provenancePath, 'utf8')).toBe('[]\n');
    expect((await readdir(root)).filter((name) => name.includes('.tmp') || name.endsWith('.lock')))
      .toEqual([]);
  });

  it('rejects one output file being reused for both approval and provenance', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-approval-output-alias-'));
    const sharedPath = path.join(root, 'shared-ledger.json');
    const source = 'assets/source/generated/v2/fixture.png';
    await mkdir(path.join(root, path.dirname(source)), { recursive: true });
    await writeFile(path.join(root, source), Buffer.from('candidate'));
    await commitReviewArtifact(root);

    await expect(updateApprovalLedgers({
      root,
      sources: [{ source, references: ['assets/source/reference.png'] }],
      approvalPath: sharedPath,
      provenancePath: sharedPath,
      provider: 'imagegen',
      generatedAt: '2026-07-21',
      approvalEvidence: APPROVAL_EVIDENCE,
    })).rejects.toThrow('approvalPath and provenancePath must be different files');
    expect(existsSync(sharedPath)).toBe(false);
  });

  it('rejects ledger aliases through a symlinked existing ancestor and nonexistent child', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-approval-output-symlink-'));
    const source = 'assets/source/generated/v2/fixture.png';
    await mkdir(path.join(root, path.dirname(source)), { recursive: true });
    await writeFile(path.join(root, source), Buffer.from('candidate'));
    await commitReviewArtifact(root);
    await mkdir(path.join(root, 'target'), { recursive: true });
    await symlink('target', path.join(root, 'alias'));
    const approvalPath = path.join(root, 'alias/new/shared.json');
    const provenancePath = path.join(root, 'target/new/shared.json');

    await expect(updateApprovalLedgers({
      root,
      sources: [{ source, references: ['assets/source/reference.png'] }],
      approvalPath,
      provenancePath,
      provider: 'imagegen',
      generatedAt: '2026-07-21',
      approvalEvidence: APPROVAL_EVIDENCE,
    })).rejects.toThrow('approvalPath and provenancePath must be different files');
    expect(existsSync(path.join(root, 'target/new/shared.json'))).toBe(false);
  });

  it('rejects a ledger path whose symlinked ancestor resolves outside the real repository root', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-approval-output-containment-'));
    const outside = await mkdtemp(path.join(tmpdir(), 'huchu-approval-output-outside-'));
    const source = 'assets/source/generated/v2/fixture.png';
    await mkdir(path.join(root, path.dirname(source)), { recursive: true });
    await writeFile(path.join(root, source), Buffer.from('candidate'));
    await commitReviewArtifact(root);
    await symlink(outside, path.join(root, 'ledger-alias'));
    const approvalPath = path.join(root, 'ledger-alias/approval.json');
    const provenancePath = path.join(root, 'provenance.json');

    await expect(updateApprovalLedgers({
      root,
      sources: [{ source, references: ['assets/source/reference.png'] }],
      approvalPath,
      provenancePath,
      provider: 'imagegen',
      generatedAt: '2026-07-21',
      approvalEvidence: APPROVAL_EVIDENCE,
    })).rejects.toThrow('ledger paths must stay inside the real Git repository root');
    expect(existsSync(path.join(outside, 'approval.json'))).toBe(false);
  });

  it('rejects a generated source symlink that resolves outside the real repository root', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-approval-source-containment-'));
    const outside = await mkdtemp(path.join(tmpdir(), 'huchu-approval-source-outside-'));
    const source = 'assets/source/generated/v2/fixture.png';
    const outsideSource = path.join(outside, 'fixture.png');
    await writeFile(outsideSource, Buffer.from('outside candidate'));
    await mkdir(path.join(root, path.dirname(source)), { recursive: true });
    await symlink(outsideSource, path.join(root, source));
    await commitReviewArtifact(root);

    await expect(updateApprovalLedgers({
      root,
      sources: [{ source, references: ['assets/source/reference.png'] }],
      provider: 'imagegen',
      generatedAt: '2026-07-21',
      approvalEvidence: APPROVAL_EVIDENCE,
    })).rejects.toThrow('source must stay inside the real Git repository root');
    expect(existsSync(path.join(root, 'assets/source/generated-approvals.json'))).toBe(false);
    expect(existsSync(path.join(root, 'assets/source/provenance.json'))).toBe(false);
  });

  it.each([
    ['missing evidence', undefined],
    ['blank approver', { ...APPROVAL_EVIDENCE, approvedBy: '  ' }],
    ['non-ISO approval time', { ...APPROVAL_EVIDENCE, approvedAt: '2026-07-21' }],
    ['blank decision id', { ...APPROVAL_EVIDENCE, decisionId: '' }],
    ['absolute review artifact', { ...APPROVAL_EVIDENCE, reviewArtifact: '/tmp/review.png' }],
    ['escaping review artifact', { ...APPROVAL_EVIDENCE, reviewArtifact: '../review.png' }],
  ])('fails closed for %s before creating either ledger', async (_, approvalEvidence) => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-approval-invalid-'));
    const source = 'assets/source/generated/v2/fixture.png';
    await mkdir(path.join(root, path.dirname(source)), { recursive: true });
    await writeFile(path.join(root, source), Buffer.from('candidate'));

    await expect(updateApprovalLedgers({
      root,
      sources: [{ source }],
      provider: 'imagegen',
      generatedAt: '2026-07-21',
      approvalEvidence,
    })).rejects.toThrow();
    expect(existsSync(path.join(root, 'assets/source/generated-approvals.json'))).toBe(false);
    expect(existsSync(path.join(root, 'assets/source/provenance.json'))).toBe(false);
  });

  it('rejects an uncommitted review artifact before writing ledgers', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-approval-uncommitted-'));
    const source = 'assets/source/generated/v2/fixture.png';
    await mkdir(path.join(root, path.dirname(source)), { recursive: true });
    await writeFile(path.join(root, source), Buffer.from('candidate'));
    const artifact = path.join(root, APPROVAL_EVIDENCE.reviewArtifact);
    await mkdir(path.dirname(artifact), { recursive: true });
    await writeFile(artifact, Buffer.from('uncommitted review'));
    execFileSync('git', ['init', '-q'], { cwd: root });

    await expect(updateApprovalLedgers({
      root,
      sources: [{ source }],
      provider: 'imagegen',
      generatedAt: '2026-07-21',
      approvalEvidence: APPROVAL_EVIDENCE,
    })).rejects.toThrow('reviewArtifact must be a committed regular file');
    expect(existsSync(path.join(root, 'assets/source/generated-approvals.json'))).toBe(false);
    expect(existsSync(path.join(root, 'assets/source/provenance.json'))).toBe(false);
  });

  it('rejects a modified committed review artifact before writing ledgers', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-approval-modified-'));
    const source = 'assets/source/generated/v2/fixture.png';
    await mkdir(path.join(root, path.dirname(source)), { recursive: true });
    await writeFile(path.join(root, source), Buffer.from('candidate'));
    await commitReviewArtifact(root);
    await writeFile(path.join(root, APPROVAL_EVIDENCE.reviewArtifact), Buffer.from('changed after review'));

    await expect(updateApprovalLedgers({
      root,
      sources: [{ source }],
      provider: 'imagegen',
      generatedAt: '2026-07-21',
      approvalEvidence: APPROVAL_EVIDENCE,
    })).rejects.toThrow('reviewArtifact must match committed bytes');
    expect(existsSync(path.join(root, 'assets/source/generated-approvals.json'))).toBe(false);
    expect(existsSync(path.join(root, 'assets/source/provenance.json'))).toBe(false);
  });

  it('rejects a nested root that could alias an untracked artifact to the repository HEAD path', async () => {
    const repositoryRoot = await mkdtemp(path.join(tmpdir(), 'huchu-approval-root-alias-'));
    const reviewContents = await commitReviewArtifact(repositoryRoot);
    const root = path.join(repositoryRoot, 'nested');
    const source = 'assets/source/generated/v2/fixture.png';
    await mkdir(path.join(root, path.dirname(source)), { recursive: true });
    await writeFile(path.join(root, source), Buffer.from('candidate'));
    await mkdir(path.join(root, path.dirname(APPROVAL_EVIDENCE.reviewArtifact)), { recursive: true });
    await writeFile(path.join(root, APPROVAL_EVIDENCE.reviewArtifact), reviewContents);

    await expect(updateApprovalLedgers({
      root,
      sources: [{ source, references: ['assets/source/reference.png'] }],
      provider: 'imagegen',
      generatedAt: '2026-07-21',
      approvalEvidence: APPROVAL_EVIDENCE,
    })).rejects.toThrow('root must be the Git repository top-level');
    expect(existsSync(path.join(root, 'assets/source/generated-approvals.json'))).toBe(false);
    expect(existsSync(path.join(root, 'assets/source/provenance.json'))).toBe(false);
  });

  it('rejects a committed symlink whose untracked target mimics the symlink blob bytes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-approval-symlink-'));
    const source = 'assets/source/generated/v2/fixture.png';
    const targetName = 'untracked-board';
    const artifact = path.join(root, APPROVAL_EVIDENCE.reviewArtifact);
    await mkdir(path.dirname(artifact), { recursive: true });
    await writeFile(path.join(path.dirname(artifact), targetName), Buffer.from(targetName));
    await symlink(targetName, artifact);
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['add', APPROVAL_EVIDENCE.reviewArtifact], { cwd: root });
    execFileSync(
      'git',
      ['-c', 'user.name=Asset Test', '-c', 'user.email=asset-test@example.invalid', 'commit', '-qm', 'symlink review artifact'],
      { cwd: root },
    );
    await mkdir(path.join(root, path.dirname(source)), { recursive: true });
    await writeFile(path.join(root, source), Buffer.from('candidate'));

    await expect(updateApprovalLedgers({
      root,
      sources: [{ source, references: ['assets/source/reference.png'] }],
      provider: 'imagegen',
      generatedAt: '2026-07-21',
      approvalEvidence: APPROVAL_EVIDENCE,
    })).rejects.toThrow('reviewArtifact must be a committed regular file');
    expect(existsSync(path.join(root, 'assets/source/generated-approvals.json'))).toBe(false);
    expect(existsSync(path.join(root, 'assets/source/provenance.json'))).toBe(false);
  });

  it.each([
    ['missing provider', { provider: undefined, generatedAt: '2026-07-21' }, 'provider must be a nonempty string'],
    ['missing generatedAt', { provider: 'imagegen', generatedAt: undefined }, 'generatedAt must be an ISO date'],
    ['invalid generatedAt', { provider: 'imagegen', generatedAt: '2026-02-30' }, 'generatedAt must be an ISO date'],
  ])('rejects %s before writing incomplete provenance', async (_, generation, message) => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-approval-generation-'));
    const source = 'assets/source/generated/v2/fixture.png';
    await mkdir(path.join(root, path.dirname(source)), { recursive: true });
    await writeFile(path.join(root, source), Buffer.from('candidate'));
    await commitReviewArtifact(root);

    await expect(updateApprovalLedgers({
      root,
      sources: [{ source, references: ['assets/source/reference.png'] }],
      ...generation,
      approvalEvidence: APPROVAL_EVIDENCE,
    })).rejects.toThrow(message);
    expect(existsSync(path.join(root, 'assets/source/generated-approvals.json'))).toBe(false);
    expect(existsSync(path.join(root, 'assets/source/provenance.json'))).toBe(false);
  });

  it.each([
    ['escaping source', { source: '../candidate.png', references: ['assets/source/reference.png'] }, 'source must be a normalized repo-relative path'],
    ['non-array references', { source: 'assets/source/generated/v2/fixture.png', references: 'reference.png' }, 'references must be an array'],
    ['invalid reference', { source: 'assets/source/generated/v2/fixture.png', references: ['../reference.png'] }, 'reference must be a normalized repo-relative path'],
  ])('rejects %s before writing malformed provenance', async (_, sourceEntry, message) => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-approval-source-'));
    const validSource = 'assets/source/generated/v2/fixture.png';
    await mkdir(path.join(root, path.dirname(validSource)), { recursive: true });
    await writeFile(path.join(root, validSource), Buffer.from('candidate'));
    await commitReviewArtifact(root);

    await expect(updateApprovalLedgers({
      root,
      sources: [sourceEntry],
      provider: 'imagegen',
      generatedAt: '2026-07-21',
      approvalEvidence: APPROVAL_EVIDENCE,
    })).rejects.toThrow(message);
    expect(existsSync(path.join(root, 'assets/source/generated-approvals.json'))).toBe(false);
    expect(existsSync(path.join(root, 'assets/source/provenance.json'))).toBe(false);
  });

  it('V2 programmatic writer fails before reading candidates when approval evidence is absent', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-v2-no-approval-'));

    await expect(approveV2CharacterAssets({ root, generatedAt: '2026-07-21' }))
      .rejects.toThrow('approvalEvidence is required');
    expect(existsSync(path.join(root, 'assets/source/generated-approvals.json'))).toBe(false);
    expect(existsSync(path.join(root, 'assets/source/provenance.json'))).toBe(false);
  });

  it('V2 programmatic writer requires the original generation date', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-v2-no-generation-date-'));

    await expect(approveV2CharacterAssets({ root, approvalEvidence: APPROVAL_EVIDENCE }))
      .rejects.toThrow('generatedAt must be an ISO date');
    expect(existsSync(path.join(root, 'assets/source/generated-approvals.json'))).toBe(false);
    expect(existsSync(path.join(root, 'assets/source/provenance.json'))).toBe(false);
  });

  it('V2 writer rejects same-count manifest substitution outside the exact 18-source set', async () => {
    // @ts-expect-error Asset approval scripts are executable ESM JavaScript without declaration files.
    const module = await import('../../scripts/assets/approve-v2-character-assets.mjs');
    const v2CharacterApprovalSources = (module as unknown as {
      v2CharacterApprovalSources: (
        entries: typeof sourceAnimationEntries,
      ) => unknown;
    }).v2CharacterApprovalSources;
    const substituted = sourceAnimationEntries.map((entry: { key: string; source?: string }) =>
      entry.key === 'huchu-walk'
        ? { ...entry, source: 'assets/source/generated/v2/substituted.png' }
        : entry);

    expect(() => v2CharacterApprovalSources(substituted))
      .toThrow('Expected exact 18-source V2 approval set');
  });

  it('upserts exactly 18 V2 rows while preserving foreign rows', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-v2-approval-core-'));
    const approvalPath = path.join(root, 'assets/source/generated-approvals.json');
    const provenancePath = path.join(root, 'assets/source/provenance.json');
    await mkdir(path.dirname(approvalPath), { recursive: true });
    await writeFile(approvalPath, `${JSON.stringify([{ source: 'foreign-entry', sha256: 'foreign' }], null, 2)}\n`);
    await writeFile(provenancePath, `${JSON.stringify([{ source: 'foreign-entry', sha256: 'foreign' }], null, 2)}\n`);
    const reviewContents = await commitReviewArtifact(root);
    const sources = sourceAnimationEntries.map(({ source }: { source: string }) => source);
    for (const [index, source] of sources.entries()) {
      const file = path.join(root, source);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, Buffer.from(`fixture-${index}`));
    }

    await approveV2CharacterAssets({
      root,
      generatedAt: '2026-07-21',
      approvalEvidence: APPROVAL_EVIDENCE,
    });
    const firstApproval = await readFile(approvalPath, 'utf8');
    const firstProvenance = await readFile(provenancePath, 'utf8');
    await approveV2CharacterAssets({
      root,
      generatedAt: '2026-07-21',
      approvalEvidence: APPROVAL_EVIDENCE,
    });

    const approvalRows = JSON.parse(firstApproval) as { source: string }[];
    const provenanceRows = JSON.parse(firstProvenance) as { source: string }[];
    expect(approvalRows).toHaveLength(19);
    expect(provenanceRows).toHaveLength(19);
    expect(approvalRows).toContainEqual(expect.objectContaining({ source: 'foreign-entry' }));
    for (const row of approvalRows.filter(({ source }) => source !== 'foreign-entry')) {
      expect(row).toEqual(expect.objectContaining({
        ...APPROVAL_EVIDENCE,
        reviewSha256: createHash('sha256').update(reviewContents).digest('hex'),
      }));
    }
    for (const row of provenanceRows.filter(({ source }) => source !== 'foreign-entry')) {
      expect(row).toEqual(expect.objectContaining({
        provider: 'imagegen',
        generatedAt: '2026-07-21',
        approvalDecisionId: APPROVAL_EVIDENCE.decisionId,
        reviewArtifact: APPROVAL_EVIDENCE.reviewArtifact,
        reviewSha256: createHash('sha256').update(reviewContents).digest('hex'),
      }));
    }
    expect(approvalRows.map(({ source }) => source)).toEqual(
      [...approvalRows.map(({ source }) => source)].sort(),
    );
    expect(await readFile(approvalPath, 'utf8')).toBe(firstApproval);
    expect(await readFile(provenancePath, 'utf8')).toBe(firstProvenance);
  });
});
