import type { HuchuTestBridge } from '../../src/game/debug/TestContract';
import { vi } from 'vitest';
import { FIXED_STEP_MS } from '../../src/game/constants';
import { E2eGameScene } from '../../src/game/debug/E2eGameScene';
import { E2eGameSession } from '../../src/game/debug/E2eGameSession';
import {
  installOwnedTestBridge,
  SessionTestBridge,
  type LogicalBatchEvent,
} from '../../src/game/debug/TestBridge';
import { MutableMovementIntentPort } from '../../src/game/player/MovementIntentPort';
import { PlayerController } from '../../src/game/player/PlayerController';
import { GameScene } from '../../src/game/scenes/GameScene';
import { SceneRuntimeLifecycle } from '../../src/game/scenes/SceneRuntimeLifecycle';

vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
  },
}));

const bridge = (name: string) => ({ name }) as unknown as HuchuTestBridge;

it('disposer는 자신이 설치한 bridge가 아니면 다른 generation의 bridge를 지우지 않는다', () => {
  const target: { __HUCHU_TEST__?: HuchuTestBridge } = {};
  const first = bridge('first');
  const second = bridge('second');
  const disposeFirst = installOwnedTestBridge(target, first);
  const disposeSecond = installOwnedTestBridge(target, second);

  disposeFirst();
  expect(target.__HUCHU_TEST__).toBe(second);
  disposeSecond();
  expect(target.__HUCHU_TEST__).toBeUndefined();
});

it('import 완료 전 shutdown과 설치 후 shutdown 모두 stale disposer를 남기지 않는다', () => {
  const lifecycle = new SceneRuntimeLifecycle();
  const disposed: string[] = [];

  const beforeImport = lifecycle.begin();
  lifecycle.end(beforeImport);
  expect(lifecycle.isActive(beforeImport)).toBe(false);
  expect(lifecycle.attach(beforeImport, () => disposed.push('late'))).toBe(false);
  expect(disposed).toEqual(['late']);

  const afterInstall = lifecycle.begin();
  expect(lifecycle.attach(afterInstall, () => disposed.push('installed'))).toBe(true);
  lifecycle.end(afterInstall);
  expect(disposed).toEqual(['late', 'installed']);
  expect(lifecycle.isActive(afterInstall)).toBe(false);
});

it('같은 generation의 bridge와 overlay disposer는 서로 제거하지 않고 shutdown 때 함께 정리한다', () => {
  const lifecycle = new SceneRuntimeLifecycle();
  const disposed: string[] = [];
  const generation = lifecycle.begin();

  expect(lifecycle.attach(generation, () => disposed.push('bridge'))).toBe(true);
  expect(lifecycle.attach(generation, () => disposed.push('overlay'))).toBe(true);
  expect(disposed).toEqual([]);

  lifecycle.end(generation);

  expect(disposed).toEqual(['bridge', 'overlay']);
});

it('lifecycle cleanup은 여러 disposer가 실패해도 모두 실행하고 첫 오류 identity를 다시 던진다', () => {
  const lifecycle = new SceneRuntimeLifecycle();
  const generation = lifecycle.begin();
  const firstError = new Error('first cleanup failed');
  const secondError = new Error('second cleanup failed');
  const calls: string[] = [];
  lifecycle.attach(generation, () => {
    calls.push('first');
    throw firstError;
  });
  lifecycle.attach(generation, () => calls.push('middle'));
  lifecycle.attach(generation, () => {
    calls.push('last');
    throw secondError;
  });

  let thrown: unknown;
  try {
    lifecycle.end(generation);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBe(firstError);
  expect(calls).toEqual(['first', 'middle', 'last']);
  expect(lifecycle.isActive(generation)).toBe(false);
});

it('E2E post-shutdown cleanup은 presentation GameObject pool을 건드리지 않고 non-GameObject cleanup을 끝낸다', () => {
  const positions = new Map([[7, { x: 60, y: 130 }]]);
  const audioError = new Error('audio cleanup failed');
  const presentationError = new Error('presentation cleanup failed');
  const bridgeError = new Error('bridge cleanup failed');
  const effectReleaseAll = vi.fn(() => { throw presentationError; });
  const damageReset = vi.fn();
  const effectWorkloadCounters = vi.fn(() => ({
    topology: 'effects/blitter-120-bobs+lazy-graphics@1' as const,
    poolInstanceId: 1,
    allocatedRoots: 1,
    allocatedChildren: 120,
    impactActive: 0,
    renderEligibleBobs: 0,
    graphicsAllocated: 0,
    graphicsVisible: 0,
    stepPasses: 0,
    activeActorVisits: 0,
    visibleDrawableVisits: 0,
    stateVersion: 0,
    activations: 0,
    releases: 0,
    rejected: 0,
  }));
  const projectileLogicalWorkloadCounters = vi.fn(() => ({
    poolInstanceId: 2,
    active: 0,
    logicalStepPasses: 0,
    logicalActorVisits: 0,
    activations: 0,
    releases: 0,
    rejected: 0,
  }));
  const projectileViewWorkloadCounters = vi.fn(() => ({
    topology: 'projectiles/image@2' as const,
    poolInstanceId: 3,
    allocatedRoots: 80,
    allocatedChildren: 0,
    active: 0,
    visibleRoots: 0,
    visibleLeaves: 0,
    renderPasses: 0,
    requestedVisits: 0,
    visibleRootVisits: 0,
    stateVersion: 0,
    activations: 0,
    releases: 0,
    rejected: 0,
  }));
  const damageWorkloadCounters = vi.fn(() => ({
    topology: 'damage/bitmap-text@1' as const,
    poolInstanceId: 4,
    allocatedRoots: 64,
    allocatedChildren: 0,
    active: 0,
    renderEligibleTexts: 0,
    stepPasses: 0,
    activeActorVisits: 0,
    visibleDrawableVisits: 0,
    stateVersion: 0,
    activations: 0,
    merges: 0,
    evictions: 0,
    expirations: 0,
    rejected: 0,
  }));
  let runtimeCleanup: (() => void) | undefined;
  const baseCreate = vi.spyOn(GameScene.prototype, 'create').mockImplementation(() => undefined);
  try {
    const scene = Object.create(E2eGameScene.prototype) as E2eGameScene;
    Object.defineProperties(scene, {
      presentationStressPositions: { value: positions },
      combatEffects: {
        value: { releaseAll: effectReleaseAll, workloadCounters: effectWorkloadCounters },
      },
      session: {
        value: { projectileWorkloadCounters: projectileLogicalWorkloadCounters },
      },
      projectileActors: {
        value: { workloadCounters: projectileViewWorkloadCounters },
      },
      attachRuntimeCleanup: {
        value: (dispose: () => void) => { runtimeCleanup = dispose; },
      },
      damageFeedbackPoolForAdapters: {
        value: () => ({
          reset: damageReset,
          show: vi.fn(() => true),
          workloadCounters: damageWorkloadCounters,
        }),
      },
      audioSystemForAdapters: {
        value: () => ({
          handle: vi.fn(() => { throw audioError; }),
        }),
      },
    });

    scene.create();
    expect(effectWorkloadCounters).toHaveBeenCalledOnce();
    expect(projectileLogicalWorkloadCounters).toHaveBeenCalledOnce();
    expect(projectileViewWorkloadCounters).toHaveBeenCalledOnce();
    expect(damageWorkloadCounters).toHaveBeenCalledOnce();
    const bridgeCleanup = vi.fn(() => { throw bridgeError; });
    Object.defineProperty(scene, 'disposeTestBridge', {
      configurable: true,
      value: bridgeCleanup,
      writable: true,
    });
    expect(runtimeCleanup).toBeTypeOf('function');
    let thrown: unknown;
    try {
      runtimeCleanup!();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(audioError);
    expect(positions.size).toBe(0);
    expect(damageReset).not.toHaveBeenCalled();
    expect(effectReleaseAll).not.toHaveBeenCalled();
    expect(bridgeCleanup).toHaveBeenCalledOnce();
  } finally {
    baseCreate.mockRestore();
  }
});

it('GameScene post-shutdown은 Phaser GameObject cleanup을 반복하지 않고 refs와 non-GameObject state를 정리한다', () => {
  const firstError = new Error('runtime cleanup failed');
  const destroyCountdown = vi.fn(() => { throw new Error('countdown cleanup failed'); });
  const destroyHud = vi.fn();
  const resetPresentation = vi.fn();
  const resetTrader = vi.fn();
  const resetDedupe = vi.fn();
  const destroyShelter = vi.fn();
  const destroyPlayer = vi.fn();
  const destroyCompanion = vi.fn();
  const destroyKeyboard = vi.fn();
  const resetMovement = vi.fn();
  const scene = Object.create(GameScene.prototype) as GameScene;
  Object.defineProperties(scene, {
    runtimeLifecycle: { value: {
      isActive: vi.fn(() => true),
      end: vi.fn(() => { throw firstError; }),
    } },
    sessionResetListeners: { value: new Set([vi.fn()]) },
    countdownOverlay: { value: { destroy: destroyCountdown } },
    hud: { value: { destroy: destroyHud } },
    presentationTelemetry: { value: { reset: resetPresentation } },
    dogTraderTelemetry: { value: { reset: resetTrader } },
    impactFeedback: { value: { resetDedupe } },
    enemyActors: { configurable: true, value: {}, writable: true },
    projectileActors: { configurable: true, value: {}, writable: true },
    shelterView: { configurable: true, value: { destroy: destroyShelter }, writable: true },
    playerView: { value: { destroy: destroyPlayer } },
    companionView: { value: { destroy: destroyCompanion } },
    keyboardInput: { value: { destroy: destroyKeyboard } },
    movementIntent: { value: { reset: resetMovement } },
  });

  let thrown: unknown;
  try {
    (scene as unknown as { shutdownRuntime(generation: number): void }).shutdownRuntime(1);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBe(firstError);
  expect(destroyCountdown).not.toHaveBeenCalled();
  expect(destroyHud).toHaveBeenCalledOnce();
  expect(resetPresentation).not.toHaveBeenCalled();
  expect(resetTrader).toHaveBeenCalledOnce();
  expect(resetDedupe).toHaveBeenCalledOnce();
  expect(destroyShelter).not.toHaveBeenCalled();
  expect(destroyPlayer).not.toHaveBeenCalled();
  expect(destroyCompanion).not.toHaveBeenCalled();
  expect(destroyKeyboard).toHaveBeenCalledOnce();
  expect(resetMovement).toHaveBeenCalledOnce();
  expect((scene as unknown as { sessionResetListeners: Set<unknown> }).sessionResetListeners.size)
    .toBe(0);
  expect((scene as unknown as { enemyActors?: unknown }).enemyActors).toBeUndefined();
  expect((scene as unknown as { projectileActors?: unknown }).projectileActors).toBeUndefined();
  expect((scene as unknown as { shelterView?: unknown }).shelterView).toBeUndefined();
});

it('GameScene restart는 visible 문서에서 자신이 획득한 audio lifecycle pause를 반환한다', () => {
  vi.stubGlobal('document', { hidden: false });
  const resumeForLifecycle = vi.fn(async () => undefined);
  const scene = Object.create(GameScene.prototype) as GameScene;
  Object.defineProperties(scene, {
    runtimeLifecycle: { value: { isActive: vi.fn(() => true), end: vi.fn() } },
    sessionResetListeners: { value: new Set() },
    hud: { value: { destroy: vi.fn() } },
    dogTraderTelemetry: { value: { reset: vi.fn() } },
    impactFeedback: { value: { resetDedupe: vi.fn() } },
    enemyActors: { configurable: true, value: {}, writable: true },
    projectileActors: { configurable: true, value: {}, writable: true },
    shelterView: { configurable: true, value: {}, writable: true },
    keyboardInput: { value: { destroy: vi.fn() } },
    movementIntent: { value: { reset: vi.fn() } },
    audio: { value: { resumeForLifecycle } },
    audioLifecyclePaused: { configurable: true, value: true, writable: true },
  });

  (scene as unknown as { shutdownRuntime(generation: number): void }).shutdownRuntime(1);

  expect(resumeForLifecycle).toHaveBeenCalledOnce();
  expect((scene as unknown as { audioLifecyclePaused: boolean }).audioLifecyclePaused).toBe(false);
  vi.unstubAllGlobals();
});

it('늦게 도착한 이전 generation shutdown은 현재 Scene의 audio lease와 runtime을 건드리지 않는다', () => {
  vi.stubGlobal('document', { hidden: false });
  const resumeForLifecycle = vi.fn(async () => undefined);
  const end = vi.fn();
  const scene = Object.create(GameScene.prototype) as GameScene;
  Object.defineProperties(scene, {
    runtimeLifecycle: { value: { isActive: vi.fn(() => false), end } },
    sessionResetListeners: { value: new Set() },
    hud: { value: { destroy: vi.fn() } },
    dogTraderTelemetry: { value: { reset: vi.fn() } },
    impactFeedback: { value: { resetDedupe: vi.fn() } },
    enemyActors: { configurable: true, value: {}, writable: true },
    projectileActors: { configurable: true, value: {}, writable: true },
    shelterView: { configurable: true, value: {}, writable: true },
    keyboardInput: { value: { destroy: vi.fn() } },
    movementIntent: { value: { reset: vi.fn() } },
    audio: { value: { resumeForLifecycle } },
    audioLifecyclePaused: { configurable: true, value: true, writable: true },
  });

  (scene as unknown as { shutdownRuntime(generation: number): void }).shutdownRuntime(1);

  expect(end).not.toHaveBeenCalled();
  expect(resumeForLifecycle).not.toHaveBeenCalled();
  expect((scene as unknown as { audioLifecyclePaused: boolean }).audioLifecyclePaused).toBe(true);
  vi.unstubAllGlobals();
});

it('Result unlock 대기 중 hidden 전환은 새 run을 visibility pause로 고정한 뒤 Game을 재개한다', () => {
  const order: string[] = [];
  vi.stubGlobal('document', {
    hidden: true,
    querySelector: vi.fn(() => ({ setAttribute: vi.fn() })),
  });
  const scene = Object.create(GameScene.prototype) as GameScene;
  Object.defineProperties(scene, {
    audio: { value: { beginRun: vi.fn(() => order.push('beginRun')) } },
    hud: { value: { setActive: vi.fn(() => order.push('hud')) } },
    resetSession: { value: vi.fn(() => order.push('resetSession')) },
    resetPlayer: { value: vi.fn(() => order.push('resetPlayer')) },
    setVisibilityForTest: { value: vi.fn((hidden: boolean) => order.push(`hidden:${hidden}`)) },
    scene: {
      value: {
        stop: vi.fn(() => order.push('stop:Result')),
        resume: vi.fn(() => order.push('resume:Game')),
      },
    },
  });

  scene.restartRunFromResult();

  expect(order).toEqual([
    'beginRun',
    'hud',
    'resetSession',
    'resetPlayer',
    'hidden:true',
    'stop:Result',
    'resume:Game',
  ]);
  vi.unstubAllGlobals();
});

it('bridge dispose는 maintainer cleanup 실패에도 session reset listener를 제거한다', () => {
  const audioError = new Error('audio reset failed');
  const listenerError = new Error('listener cleanup failed');
  const removeSessionResetListener = vi.fn(() => { throw listenerError; });
  const bridge = new SessionTestBridge({
    scenarioAdapter: () => ({}),
    onSessionReset: () => removeSessionResetListener,
    waitForRenderFlush: async () => undefined,
    resetAudioStress: () => { throw audioError; },
  } as never, 424242);

  let thrown: unknown;
  try {
    bridge.dispose();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBe(audioError);
  expect(removeSessionResetListener).toHaveBeenCalledOnce();
});

it('외부 session reset은 maintainer cleanup 실패에도 presentation state를 초기화한다', () => {
  let onSessionReset: (() => void) | undefined;
  const audioError = new Error('audio reset failed');
  const presentationError = new Error('presentation reset failed');
  const resetScenarioPresentation = vi.fn(() => { throw presentationError; });
  new SessionTestBridge({
    scenarioAdapter: () => ({ resetScenarioPresentation }),
    onSessionReset: (listener: () => void) => {
      onSessionReset = listener;
      return () => undefined;
    },
    waitForRenderFlush: async () => undefined,
    resetAudioStress: () => { throw audioError; },
  } as never, 424242);

  expect(onSessionReset).toBeTypeOf('function');
  let thrown: unknown;
  try {
    onSessionReset!();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBe(audioError);
  expect(resetScenarioPresentation).toHaveBeenCalledOnce();
});

it('stress audio prime 실패는 armed/audio/maintenance를 rollback하고 원 오류 identity를 보존한다', async () => {
  const audioPrimeError = new Error('audio prime failed');
  const audioRollbackError = new Error('audio rollback failed');
  const presentationRollbackError = new Error('presentation rollback failed');
  let armed = false;
  let audioActive = false;
  const resetAudioStress = vi.fn(() => {
    audioActive = false;
    throw audioRollbackError;
  });
  const resetScenarioPresentation = vi.fn(() => {
    armed = false;
    throw presentationRollbackError;
  });
  const bridge = new SessionTestBridge({
    scenarioAdapter: () => ({ resetScenarioPresentation }),
    onSessionReset: () => () => undefined,
    waitForRenderFlush: async () => undefined,
    armPresentationStress: () => { armed = true; },
    startAudioStress: async () => {
      audioActive = true;
      throw audioPrimeError;
    },
    resetAudioStress,
  } as never, 424242);

  let thrown: unknown;
  try {
    await bridge.enableStressMaintenance();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBe(audioPrimeError);
  expect(armed).toBe(false);
  expect(audioActive).toBe(false);
  expect(resetAudioStress).toHaveBeenCalledOnce();
  expect(resetScenarioPresentation).toHaveBeenCalledOnce();
  expect(() => bridge.advanceWithoutFlush(0)).toThrow(
    'advanceWithoutFlush is only available for the stress scenario',
  );
});

it('stress arm 실패도 audio/presentation을 rollback하고 원 오류 identity를 보존한다', async () => {
  const armError = new Error('presentation arm failed');
  const resetAudioStress = vi.fn(() => { throw new Error('audio rollback failed'); });
  const resetScenarioPresentation = vi.fn(() => {
    throw new Error('presentation rollback failed');
  });
  const startAudioStress = vi.fn(async () => undefined);
  const bridge = new SessionTestBridge({
    scenarioAdapter: () => ({ resetScenarioPresentation }),
    onSessionReset: () => () => undefined,
    waitForRenderFlush: async () => undefined,
    armPresentationStress: () => { throw armError; },
    startAudioStress,
    resetAudioStress,
  } as never, 424242);

  let thrown: unknown;
  try {
    await bridge.enableStressMaintenance();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBe(armError);
  expect(resetAudioStress).toHaveBeenCalledOnce();
  expect(resetScenarioPresentation).toHaveBeenCalledOnce();
  expect(startAudioStress).not.toHaveBeenCalled();
  expect(() => bridge.advanceWithoutFlush(0)).toThrow(
    'advanceWithoutFlush is only available for the stress scenario',
  );
});

it('stress fixed-step 실패는 bridge를 safe scenario로 닫고 cleanup 오류보다 원인을 보존한다', async () => {
  const stepError = new Error('presentation workload step failed');
  const audioCleanupError = new Error('audio fail-close failed');
  const presentationCleanupError = new Error('presentation fail-close failed');
  let audioActive = false;
  let presentationActive = true;
  const resetAudioStress = vi.fn(() => {
    audioActive = false;
    throw audioCleanupError;
  });
  const resetScenarioPresentation = vi.fn(() => {
    presentationActive = false;
    throw presentationCleanupError;
  });
  const bridge = new SessionTestBridge({
    scenarioAdapter: () => ({
      maintainStressPools: () => { throw stepError; },
      resetScenarioPresentation,
    }),
    onSessionReset: () => () => undefined,
    waitForRenderFlush: async () => undefined,
    armPresentationStress: () => undefined,
    startAudioStress: async () => { audioActive = true; },
    resetAudioStress,
    currentModeSnapshot: () => 'playing',
    advanceSimulationStep: () => [],
    advanceAudioFromGameMs: () => undefined,
  } as never, 424242);
  await bridge.enableStressMaintenance();
  (bridge as unknown as { activeScenario: string }).activeScenario = 'stress';

  let thrown: unknown;
  try {
    bridge.advanceWithoutFlush(FIXED_STEP_MS);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBe(stepError);
  expect(audioActive).toBe(false);
  expect(presentationActive).toBe(false);
  expect(resetAudioStress).toHaveBeenCalledOnce();
  expect(resetScenarioPresentation).toHaveBeenCalledOnce();
  expect((bridge as unknown as { activeScenario: string }).activeScenario).toBe('empty-run');
  expect(() => bridge.advanceWithoutFlush(0)).toThrow(
    'advanceWithoutFlush is only available for the stress scenario',
  );
});

it('stress simulation step producer 실패도 audio/positions/maintenance를 fail-close한다', async () => {
  const stepError = new Error('simulation step producer failed');
  const audioCleanupError = new Error('audio producer fail-close failed');
  const presentationCleanupError = new Error('presentation producer fail-close failed');
  const positions = new Map([[7, { x: 60, y: 130 }]]);
  let audioActive = false;
  const maintainStressPools = vi.fn();
  const advanceAudioFromGameMs = vi.fn();
  const resetAudioStress = vi.fn(() => {
    audioActive = false;
    throw audioCleanupError;
  });
  const resetScenarioPresentation = vi.fn(() => {
    positions.clear();
    throw presentationCleanupError;
  });
  const bridge = new SessionTestBridge({
    scenarioAdapter: () => ({ maintainStressPools, resetScenarioPresentation }),
    onSessionReset: () => () => undefined,
    waitForRenderFlush: async () => undefined,
    armPresentationStress: () => undefined,
    startAudioStress: async () => { audioActive = true; },
    resetAudioStress,
    currentModeSnapshot: () => 'playing',
    advanceSimulationStep: () => { throw stepError; },
    advanceAudioFromGameMs,
  } as never, 424242);
  await bridge.enableStressMaintenance();
  (bridge as unknown as { activeScenario: string }).activeScenario = 'stress';

  let thrown: unknown;
  try {
    bridge.advanceWithoutFlush(FIXED_STEP_MS);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBe(stepError);
  expect(audioActive).toBe(false);
  expect(positions.size).toBe(0);
  expect(resetAudioStress).toHaveBeenCalledOnce();
  expect(resetScenarioPresentation).toHaveBeenCalledOnce();
  expect(maintainStressPools).not.toHaveBeenCalled();
  expect(advanceAudioFromGameMs).not.toHaveBeenCalled();
  expect((bridge as unknown as { activeScenario: string }).activeScenario).toBe('empty-run');
  expect(() => bridge.advanceWithoutFlush(0)).toThrow(
    'advanceWithoutFlush is only available for the stress scenario',
  );
});

it('stress start 실패는 이전 activeScenario까지 버리고 all-attempt rollback 뒤 원인을 보존한다', async () => {
  const startError = new Error('presentation workload start failed');
  const audioCleanupError = new Error('audio start rollback failed');
  const presentationCleanupError = new Error('presentation start rollback failed');
  let audioActive = true;
  let presentationActive = false;
  let audioResetCalls = 0;
  let presentationResetCalls = 0;
  const resetAudioStress = vi.fn(() => {
    audioResetCalls += 1;
    audioActive = false;
    if (audioResetCalls > 1) throw audioCleanupError;
  });
  const resetScenarioPresentation = vi.fn(() => {
    presentationResetCalls += 1;
    presentationActive = false;
    if (presentationResetCalls > 1) throw presentationCleanupError;
  });
  const bridge = new SessionTestBridge({
    scenarioAdapter: () => ({
      useWaveSchedule: () => undefined,
      seedEnemy: () => 1,
      seedProjectile: () => undefined,
      resetScenarioPresentation,
      resetSimulationClock: () => undefined,
    }),
    onSessionReset: () => () => undefined,
    waitForRenderFlush: async () => undefined,
    resetAudioStress,
    resetSession: () => undefined,
    resetPlayer: () => undefined,
    startPresentationStress: () => {
      presentationActive = true;
      throw startError;
    },
  } as never, 424242);
  (bridge as unknown as { activeScenario: string }).activeScenario = 'full-run';

  let thrown: unknown;
  try {
    await bridge.loadScenario('stress');
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBe(startError);
  expect(audioActive).toBe(false);
  expect(presentationActive).toBe(false);
  expect(resetAudioStress).toHaveBeenCalledTimes(2);
  expect(resetScenarioPresentation).toHaveBeenCalledTimes(2);
  expect((bridge as unknown as { activeScenario: string }).activeScenario).toBe('empty-run');
  expect(() => bridge.prepareTerminalTieForTest()).toThrow(
    'prepareTerminalTieForTest is only available for the full-run scenario',
  );
});

it('비동기 stress start 중에도 이전 scenario 권한을 노출하지 않고 실패 뒤 safe scenario를 유지한다', async () => {
  const startError = new Error('audio workload start failed');
  let rejectStart!: (reason: unknown) => void;
  const pendingStart = new Promise<void>((_resolve, reject) => { rejectStart = reject; });
  const bridge = new SessionTestBridge({
    scenarioAdapter: () => ({
      useWaveSchedule: () => undefined,
      seedEnemy: () => 1,
      seedProjectile: () => undefined,
      resetScenarioPresentation: () => undefined,
      resetSimulationClock: () => undefined,
    }),
    onSessionReset: () => () => undefined,
    waitForRenderFlush: async () => undefined,
    resetAudioStress: () => undefined,
    resetSession: () => undefined,
    resetPlayer: () => undefined,
    startPresentationStress: () => undefined,
    armPresentationStress: () => undefined,
    startAudioStress: () => pendingStart,
  } as never, 424242);
  (bridge as unknown as { activeScenario: string }).activeScenario = 'full-run';

  const loading = bridge.loadScenario('stress').then(
    () => undefined,
    (error: unknown) => error,
  );
  const scenarioWhileLoading = (bridge as unknown as { activeScenario: string }).activeScenario;
  let privilegeError: unknown;
  try {
    bridge.prepareTerminalTieForTest();
  } catch (error) {
    privilegeError = error;
  }
  rejectStart(startError);

  expect(await loading).toBe(startError);
  expect(scenarioWhileLoading).toBe('empty-run');
  expect(privilegeError).toEqual(new Error(
    'prepareTerminalTieForTest is only available for the full-run scenario',
  ));
  expect((bridge as unknown as { activeScenario: string }).activeScenario).toBe('empty-run');
});

it('restart pre-clean은 cleanup 오류 뒤에도 scene.restart를 시도하고 첫 오류를 보존한다', async () => {
  const audioCleanupError = new Error('restart audio cleanup failed');
  const presentationCleanupError = new Error('restart presentation cleanup failed');
  const restartError = new Error('restart failed after cleanup');
  const restart = vi.fn(() => { throw restartError; });
  const resetAudioStress = vi.fn(() => { throw audioCleanupError; });
  const resetScenarioPresentation = vi.fn(() => { throw presentationCleanupError; });
  const bridge = new SessionTestBridge({
    scene: { restart },
    scenarioAdapter: () => ({ resetScenarioPresentation }),
    onSessionReset: () => () => undefined,
    waitForRenderFlush: async () => undefined,
    armPresentationStress: () => undefined,
    startAudioStress: async () => undefined,
    resetAudioStress,
  } as never, 424242);
  await bridge.enableStressMaintenance();
  (bridge as unknown as { activeScenario: string }).activeScenario = 'stress';

  let thrown: unknown;
  try {
    bridge.restartScene();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBe(audioCleanupError);
  expect(resetAudioStress).toHaveBeenCalledOnce();
  expect(resetScenarioPresentation).toHaveBeenCalledOnce();
  expect(restart).toHaveBeenCalledOnce();
  expect((bridge as unknown as { activeScenario: string }).activeScenario).toBe('empty-run');
  expect(() => bridge.advanceWithoutFlush(0)).toThrow(
    'advanceWithoutFlush is only available for the stress scenario',
  );
});

it('restart pre-clean이 모두 성공하면 scene.restart를 한 번 호출한다', async () => {
  const order: string[] = [];
  const restart = vi.fn(() => { order.push('restart'); });
  const resetAudioStress = vi.fn(() => { order.push('audio'); });
  const resetScenarioPresentation = vi.fn(() => { order.push('presentation'); });
  const bridge = new SessionTestBridge({
    scene: { restart },
    scenarioAdapter: () => ({ resetScenarioPresentation }),
    onSessionReset: () => () => undefined,
    waitForRenderFlush: async () => undefined,
    armPresentationStress: () => undefined,
    startAudioStress: async () => undefined,
    resetAudioStress,
  } as never, 424242);
  await bridge.enableStressMaintenance();
  (bridge as unknown as { activeScenario: string }).activeScenario = 'stress';

  bridge.restartScene();

  expect(resetAudioStress).toHaveBeenCalledOnce();
  expect(resetScenarioPresentation).toHaveBeenCalledOnce();
  expect(restart).toHaveBeenCalledOnce();
  expect(order).toEqual(['audio', 'presentation', 'restart']);
  expect((bridge as unknown as { activeScenario: string }).activeScenario).toBe('empty-run');
  expect(() => bridge.advanceWithoutFlush(0)).toThrow(
    'advanceWithoutFlush is only available for the stress scenario',
  );
});

it('GameScene runtime controller cleanup은 Phaser overlay를 다시 destroy하지 않고 모든 controller를 시도한다', () => {
  const firstError = new Error('webgl detach failed');
  const secondError = new Error('visibility reset failed');
  const detach = vi.fn(() => { throw firstError; });
  const visibilityReset = vi.fn(() => { throw secondError; });
  const webGlReset = vi.fn();
  const pauseReset = vi.fn();
  const destroyResume = vi.fn();
  const destroyRestore = vi.fn();
  const scene = Object.create(GameScene.prototype) as GameScene;
  Object.defineProperties(scene, {
    webGlRecoveryController: { value: { detach, reset: webGlReset } },
    visibilityController: { value: { reset: visibilityReset } },
    lifecyclePauseCoordinator: { value: { reset: pauseReset } },
    resumeOverlay: { value: { destroy: destroyResume } },
    restoreOverlay: { value: { destroy: destroyRestore } },
  });
  const cleanup = (scene as unknown as { cleanupRuntimeControllers?: () => void })
    .cleanupRuntimeControllers;

  expect(cleanup).toBeTypeOf('function');
  let thrown: unknown;
  try {
    cleanup!.call(scene);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBe(firstError);
  expect(detach).toHaveBeenCalledOnce();
  expect(visibilityReset).toHaveBeenCalledOnce();
  expect(webGlReset).toHaveBeenCalledOnce();
  expect(pauseReset).toHaveBeenCalledOnce();
  expect(destroyResume).not.toHaveBeenCalled();
  expect(destroyRestore).not.toHaveBeenCalled();
});

function createBridgeHarness() {
  const run = E2eGameSession.create({ seed: 424242 });
  let player = new PlayerController({ x: 270, y: 480 });
  const movement = new MutableMovementIntentPort();
  const audioAdvances: number[] = [];
  const stressOrder: string[] = [];
  const presentationCalls = { render: 0, dom: 0, audio: 0 };
  const pool = { instanceId: 1, created: 0, active: 0, available: 0 };
  const scenario = run.scenarioAdapter();
  const scene = {
    scene: { restart: () => undefined },
    advanceSimulationStep: (stepMs: number) => run.step(stepMs, player.snapshot()),
    advanceLogicalBatchForTest: (stepCount: number, input: Readonly<{ x: number; y: number }>) => {
      if (!Number.isSafeInteger(stepCount) || stepCount < 1 || stepCount > 60) throw new RangeError('invalid batch');
      movement.write(input);
      const events: LogicalBatchEvent[] = [];
      try {
        for (let index = 0; index < stepCount; index += 1) {
          if (run.modeStateForControllers().canStepWorld()) player.step(FIXED_STEP_MS, movement.read());
          const stepEvents = run.step(FIXED_STEP_MS, player.snapshot());
          const atSimulationMs = run.simulationTimeMs();
          stepEvents.forEach((event) => events.push({ event, atSimulationMs }));
        }
        return events;
      } finally {
        movement.reset();
      }
    },
    resetSession: (seed: number) => run.reset(seed),
    resetPlayer: (x: number, y: number) => { player = new PlayerController({ x, y }); },
    playerSnapshot: () => player.snapshot(),
    sessionSnapshot: () => run.snapshot(),
    currentModeSnapshot: () => run.currentMode(),
    simulationMsSnapshot: () => run.simulationTimeMs(),
    hudSnapshot: () => ({
      wave: run.snapshot().wave,
      timeText: '00:00',
      snacks: run.snapshot().snacks,
      player: { current: 1000, maximum: 1000 as const, visual: 'healthy' as const },
      autoSkills: [], dock: [], muted: false, toast: null,
    }),
    presentationTelemetryForTest: () => ({
      enemies: pool, labels: pool, labelBindings: [], projectiles: pool, effects: pool, damageNumbers: pool, listenerCount: 1,
    }),
    renderedVisibleEnemyLabelCount: () => 10,
    dogTraderRigTelemetry: () => ({ active: null, lastSharedFeedbackParts: 0 as const, lastReleaseParts: 0 as const }),
    audioSnapshot: () => ({
      state: 'running' as const, muted: false, sfxVoices: 0, bgmVoices: 0, totalVoices: 0,
      transportPhaseSteps: 0, bossLayerActive: false,
    }),
    audioStressSnapshot: () => null,
    presentationStressSnapshot: () => null,
    armPresentationStress: () => { stressOrder.push('arm'); },
    startAudioStress: async () => { stressOrder.push('audio'); },
    resetAudioStress: () => undefined,
    startPresentationStress: () => undefined,
    setAcceleratedAudio: () => undefined,
    advanceAudioFromGameMs: (ms: number) => { audioAdvances.push(ms); },
    queueSkillPurchaseForTest: (id: 'tailSwipe' | 'aquaBeam' | 'safetyReport') => run.queueSkillPurchase(id),
    scenarioAdapter: () => ({
      seedEnemy: scenario.spawnEnemy,
      suppressWaveSpawns: scenario.suppressWaveSpawns,
      useWaveSchedule: scenario.useWaveSchedule,
      grantSnacks: scenario.grantSnacks,
      seedProjectile: scenario.spawnProjectile,
      maintainStressPools: scenario.maintainStressProjectiles,
      prepareTerminalTie: scenario.prepareTerminalTie,
      resetScenarioPresentation: () => undefined,
      resetSimulationClock: scenario.resetSimulationClock,
      projectilePoolTelemetry: scenario.projectilePoolTelemetry,
      removeEnemyWithoutReward: scenario.removeEnemyWithoutReward,
      sessionIdentity: () => run,
    }),
    onSessionReset: () => () => undefined,
    setVisibilityForTest: () => undefined,
    waitForRenderFlush: async () => undefined,
  };
  return {
    bridge: new SessionTestBridge(scene, 424242),
    audioAdvances,
    stressOrder,
    presentationCalls,
  };
}

it('full-run 30-step batch는 75px/500ms만 논리 진행하고 입력과 presentation을 건드리지 않는다', async () => {
  const h = createBridgeHarness();
  await h.bridge.loadScenario('full-run');
  const beforeMs = h.bridge.snapshot().run.simulationMs;
  await h.bridge.advanceSimulationBatch(30, { x: 1, y: 0 });
  expect(h.bridge.snapshot().player.x).toBeCloseTo(345, 6);
  expect(h.bridge.snapshot().run.simulationMs - beforeMs).toBeCloseTo(500, 9);
  expect(h.audioAdvances).toEqual([30 * FIXED_STEP_MS]);
  expect(h.presentationCalls).toEqual({ render: 0, dom: 0, audio: 0 });
  expect(h.bridge.eventsSince(0).find(({ type }) => type === 'waveStarted')).toMatchObject({
    sequence: 1,
    atSimulationMs: FIXED_STEP_MS,
  });
  await h.bridge.advanceSimulationBatch(1, { x: 0, y: 0 });
  expect(h.bridge.snapshot().player.x).toBeCloseTo(345, 6);
});

it('event cursor는 reset 뒤 1부터 시작하고 exclusive하게 읽는다', async () => {
  const h = createBridgeHarness();
  await h.bridge.loadScenario('bark-cone');
  await h.bridge.advance(1000);
  const first = h.bridge.eventsSince(0);
  expect(first[0]?.sequence).toBe(1);
  const cursor = first.at(-1)!.sequence;
  expect(h.bridge.eventsSince(cursor).every((event) => event.sequence > cursor)).toBe(true);
  await h.bridge.loadScenario('empty-run');
  await h.bridge.loadScenario('bark-cone');
  await h.bridge.advance(1000);
  expect(h.bridge.eventsSince(0)[0]?.sequence).toBe(1);
});

it('snapshot은 pool active 수를 대신 쓰지 않고 scene의 실제 rendered-visible label count를 전달한다', () => {
  const h = createBridgeHarness();

  expect(h.bridge.snapshot().renderedVisibleEnemyLabels).toBe(10);
});

it('snapshot은 presentation stress truth seam을 그대로 노출한다', () => {
  const h = createBridgeHarness();

  expect(h.bridge.snapshot()).toHaveProperty('presentationStress', null);
});

it('stress maintenance는 seed 이후 presentation telemetry를 arm한 다음 audio를 시작한다', async () => {
  const h = createBridgeHarness();

  await h.bridge.enableStressMaintenance();

  expect(h.stressOrder).toEqual(['arm', 'audio']);
});

it('stress fixed-step은 production cadence처럼 HUD render를 미루고 일반 step은 즉시 render한다', async () => {
  const renderHudAfterStep: Array<boolean | undefined> = [];
  const bridge = new SessionTestBridge({
    scenarioAdapter: () => ({
      maintainStressPools: () => undefined,
      resetScenarioPresentation: () => undefined,
    }),
    onSessionReset: () => () => undefined,
    waitForRenderFlush: async () => undefined,
    armPresentationStress: () => undefined,
    startAudioStress: async () => undefined,
    resetAudioStress: () => undefined,
    currentModeSnapshot: () => 'playing',
    advanceSimulationStep: (_stepMs: number, renderHud?: boolean) => {
      renderHudAfterStep.push(renderHud);
      return [];
    },
    advanceAudioFromGameMs: () => undefined,
  } as never, 424242);

  await bridge.enableStressMaintenance();
  bridge.advanceWithoutFlush(FIXED_STEP_MS);
  bridge.stopScenarioMaintainers();
  bridge.stepSceneOnceForTest();

  expect(renderHudAfterStep).toEqual([false, undefined]);
});

it('stress projectile maintainer는 실제 accepted refill 수만 반환한다', () => {
  const run = E2eGameSession.create({ seed: 424242 });
  const scenario = run.scenarioAdapter();

  expect(scenario.maintainStressProjectiles()).toBe(80);
  expect(scenario.maintainStressProjectiles()).toBe(0);
  expect(scenario.projectilePoolTelemetry()).toMatchObject({ active: 80, available: 0 });
});

it('E2E session은 stress controller가 관측할 동일한 live projectile workload counters를 노출한다', () => {
  const run = E2eGameSession.create({ seed: 424242 });
  const counters = run.projectileWorkloadCounters();

  expect(run.projectileWorkloadCounters()).toBe(counters);
  expect(counters).toMatchObject({ active: 0, activations: 0 });

  expect(run.scenarioAdapter().maintainStressProjectiles()).toBe(80);
  expect(counters).toMatchObject({ active: 80, activations: 80 });
});
