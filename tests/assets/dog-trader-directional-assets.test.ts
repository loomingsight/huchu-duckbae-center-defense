import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import manifest from '../../src/game/assets/character-animations.json';
import {
  ATTACK_SOCKETS,
  DOG_TRADER_ENTRIES,
  DOG_TRADER_SOURCE_ENTRIES,
  resolveDogTraderAsset,
} from '../../src/game/assets/DogTraderDirectionalAssets';
// @ts-expect-error Asset scripts are executable ESM JavaScript without declaration files.
import { approveDogTraderAssets } from '../../scripts/assets/approve-dog-trader-assets.mjs';
// @ts-expect-error Asset scripts are executable ESM JavaScript without declaration files.
import { normalizeDogTraderSheet } from '../../scripts/assets/prepare-dog-trader-sheets.mjs';
// @ts-expect-error Asset scripts are executable ESM JavaScript without declaration files.
import { alphaBounds, verifyAnimationSheet, verifyDogTraderSourceBudget } from '../../scripts/assets/verify-assets.mjs';

const originalDirections = ['north', 'northWest', 'west', 'southWest', 'south'] as const;
const mirroredDirections = ['northEast', 'east', 'southEast'] as const;
const keyDirection = (direction: string): string =>
  direction.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

const APPROVAL_EVIDENCE = {
  approvedBy: 'jadon',
  approvedAt: '2026-07-21T09:00:00.000Z',
  decisionId: 'asset-review-dog-trader-2026-07-21',
  reviewArtifact: 'docs/reviews/dog-trader-assets.png',
} as const;

async function commitReviewArtifact(root: string) {
  const contents = Buffer.from('reviewed dog trader board');
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

async function writeStrip(
  file: string,
  frameCount: number,
  dimensions: { readonly width: number; readonly height: number },
): Promise<void> {
  const cellWidth = dimensions.width + 80;
  const frames = Array.from({ length: frameCount }, (_, index) => ({
    input: Buffer.from(
      `<svg width="${dimensions.width}" height="${dimensions.height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" rx="12" fill="rgb(${80 + index},120,160)"/></svg>`,
    ),
    left: index * cellWidth + 40,
    top: 24,
  }));
  await sharp({
    create: {
      width: frameCount * cellWidth,
      height: dimensions.height + 48,
      channels: 4,
      background: 'transparent',
    },
  }).composite(frames).png().toFile(file);
}

async function writeBoundaryStrip(
  file: string,
  boundaryRect: { readonly left: number; readonly width: number },
): Promise<void> {
  const cellWidth = 200;
  const actor = Buffer.from(
    '<svg width="80" height="140" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="140" rx="12" fill="#5078a0"/></svg>',
  );
  const boundary = Buffer.from(
    `<svg width="${boundaryRect.width}" height="24" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#d04040"/></svg>`,
  );
  await sharp({
    create: {
      width: cellWidth * 2,
      height: 200,
      channels: 4,
      background: 'transparent',
    },
  }).composite([
    { input: actor, left: 60, top: 30 },
    { input: actor, left: 260, top: 30 },
    { input: boundary, left: boundaryRect.left, top: 80 },
  ]).png().toFile(file);
}

type FrameBounds = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

async function frameBounds(file: string, frameCount: number): Promise<Array<FrameBounds | undefined>> {
  return Promise.all(Array.from({ length: frameCount }, async (_, frameIndex) => {
    const { data } = await sharp(file)
      .extract({ left: frameIndex * 256, top: 0, width: 256, height: 256 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return alphaBounds(data, 256, 256) as FrameBounds | undefined;
  }));
}

describe('dog trader directional manifest', () => {
  it('preserves 18 generic source rows and adds exactly 15 sources plus 9 virtual mirrors', () => {
    const generic = manifest.filter(({ key }) => !key.startsWith('dog-trader-'));
    expect(generic).toHaveLength(18);
    expect(DOG_TRADER_ENTRIES).toHaveLength(24);
    expect(DOG_TRADER_SOURCE_ENTRIES).toHaveLength(15);
    expect(DOG_TRADER_ENTRIES.filter((entry) => 'mirrorOf' in entry)).toHaveLength(9);
    for (const entry of DOG_TRADER_ENTRIES.filter((candidate) => 'mirrorOf' in candidate)) {
      expect(entry).not.toHaveProperty('source');
      expect(entry).not.toHaveProperty('url');
    }
  });

  it('uses the exact five source directions, action timing, mirrors, and reflected sockets', () => {
    expect(ATTACK_SOCKETS.north).toEqual({ x: 140, y: 112 });
    expect(ATTACK_SOCKETS.northWest).toEqual({ x: 151, y: 119 });
    expect(ATTACK_SOCKETS.west).toEqual({ x: 101, y: 136 });
    expect(ATTACK_SOCKETS.southWest).toEqual({ x: 154, y: 137 });
    expect(ATTACK_SOCKETS.south).toEqual({ x: 143, y: 143 });
    expect(ATTACK_SOCKETS.east).toEqual({ x: 155, y: 136 });
    for (const direction of originalDirections) {
      expect(DOG_TRADER_SOURCE_ENTRIES.map(({ key }) => key)).toEqual(expect.arrayContaining([
        `dog-trader-human-walk-${keyDirection(direction)}`,
        `dog-trader-human-attack-${keyDirection(direction)}`,
        `dog-trader-truck-roll-${keyDirection(direction)}`,
      ]));
    }
    for (const direction of mirroredDirections) {
      expect(resolveDogTraderAsset('walk', direction).flipX).toBe(true);
      expect(resolveDogTraderAsset('truckRoll', direction).flipX).toBe(true);
    }
    expect(resolveDogTraderAsset('attack', 'east')).toMatchObject({
      flipX: true,
      eventSocket: { x: 155, y: 136 },
      entry: { key: 'dog-trader-human-attack-west' },
    });
    expect(ATTACK_SOCKETS.east.x).toBe(256 - ATTACK_SOCKETS.west.x);
    expect(ATTACK_SOCKETS.northEast.x).toBe(256 - ATTACK_SOCKETS.northWest.x);
    expect(ATTACK_SOCKETS.southEast.x).toBe(256 - ATTACK_SOCKETS.southWest.x);
    for (const entry of DOG_TRADER_ENTRIES.filter(({ action }) => action === 'attack')) {
      expect(entry).toMatchObject({ frameCount: 8, fps: 10, loop: false, eventFrame: 5, eventKind: 'projectileRelease' });
      const direction = entry.direction;
      expect(direction).toBeDefined();
      if (direction === undefined) throw new Error(`Missing direction for ${entry.key}`);
      expect(entry.eventSocket).toEqual(ATTACK_SOCKETS[direction]);
    }
  });

  it('keeps the 15 source sheets within the 24 MiB GPU budget', () => {
    const bytes = DOG_TRADER_SOURCE_ENTRIES.reduce(
      (total, entry) => total + entry.frameCount * entry.frameWidth * entry.frameHeight * 4,
      0,
    );
    expect(bytes / 1024 / 1024).toBe(22.5);
    expect(bytes / 1024 / 1024).toBeLessThanOrEqual(24);
    expect(verifyDogTraderSourceBudget()).toEqual({ bytes, mebibytes: 22.5, sourceCount: 15 });
  });
});

describe('dog trader sheet preparation and verification', () => {
  it.each([
    ['crosses', { left: 199, width: 2 }],
    ['touches', { left: 199, width: 1 }],
  ])('rejects meaningful source alpha that %s an equal-cell boundary', async (_, boundaryRect) => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-trader-boundary-'));
    const input = path.join(root, 'input.png');
    const output = path.join(root, 'output.png');
    await writeBoundaryStrip(input, boundaryRect);

    await expect(
      normalizeDogTraderSheet({ input, output, frameCount: 2, kind: 'human' }),
    ).rejects.toThrow('meaningful alpha touches equal-cell boundary 1');
  });

  it('normalizes a human strip to 204px occupancy, common feet, and common center', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-trader-human-'));
    const input = path.join(root, 'input.png');
    const output = path.join(root, 'output.png');
    await writeStrip(input, 6, { width: 112, height: 180 });
    await normalizeDogTraderSheet({ input, output, frameCount: 6, kind: 'human' });

    const bounds = await frameBounds(output, 6);
    expect(bounds.every((value) => value?.height === 204)).toBe(true);
    expect(bounds.every((value) => value !== undefined && value.y + value.height === 254)).toBe(true);
    expect(new Set(bounds.map((value) => value && value.x + value.width / 2)).size).toBe(1);
  });

  it('uses the truck-only width/height budget instead of character occupancy', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-trader-truck-'));
    const input = path.join(root, 'input.png');
    const output = path.join(root, 'output.png');
    await writeStrip(input, 4, { width: 200, height: 118 });
    await normalizeDogTraderSheet({ input, output, frameCount: 4, kind: 'truck' });

    const bounds = await frameBounds(output, 4);
    for (const value of bounds) {
      expect(value?.width).toBeGreaterThanOrEqual(220);
      expect(value?.width).toBeLessThanOrEqual(240);
      expect(value?.height).toBeGreaterThanOrEqual(135);
      expect(value?.height).toBeLessThanOrEqual(155);
      expect(value && value.y + value.height).toBe(254);
    }
    const entry = DOG_TRADER_SOURCE_ENTRIES.find(({ key }) => key === 'dog-trader-truck-roll-north');
    expect(entry).toBeDefined();
    await expect(verifyAnimationSheet(entry!, { file: output, checkOutline: false })).resolves.toBeUndefined();
  });
});

describe('dog trader approval writer', () => {
  it('rejects same-count manifest substitution outside the exact 15-source set', async () => {
    // @ts-expect-error Asset approval scripts are executable ESM JavaScript without declaration files.
    const module = await import('../../scripts/assets/approve-dog-trader-assets.mjs');
    const dogTraderApprovalSources = (module as unknown as {
      dogTraderApprovalSources: (entries: typeof DOG_TRADER_SOURCE_ENTRIES) => unknown;
    }).dogTraderApprovalSources;
    const substituted = DOG_TRADER_SOURCE_ENTRIES.map((entry) =>
      entry.key === 'dog-trader-human-walk-north'
        ? { ...entry, source: 'assets/source/generated/dog-trader/substituted.png' }
        : entry);

    expect(() => dogTraderApprovalSources(substituted))
      .toThrow('Expected exact 15-source dog trader approval set');
  });

  it('atomically preserves generic and foreign rows, upserts 15 sources, sorts, and is idempotent', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-trader-approval-'));
    const approvals = path.join(root, 'assets/source/generated-approvals.json');
    const provenance = path.join(root, 'assets/source/provenance.json');
    await mkdir(path.dirname(approvals), { recursive: true });
    const generic = { source: 'assets/source/generated/v2/huchu-walk.png', sha256: 'generic' };
    const foreign = { source: 'foreign/source.png', sha256: 'foreign' };
    await writeFile(approvals, `${JSON.stringify([foreign, generic], null, 2)}\n`);
    await writeFile(provenance, `${JSON.stringify([{ ...foreign, provider: 'foreign' }, { ...generic, provider: 'imagegen' }], null, 2)}\n`);
    const reviewContents = await commitReviewArtifact(root);
    for (const { source } of DOG_TRADER_SOURCE_ENTRIES) {
      const file = path.join(root, source);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, source);
    }

    const options = {
      root,
      generatedAt: '2026-07-21',
      approvalEvidence: APPROVAL_EVIDENCE,
    };
    await approveDogTraderAssets(options);
    const firstApprovals = await readFile(approvals, 'utf8');
    const firstProvenance = await readFile(provenance, 'utf8');
    await approveDogTraderAssets(options);
    expect(await readFile(approvals, 'utf8')).toBe(firstApprovals);
    expect(await readFile(provenance, 'utf8')).toBe(firstProvenance);

    const approvalRows = JSON.parse(firstApprovals) as Array<{ source: string; sha256: string }>;
    const provenanceRows = JSON.parse(firstProvenance) as Array<Record<string, unknown>>;
    expect(approvalRows).toHaveLength(17);
    expect(provenanceRows).toHaveLength(17);
    expect(approvalRows).toEqual(expect.arrayContaining([generic, foreign]));
    expect(approvalRows.map(({ source }) => source)).toEqual([...approvalRows.map(({ source }) => source)].sort());
    for (const entry of DOG_TRADER_SOURCE_ENTRIES) {
      expect(approvalRows).toContainEqual({
        source: entry.source,
        sha256: createHash('sha256').update(entry.source).digest('hex'),
        ...APPROVAL_EVIDENCE,
        reviewSha256: createHash('sha256').update(reviewContents).digest('hex'),
      });
      expect(provenanceRows).toContainEqual(expect.objectContaining({
        source: entry.source,
        provider: 'imagegen',
        references: ['assets/source/characters/enemy-trader.png'],
        generatedAt: '2026-07-21',
        approvalDecisionId: APPROVAL_EVIDENCE.decisionId,
        reviewArtifact: APPROVAL_EVIDENCE.reviewArtifact,
        reviewSha256: createHash('sha256').update(reviewContents).digest('hex'),
      }));
    }
  });

  it('fails closed without explicit human approval evidence', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-trader-no-approval-'));

    await expect(approveDogTraderAssets({ root, generatedAt: '2026-07-21' }))
      .rejects.toThrow('approvalEvidence is required');
    expect(existsSync(path.join(root, 'assets/source/generated-approvals.json'))).toBe(false);
    expect(existsSync(path.join(root, 'assets/source/provenance.json'))).toBe(false);
  });

  it('requires the original generation date instead of substituting the approval date', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'huchu-trader-no-generation-date-'));

    await expect(approveDogTraderAssets({ root, approvalEvidence: APPROVAL_EVIDENCE }))
      .rejects.toThrow('generatedAt must be an ISO date');
    expect(existsSync(path.join(root, 'assets/source/generated-approvals.json'))).toBe(false);
    expect(existsSync(path.join(root, 'assets/source/provenance.json'))).toBe(false);
  });
});
