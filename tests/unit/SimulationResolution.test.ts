import { FIXED_STEP_MS } from '../../src/game/constants';
import { FixedStepClock } from '../../src/game/core/FixedStepClock';
import { GameSession } from '../../src/game/session/GameSession';
import type { RunSnapshot } from '../../src/game/session/RunSnapshot';

function normalizeSnapshot(snapshot: RunSnapshot): unknown {
  return JSON.parse(JSON.stringify(snapshot, (_key, value: unknown) => (
    typeof value === 'number' ? Math.round(value * 1_000_000) / 1_000_000 : value
  )));
}

function simulateWithRenderDeltas(deltas: readonly number[], seed: number): unknown {
  const run = GameSession.create({ seed });
  const clock = new FixedStepClock(FIXED_STEP_MS, 5);
  for (const delta of deltas) {
    for (const stepMs of clock.consume(delta)) {
      run.step(stepMs, { x: 270, y: 650 });
    }
  }
  return normalizeSnapshot(run.snapshot());
}

it('RunSnapshot은 companion과 V2 구매 상태를 포함한 exact 초기 상태를 제공한다', () => {
  expect(GameSession.create({ seed: 7 }).snapshot()).toEqual({
    mode: 'playing',
    simulationMs: 0,
    wave: 1,
    pendingSpawns: 10,
    activeEnemyCount: 0,
    activeProjectileCount: 0,
    playerHp: 1000,
    playerMaxHp: 1000,
    snacks: 0,
    nextSkillCost: 15,
    learnedSkills: { tailSwipe: false, aquaBeam: false, safetyReport: false },
    skillStates: {
      tailSwipe: { learned: false, cooldownRemainingMs: 0, ready: false, progress: 0, activeCastId: null },
      aquaBeam: { learned: false, cooldownRemainingMs: 0, ready: false, progress: 0, activeCastId: null },
      safetyReport: { learned: false, cooldownRemainingMs: 0, ready: false, progress: 0, activeCastId: null },
    },
    companion: { companion: 'deokbae', active: true, cooldownRemainingMs: 0 },
    enemies: [],
    projectiles: [],
  });
});

it('60fps와 30fps render delta가 내부 규칙 상태까지 같은 10초 결과를 만든다', () => {
  const at60 = simulateWithRenderDeltas(Array(600).fill(1000 / 60), 7);
  const at30 = simulateWithRenderDeltas(Array(300).fill(1000 / 30), 7);

  expect(at30).toEqual(at60);
});
