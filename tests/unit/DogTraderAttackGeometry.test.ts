import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { resolveDogTraderAsset } from '../../src/game/assets/DogTraderDirectionalAssets';
import { HUCHU_PRESENTATION } from '../../src/game/presentation/PresentationConfig';
import {
  DEFAULT_PATH_POSE_SAMPLERS,
  dogTraderAttackOrigin,
} from '../../src/game/enemies/DogTraderAttackGeometry';
import type { EnemySnapshot } from '../../src/game/enemies/EnemyTypes';
import { resolveDirection8 } from '../../src/game/world/DirectionalFrameResolver';

it('현재 path pose가 보는 shelter 방향의 256-cell 손 socket을 boss scale로 변환한다', () => {
  const snapshot = dogTraderSnapshot('P2', 180);
  const feet = DEFAULT_PATH_POSE_SAMPLERS.P2.sampleExtended(180).position;
  const direction = resolveDirection8(Math.atan2(480 - feet.y, 270 - feet.x));
  const resolved = resolveDogTraderAsset('attack', direction);
  const socket = resolved.eventSocket!;
  const scale = HUCHU_PRESENTATION.bossOpaqueHeightLogical / resolved.entry.opaqueHeightPx;

  expect(dogTraderAttackOrigin({
    ...snapshot,
    position: { x: -999, y: -999 },
  })).toEqual({
    x: feet.x + (socket.x - 128) * scale,
    y: feet.y + (socket.y - 256) * scale,
  });
  expect(dogTraderAttackOrigin(snapshot)).not.toEqual(feet);
});

it('GameScene production createSession만 dogTrader origin dependency와 composite factory를 주입한다', () => {
  const source = readFileSync(
    new URL('../../src/game/scenes/GameScene.ts', import.meta.url),
    'utf8',
  );
  expect(source).toContain('protected sessionDependencies(): GameSessionDependencies');
  expect(source).toContain('projectileOriginByKind: { dogTrader: dogTraderAttackOrigin }');
  expect(source).toContain('GameSession.create({ seed }, this.sessionDependencies())');
  expect(source).toContain('compositeRigFactory:');
  expect(source).toContain('new PhaserDogTraderParts(scene)');
});

function dogTraderSnapshot(
  pathId: EnemySnapshot['pathId'],
  pathProgress: number,
): EnemySnapshot {
  return {
    id: 5,
    kind: 'dogTrader',
    variant: 'male',
    state: 'windup',
    pathId,
    pathProgress,
    position: DEFAULT_PATH_POSE_SAMPLERS[pathId].sampleExtended(pathProgress).position,
    etaMs: 0,
    currentHp: 900,
    maxHp: 900,
    spawnSequence: 0,
    isBoss: true,
    moveSpeedMultiplier: 1,
    slowRemainingMs: 0,
    dashCooldownRemainingMs: 0,
    animationElapsedMs: 499,
  };
}
