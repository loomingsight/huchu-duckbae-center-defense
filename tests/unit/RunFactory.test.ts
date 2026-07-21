import { expect, it, vi } from 'vitest';
import { FIXED_STEP_MS } from '../../src/game/constants';
import { E2eGameSession } from '../../src/game/debug/E2eGameSession';
import { loadScenario, TEST_SCENARIO_IDS, type SessionScenarioRuntime } from '../../src/game/debug/ScenarioFactory';
import type { ScenarioEnemySeed, ScenarioWaveSchedule } from '../../src/game/debug/ScenarioSessionPort';

const PLAYER = { x: 270, y: 650 } as const;

it('E2E run factory는 V2 구매와 companion snapshot만 노출한다', () => {
  const run = E2eGameSession.create({ seed: 424242 });
  expect(run.snapshot()).toMatchObject({
    shelterHp: 1000,
    companion: { companion: 'deokbae', active: true },
    nextSkillCost: 15,
    learnedSkills: { tailSwipe: false, aquaBeam: false, safetyReport: false },
  });
  expect(run.queueSkillPurchase('tailSwipe')).toMatchObject({
    status: 'insufficientSnacks', skillId: 'tailSwipe', snacks: 0, nextCost: 15,
  });
});

it('E2E session은 dogTrader projectile-origin dependency를 그대로 보존한다', () => {
  const hand = { x: 123, y: 234 };
  const run = E2eGameSession.create({ seed: 7 }, {
    projectileOriginByKind: { dogTrader: () => hand },
  });
  const scenario = run.scenarioPortForE2e();
  scenario.useWaveSchedule(1, 'exhausted');
  scenario.spawnEnemy({
    kind: 'dogTrader', variant: 'male', pathId: 'P2', placement: { kind: 'attackBoundary' },
  });
  const events = [];
  for (let index = 0; index < 30; index += 1) events.push(...run.step(FIXED_STEP_MS, PLAYER));
  expect(events.find((event) => event.type === 'projectileRequested')).toMatchObject({
    type: 'projectileRequested', from: hand, projectileKind: 'net',
  });
});

it('debug hold는 production state를 만들지 않고 path progress만 복원한다', () => {
  const run = E2eGameSession.create({ seed: 7 });
  const scenario = run.scenarioPortForE2e();
  scenario.useWaveSchedule(1, 'held');
  const enemyId = scenario.spawnEnemy({
    kind: 'poopGuardian', variant: 'male', pathId: 'P3',
    placement: { kind: 'pathProgress', value: 100 }, heldForDebug: true,
  });
  const before = run.snapshot().enemies.find(({ id }) => id === enemyId)!;
  for (let index = 0; index < 60; index += 1) run.step(FIXED_STEP_MS, PLAYER);
  const after = run.snapshot().enemies.find(({ id }) => id === enemyId)!;
  expect(after.pathProgress).toBe(before.pathProgress);
  expect(['moving', 'windup', 'holding', 'dead']).toContain(after.state);
});

it('reset은 같은 projectile pool을 재사용하고 V2 초기 상태를 복원한다', () => {
  const run = E2eGameSession.create({ seed: 7 });
  const initialPool = run.scenarioPortForE2e().projectilePoolTelemetry();
  run.scenarioPortForE2e().spawnProjectile({
    id: 1, castId: 'test:1', enemyId: 1, kind: 'poopGuardian', projectileKind: 'poop',
    from: { x: 0, y: 0 }, to: { x: 270, y: 480 }, speed: 1, damage: 0, lifeMs: 1000,
  });
  run.reset(8);
  expect(run.snapshot()).toMatchObject({ mode: 'playing', shelterHp: 1000, snacks: 0, activeEnemyCount: 0, activeProjectileCount: 0 });
  expect(run.scenarioPortForE2e().projectilePoolTelemetry()).toEqual(initialPool);
});

it('exact 18 scenario와 full-run/skill-dock/boss/stress seed 규칙을 고정한다', async () => {
  expect(TEST_SCENARIO_IDS).toHaveLength(18);
  for (const id of TEST_SCENARIO_IDS) {
    const enemies: ScenarioEnemySeed[] = [];
    const schedules: Array<[number, ScenarioWaveSchedule]> = [];
    const runtime: SessionScenarioRuntime = {
      stopScenarioMaintainers: vi.fn(), resetManualScheduler: vi.fn(), resetEventLog: vi.fn(),
      resetSession: vi.fn(), resetScenarioPresentation: vi.fn(), resetPlayer: vi.fn(),
      seedEnemy: vi.fn((seed) => { enemies.push(seed); return enemies.length - 1; }),
      useWaveSchedule: (wave, schedule) => { schedules.push([wave, schedule]); },
      grantSnacks: vi.fn(), seedProjectile: vi.fn(), enableStressMaintenance: async () => undefined,
      enablePresentationStress: vi.fn(), resetSimulationClock: vi.fn(), enableWaveAutoClear: vi.fn(),
    };
    await loadScenario(runtime, id);
    if (id === 'full-run') {
      expect(schedules).toEqual([[1, 'real']]);
      expect(runtime.enableWaveAutoClear).not.toHaveBeenCalled();
      expect(enemies).toEqual([]);
    }
    if (id === 'skill-dock') {
      expect(runtime.grantSnacks).toHaveBeenCalledWith(85);
      expect(enemies).toHaveLength(1);
      expect(enemies[0]).toMatchObject({ heldForDebug: true });
    }
    const pathMatch = /^boss-rig-p([1-6])$/.exec(id);
    if (pathMatch !== null) {
      expect(enemies).toHaveLength(1);
      expect(enemies[0]).toMatchObject({
        kind: 'dogTrader', pathId: `P${pathMatch[1]}`,
        placement: { kind: 'pathProgress', value: -70 }, heldForDebug: true,
      });
    }
    if (id === 'boss-rig-corner-p2') {
      expect(enemies[0]).toMatchObject({ placement: { kind: 'pathProgress', value: 150 }, heldForDebug: false });
    }
    if (id === 'stress') {
      expect(enemies).toHaveLength(60);
      expect(enemies.map(({ pathId }) => pathId)).toEqual(
        Array.from({ length: 60 }, (_, index) => `P${index % 3 + 1}`),
      );
      expect(enemies.map(({ placement }) => placement)).toEqual(
        Array.from({ length: 60 }, (_, index) => ({
          kind: 'worldPoint',
          x: 60 + index % 12 * 38,
          y: 130 + Math.floor(index / 12) * 50,
        })),
      );
      expect(enemies.every(({ placement }) => (
        placement.kind === 'worldPoint'
        && Math.hypot(placement.x - PLAYER.x, placement.y - PLAYER.y) > 216
      ))).toBe(true);
      expect(runtime.seedProjectile).toHaveBeenCalledTimes(80);
      expect(runtime.enablePresentationStress).toHaveBeenCalledOnce();
      expect(vi.mocked(runtime.enablePresentationStress).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(runtime.seedEnemy).mock.invocationCallOrder[0]!,
      );

      const logicalRun = E2eGameSession.create({ seed: 424242 });
      const logicalScenario = logicalRun.scenarioPortForE2e();
      logicalScenario.useWaveSchedule(1, 'held');
      enemies.forEach((enemy) => logicalScenario.spawnEnemy(enemy));

      expect(logicalRun.snapshot().enemies.every(({ position }) => (
        Math.hypot(position.x - PLAYER.x, position.y - PLAYER.y) > 216
      ))).toBe(true);

      const combatEvents = [];
      for (let tick = 0; tick < 15; tick += 1) {
        combatEvents.push(...logicalRun.step(FIXED_STEP_MS, PLAYER).filter(({ type }) => (
          type === 'barkStarted'
          || type === 'barkImpact'
          || type === 'companionAttackStarted'
          || type === 'companionAttack'
          || type === 'projectileRequested'
          || type === 'damageApplied'
        )));
      }
      expect(combatEvents).toEqual([]);
    }
  }
});
