import { expect, it, vi } from 'vitest';
import type { ProjectileSpawn } from '../../src/game/combat/ProjectileSystem';
import { FIXED_STEP_MS } from '../../src/game/constants';
import { E2eGameScene } from '../../src/game/debug/E2eGameScene';
import type { ScenarioSessionPort } from '../../src/game/debug/ScenarioSessionPort';
import { GameScene } from '../../src/game/scenes/GameScene';
import type { RunSnapshot } from '../../src/game/session/RunSnapshot';
import { enemy } from './fixtures';

vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
  },
}));

it.each([0, 1, 3])(
  'RAF은 fixed step %i개 뒤 하나의 post-step RunSnapshot을 모든 render에 공유한다',
  (stepCount) => {
    const harness = createRafHarness(stepCount);

    harness.scene.update(0, 16);

    expect(harness.sessionStep).toHaveBeenCalledTimes(stepCount);
    if (stepCount > 0) {
      expect(harness.sessionStep.mock.invocationCallOrder.at(-1)).toBeLessThan(
        harness.sessionSnapshot.mock.invocationCallOrder[0]!,
      );
    }
    expect(harness.sessionSnapshot).toHaveBeenCalledOnce();
    expect(harness.hudRender).toHaveBeenCalledOnce();
    expect(harness.hudRender).toHaveBeenCalledWith(harness.snapshot);
    expect(harness.companionRender).toHaveBeenCalledOnce();
    expect(harness.companionRender.mock.calls[0]![0].companion)
      .toBe(harness.snapshot.companion);
    expect(harness.enemyRender).toHaveBeenCalledOnce();
    expect(harness.enemyRender.mock.calls[0]![0]).toBe(harness.snapshot.enemies);
    expect(harness.projectileRender).toHaveBeenCalledOnce();
    expect(harness.projectileRender.mock.calls[0]![0]).toBe(harness.snapshot.projectiles);
    expect(harness.damageRender).toHaveBeenCalledOnce();
    expect(harness.projectileRender.mock.invocationCallOrder[0]).toBeLessThan(
      harness.damageRender.mock.invocationCallOrder[0]!,
    );
    expect(harness.damageRender.mock.invocationCallOrder[0]).toBeLessThan(
      harness.hudRender.mock.invocationCallOrder[0]!,
    );
  },
);

it('manual fixed step은 기본 동작으로 HUD를 즉시 한 snapshot으로 render한다', () => {
  const harness = createRafHarness(0);

  harness.scene.advanceSimulationStep(FIXED_STEP_MS);

  expect(harness.sessionStep).toHaveBeenCalledOnce();
  expect(harness.sessionSnapshot).toHaveBeenCalledOnce();
  expect(harness.hudRender).toHaveBeenCalledOnce();
  expect(harness.hudRender).toHaveBeenCalledWith(harness.snapshot);
});

it('RAF은 논리 step 뒤 하나의 RunSnapshot을 네 render에 공유한다', () => {
  const logicalEnemy = enemy({ id: 7, position: { x: 270, y: 430 } });
  const untouchedEnemy = enemy({ id: 8, position: { x: 320, y: 480 } });
  const snapshot = runSnapshot([logicalEnemy, untouchedEnemy]);
  const sessionSnapshot = vi.fn(() => snapshot);
  const companionRender = vi.fn();
  const enemyRender = vi.fn();
  const projectileRender = vi.fn();
  const observeProjectileRender = vi.fn();
  const hudRender = vi.fn();
  const advanceSimulationStep = vi.fn(() => []);
  const scene = Object.create(E2eGameScene.prototype) as E2eGameScene;
  Object.defineProperties(scene, {
    manualClock: { value: false },
    fixedClock: { value: { consume: vi.fn(() => [FIXED_STEP_MS]) } },
    advanceSimulationStep: { value: advanceSimulationStep },
    worldPaused: { value: false },
    session: { value: { snapshot: sessionSnapshot } },
    playerController: { value: { snapshot: vi.fn(() => ({ x: 270, y: 650 })) } },
    playerView: { value: { render: vi.fn() } },
    companionView: { value: { render: companionRender } },
    enemyActors: { value: { render: enemyRender } },
    projectileActors: { value: { render: projectileRender } },
    presentationStress: { value: { observeProjectileRender } },
    impactFeedback: { value: { render: vi.fn() } },
    hud: { value: { render: hudRender } },
    presentationStressPositions: { value: new Map([[7, { x: 60, y: 130 }]]) },
    worldAnimationMs: { value: 500 },
    moving: { value: false },
    lastMovementFacing: { value: { x: 0, y: -1 } },
    barkAnimationElapsedMs: { value: undefined },
    playerBodyAction: { value: undefined },
    reducedMotion: { value: false },
  });

  scene.update(0, 16);

  expect(advanceSimulationStep).toHaveBeenCalledWith(FIXED_STEP_MS, false);
  expect(advanceSimulationStep.mock.invocationCallOrder[0]).toBeLessThan(
    sessionSnapshot.mock.invocationCallOrder[0]!,
  );
  expect(sessionSnapshot).toHaveBeenCalledOnce();
  expect(companionRender.mock.calls[0]![0].companion).toBe(snapshot.companion);
  expect(projectileRender).toHaveBeenCalledOnce();
  expect(projectileRender.mock.calls[0]![0]).toBe(snapshot.projectiles);
  expect(observeProjectileRender).toHaveBeenCalledOnce();
  expect(hudRender).toHaveBeenCalledOnce();
  expect(hudRender).toHaveBeenCalledWith(snapshot);
  const [renderedEnemies, renderDeltaMs] = enemyRender.mock.calls[0]!;
  expect(renderedEnemies).toEqual([
    { ...logicalEnemy, position: { x: 60, y: 130 } },
    untouchedEnemy,
  ]);
  expect(renderedEnemies[1]).toBe(untouchedEnemy);
  expect(renderDeltaMs).toBe(16);
});

it('stress maintenance는 simulation·presentation·audio만 진행하고 projectile render는 RAF에 위임한다', () => {
  const harness = createScenarioHarness();

  harness.port.maintainStressPools();

  expect(harness.scenario.maintainStressProjectiles).toHaveBeenCalledOnce();
  expect(harness.presentationStep).toHaveBeenCalledWith(FIXED_STEP_MS, 3);
  expect(harness.audioObserve).toHaveBeenCalledOnce();
  expect(harness.renderProjectiles).not.toHaveBeenCalled();
});

it('projectile maintainer가 부분 변경 뒤 실패하면 local stress state를 모두 닫고 원 오류를 보존한다', () => {
  const harness = createScenarioHarness();
  const producerFailure = new Error('Projectile producer failed after partial refill');
  const audioCleanupFailure = new Error('Audio cleanup failed');
  const cleanupFailure = new Error('Presentation cleanup failed');
  harness.scenario.maintainStressProjectiles.mockImplementationOnce(() => {
    throw producerFailure;
  });
  harness.audioReset.mockImplementationOnce(() => {
    throw audioCleanupFailure;
  });
  harness.presentationReset.mockImplementationOnce(() => {
    harness.presentationState.active = false;
    throw cleanupFailure;
  });

  let thrown: unknown;
  try {
    harness.port.maintainStressPools();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBe(producerFailure);
  expect(harness.audioReset).toHaveBeenCalledOnce();
  expect(harness.presentationReset).toHaveBeenCalledOnce();
  expect(harness.presentationState.active).toBe(false);
  expect(harness.presentationPositions.size).toBe(0);
  expect(harness.presentationStep).not.toHaveBeenCalled();
  expect(harness.audioObserve).not.toHaveBeenCalled();
});

it('presentation start 실패도 audio/controller/positions를 all-attempt 정리하고 원 오류를 보존한다', () => {
  const startFailure = new Error('Presentation start failed after partial activation');
  const audioCleanupFailure = new Error('Audio start cleanup failed');
  const presentationCleanupFailure = new Error('Presentation start cleanup failed');
  const positions = new Map([[7, { x: 60, y: 130 }]]);
  let presentationActive = false;
  const resetAudio = vi.fn(() => { throw audioCleanupFailure; });
  const resetPresentation = vi.fn(() => {
    presentationActive = false;
    throw presentationCleanupFailure;
  });
  const scene = Object.create(E2eGameScene.prototype) as E2eGameScene;
  Object.defineProperties(scene, {
    presentationStressPositions: { value: positions },
    presentationStress: {
      value: {
        start: () => {
          presentationActive = true;
          throw startFailure;
        },
        reset: resetPresentation,
      },
    },
    audioStress: { value: { reset: resetAudio } },
  });

  let thrown: unknown;
  try {
    scene.startPresentationStress();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBe(startFailure);
  expect(resetAudio).toHaveBeenCalledOnce();
  expect(resetPresentation).toHaveBeenCalledOnce();
  expect(presentationActive).toBe(false);
  expect(positions.size).toBe(0);
});

it('scenario seed와 terminal tie는 projectile을 즉시 render한다', () => {
  const harness = createScenarioHarness();

  harness.port.seedProjectile(PROJECTILE);
  expect(harness.scenario.spawnProjectile).toHaveBeenCalledWith(PROJECTILE);
  expect(harness.renderProjectiles).toHaveBeenCalledOnce();

  harness.port.prepareTerminalTie();

  expect(harness.scenario.prepareTerminalTie).toHaveBeenCalledOnce();
  expect(harness.renderProjectiles).toHaveBeenCalledTimes(2);
  expect(harness.renderEnemies).toHaveBeenCalledOnce();
  expect(harness.renderHud).toHaveBeenCalledOnce();
});

it('stress telemetry arm seam은 controller generation을 한 번 arm한다', () => {
  const arm = vi.fn();
  const scene = Object.create(E2eGameScene.prototype) as E2eGameScene;
  Object.defineProperty(scene, 'presentationStress', { value: { arm } });

  scene.armPresentationStress();

  expect(arm).toHaveBeenCalledOnce();
});

const PROJECTILE: ProjectileSpawn = {
  id: 1,
  castId: 'test:1',
  enemyId: 7,
  kind: 'poopGuardian',
  projectileKind: 'poop',
  from: { x: 60, y: 130 },
  to: { x: 270, y: 480 },
  speed: 1,
  damage: 0,
  lifeMs: 60_000,
};

function runSnapshot(enemies: RunSnapshot['enemies']): RunSnapshot {
  const skill = {
    learned: false,
    cooldownRemainingMs: 0,
    ready: false,
    progress: 0,
    activeCastId: null,
  } as const;
  return {
    mode: 'playing',
    simulationMs: 0,
    wave: 1,
    shelterHp: 1000,
    shelterMaxHp: 1000,
    snacks: 0,
    nextSkillCost: 15,
    learnedSkills: { tailSwipe: false, aquaBeam: false, safetyReport: false },
    skillStates: { tailSwipe: skill, aquaBeam: skill, safetyReport: skill },
    companion: { companion: 'deokbae', active: true, cooldownRemainingMs: 0 },
    enemies,
    projectiles: [{ id: 1, kind: 'poop', x: 60, y: 130, speed: 1, damage: 0, lifeMs: 60_000 }],
    activeEnemyCount: enemies.length,
    pendingSpawns: 0,
    activeProjectileCount: 1,
  };
}

function createRafHarness(stepCount: number): {
  readonly scene: GameScene;
  readonly snapshot: RunSnapshot;
  readonly sessionStep: ReturnType<typeof vi.fn>;
  readonly sessionSnapshot: ReturnType<typeof vi.fn>;
  readonly hudRender: ReturnType<typeof vi.fn>;
  readonly companionRender: ReturnType<typeof vi.fn>;
  readonly enemyRender: ReturnType<typeof vi.fn>;
  readonly projectileRender: ReturnType<typeof vi.fn>;
  readonly damageRender: ReturnType<typeof vi.fn>;
} {
  const snapshot = runSnapshot([enemy({ id: 70 })]);
  const sessionStep = vi.fn(() => []);
  const sessionSnapshot = vi.fn(() => snapshot);
  const hudRender = vi.fn();
  const companionRender = vi.fn();
  const enemyRender = vi.fn();
  const projectileRender = vi.fn();
  const damageRender = vi.fn();
  const playerSnapshot = vi.fn(() => ({ x: 270, y: 650 }));
  const scene = Object.create(GameScene.prototype) as GameScene;
  Object.defineProperties(scene, {
    manualClock: { value: false },
    fixedClock: {
      value: {
        consume: vi.fn(() => Array.from({ length: stepCount }, () => FIXED_STEP_MS)),
      },
    },
    worldPaused: { value: false },
    session: {
      value: {
        currentMode: vi.fn(() => 'countdown'),
        modeStateForControllers: vi.fn(() => ({ canStepWorld: () => false })),
        step: sessionStep,
        snapshot: sessionSnapshot,
      },
    },
    movementIntent: { value: { read: vi.fn(() => ({ x: 0, y: 0, magnitude: 0 })) } },
    hud: { value: { step: vi.fn(), render: hudRender } },
    playerController: { value: { snapshot: playerSnapshot } },
    playerView: { value: { render: vi.fn() } },
    companionView: { value: { render: companionRender } },
    enemyActors: { value: { render: enemyRender } },
    projectileActors: { value: { render: projectileRender } },
    impactFeedback: { value: { render: damageRender } },
    worldAnimationMs: { value: 0 },
    moving: { value: false },
    lastMovementFacing: { value: { x: 0, y: -1 } },
    barkAnimationElapsedMs: { value: undefined },
    playerBodyAction: { value: undefined },
    reducedMotion: { value: false },
  });
  return {
    scene,
    snapshot,
    sessionStep,
    sessionSnapshot,
    hudRender,
    companionRender,
    enemyRender,
    projectileRender,
    damageRender,
  };
}

function createScenarioHarness(): {
  readonly port: ReturnType<E2eGameScene['scenarioAdapter']>;
  readonly scenario: { readonly [Key in keyof ScenarioSessionPort]: ReturnType<typeof vi.fn> };
  readonly presentationStep: ReturnType<typeof vi.fn>;
  readonly presentationReset: ReturnType<typeof vi.fn>;
  readonly presentationState: { active: boolean };
  readonly presentationPositions: Map<number, Readonly<{ x: number; y: number }>>;
  readonly audioObserve: ReturnType<typeof vi.fn>;
  readonly audioReset: ReturnType<typeof vi.fn>;
  readonly renderProjectiles: ReturnType<typeof vi.fn>;
  readonly renderEnemies: ReturnType<typeof vi.fn>;
  readonly renderHud: ReturnType<typeof vi.fn>;
} {
  const scenario = {
    spawnEnemy: vi.fn(() => 1),
    removeEnemyWithoutReward: vi.fn(),
    suppressWaveSpawns: vi.fn(),
    useWaveSchedule: vi.fn(),
    grantSnacks: vi.fn(),
    spawnProjectile: vi.fn(),
    maintainStressProjectiles: vi.fn(() => 3),
    prepareTerminalTie: vi.fn(),
    resetSimulationClock: vi.fn(),
    projectilePoolTelemetry: vi.fn(),
  };
  const presentationStep = vi.fn();
  const presentationState = { active: true };
  const presentationReset = vi.fn(() => { presentationState.active = false; });
  const presentationPositions = new Map([[7, { x: 60, y: 130 }]]);
  const audioObserve = vi.fn();
  const audioReset = vi.fn();
  const renderProjectiles = vi.fn();
  const renderEnemies = vi.fn();
  const renderHud = vi.fn();
  const scene = Object.create(E2eGameScene.prototype) as E2eGameScene;
  Object.defineProperties(scene, {
    session: { value: { scenarioAdapter: () => scenario } },
    presentationStress: {
      value: { snapshot: () => null, step: presentationStep, reset: presentationReset },
    },
    audioStress: { value: { observe: audioObserve, reset: audioReset } },
    presentationStressPositions: { value: presentationPositions },
    renderProjectiles: { value: renderProjectiles },
    renderEnemies: { value: renderEnemies },
    renderHud: { value: renderHud },
  });
  return {
    port: scene.scenarioAdapter(),
    scenario,
    presentationStep,
    presentationReset,
    presentationState,
    presentationPositions,
    audioObserve,
    audioReset,
    renderProjectiles,
    renderEnemies,
    renderHud,
  };
}
