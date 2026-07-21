import { expect, test } from '@playwright/test';
import { PATH_DEFINITIONS, TRADER_SIDE_BY_PATH } from '../../src/game/data/pathDefinitions';
import type { GameDebugEvent, TestScenarioId } from '../../src/game/debug/TestContract';
import type { EnemySnapshot } from '../../src/game/enemies/EnemyTypes';
import { PathPoseSampler } from '../../src/game/world/PathPoseSampler';
import { advance, events, openScenario, snapshot } from './helpers';

for (const pathId of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const) {
  test(`${pathId} 개장수는 사람 앞·트럭 대각선 뒤를 유지한다`, async ({ page }) => {
    await openScenario(page, `boss-rig-${pathId.toLowerCase()}` as TestScenarioId);
    const rig = (await snapshot(page)).traderRig.active;
    if (rig === null) throw new Error(`${pathId} dog trader rig is missing`);
    expect(isOutsideWorld(rig.human, 540, 960)).toBe(true);
    expect(isOutsideWorld(rig.truck, 540, 960)).toBe(true);
    const sampler = new PathPoseSampler(PATH_DEFINITIONS[pathId]);
    const human = sampler.sampleExtended(rig.pathProgress);
    const behind = sampler.sampleExtended(rig.pathProgress - 70);
    const signedSide = TRADER_SIDE_BY_PATH[pathId] * 28;
    const truck = {
      x: behind.position.x + behind.normal.x * signedSide,
      y: behind.position.y + behind.normal.y * signedSide,
    };
    expect(rig).toMatchObject({ pathId, parts: 2, gameplayEntityCount: 1 });
    expect(rig.human.x).toBeCloseTo(human.position.x, 1);
    expect(rig.human.y).toBeCloseTo(human.position.y, 1);
    expect(rig.truck.x).toBeCloseTo(truck.x, 1);
    expect(rig.truck.y).toBeCloseTo(truck.y, 1);
    expect(rig.followDistance).toBeCloseTo(70, 0);
    expect(rig.lateralDistance).toBeCloseTo(signedSide, 0);
  });
}

test('corner 방향·mirror와 실제 bark의 두-part feedback/death를 노출한다', async ({ page }) => {
  await openScenario(page, 'boss-rig-corner-p2');
  const before = (await snapshot(page)).traderRig.active;
  if (before === null) throw new Error('Initial corner rig is missing');
  await advance(page, 1800);
  const after = (await snapshot(page)).traderRig.active;
  if (after === null) throw new Error('Advanced corner rig is missing');
  expect({ direction: after.humanDirection, flipX: after.humanFlipX }).toEqual(
    expectedDirectionAndFlip('human-walk', PATH_DEFINITIONS.P2, after.pathProgress),
  );
  expect({ direction: after.truckDirection, flipX: after.truckFlipX }).toEqual(
    expectedDirectionAndFlip('truck-roll', PATH_DEFINITIONS.P2, after.pathProgress - 70),
  );
  expect(
    after.humanDirection === before.humanDirection && after.humanFlipX === before.humanFlipX,
  ).toBe(false);

  await openScenario(page, 'boss-rig-feedback');
  await advance(page, 900);
  expect((await snapshot(page)).traderRig).toMatchObject({
    active: null,
    lastSharedFeedbackParts: 2,
    lastReleaseParts: 2,
  });
});

test('개장수 net은 feet가 아니라 방향별 hand socket에서 출발한다', async ({ page }) => {
  await openScenario(page, 'boss-rig-attack-p2');
  const enemy = (await snapshot(page)).run.enemies.find(({ kind }) => kind === 'dogTrader');
  if (enemy === undefined) throw new Error('Attack dog trader is missing');
  await advance(page, 500);
  const release = (await events(page)).find((event): event is Extract<
    GameDebugEvent,
    { type: 'projectileRequested' }
  > => event.type === 'projectileRequested' && event.projectileKind === 'net');
  expect(release).toMatchObject({ from: expectedAttackOrigin(enemy) });
  expect(release?.from).not.toEqual(enemy.position);
});

type ExpectedAction = 'human-walk' | 'truck-roll';
type Direction = 'east' | 'southEast' | 'south' | 'southWest' | 'west' | 'northWest' | 'north' | 'northEast';

function expectedDirectionAndFlip(
  action: ExpectedAction,
  points: readonly (readonly [number, number])[],
  progress: number,
): { readonly direction: Direction; readonly flipX: boolean } {
  if (action !== 'human-walk' && action !== 'truck-roll') throw new Error('Unknown rig action');
  const heading = new PathPoseSampler(points).sampleExtended(progress).headingRad;
  const sectors: readonly Readonly<{ direction: Direction; center: number }>[] = [
    { direction: 'east', center: 0 },
    { direction: 'southEast', center: Math.PI / 4 },
    { direction: 'south', center: Math.PI / 2 },
    { direction: 'southWest', center: 3 * Math.PI / 4 },
    { direction: 'west', center: Math.PI },
    { direction: 'northWest', center: -3 * Math.PI / 4 },
    { direction: 'north', center: -Math.PI / 2 },
    { direction: 'northEast', center: -Math.PI / 4 },
  ];
  const direction = sectors.reduce((best, candidate) => (
    angularDistance(heading, candidate.center) < angularDistance(heading, best.center)
      ? candidate
      : best
  )).direction;
  return {
    direction,
    flipX: direction === 'northEast' || direction === 'east' || direction === 'southEast',
  };
}

function angularDistance(left: number, right: number): number {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}

function expectedAttackOrigin(enemy: EnemySnapshot): { readonly x: number; readonly y: number } {
  const feet = new PathPoseSampler(PATH_DEFINITIONS[enemy.pathId]).sampleExtended(enemy.pathProgress).position;
  const heading = Math.atan2(480 - feet.y, 270 - feet.x);
  const direction = expectedDirection(heading);
  const sockets: Readonly<Record<Direction, Readonly<{ x: number; y: number }>>> = {
    north: { x: 140, y: 112 }, northWest: { x: 151, y: 119 }, west: { x: 101, y: 136 },
    southWest: { x: 154, y: 137 }, south: { x: 143, y: 143 },
    northEast: { x: 105, y: 119 }, east: { x: 155, y: 136 }, southEast: { x: 102, y: 137 },
  };
  const socket = sockets[direction];
  const scale = 100 / 204;
  return { x: feet.x + (socket.x - 128) * scale, y: feet.y + (socket.y - 256) * scale };
}

function expectedDirection(heading: number): Direction {
  const sectors: readonly Readonly<{ direction: Direction; center: number }>[] = [
    { direction: 'east', center: 0 }, { direction: 'southEast', center: Math.PI / 4 },
    { direction: 'south', center: Math.PI / 2 }, { direction: 'southWest', center: 3 * Math.PI / 4 },
    { direction: 'west', center: Math.PI }, { direction: 'northWest', center: -3 * Math.PI / 4 },
    { direction: 'north', center: -Math.PI / 2 }, { direction: 'northEast', center: -Math.PI / 4 },
  ];
  return sectors.reduce((best, candidate) => (
    angularDistance(heading, candidate.center) < angularDistance(heading, best.center) ? candidate : best
  )).direction;
}

function isOutsideWorld(point: { readonly x: number; readonly y: number }, width: number, height: number): boolean {
  return point.x < 0 || point.x > width || point.y < 0 || point.y > height;
}
