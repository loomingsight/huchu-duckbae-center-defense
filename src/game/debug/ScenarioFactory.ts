import type { ProjectileSpawn } from '../combat/ProjectileSystem';
import type { PathId } from '../types/GameTypes';
import type { ScenarioEnemySeed, ScenarioWaveSchedule } from './ScenarioSessionPort';
import type { TestScenarioId } from './TestContract';

export interface SessionScenarioRuntime {
  stopScenarioMaintainers(): void;
  resetManualScheduler(): void;
  resetEventLog(): void;
  resetSession(): void;
  resetScenarioPresentation(): void;
  resetPlayer(x: number, y: number): void;
  seedEnemy(seed: ScenarioEnemySeed): number;
  useWaveSchedule(wave: number, schedule: ScenarioWaveSchedule): void;
  grantSnacks(amount: number): void;
  seedProjectile(seed: ProjectileSpawn): void;
  enableStressMaintenance(): Promise<void>;
  enablePresentationStress(): void;
  resetSimulationClock(): void;
  enableWaveAutoClear(): void;
}

export const TEST_SCENARIO_IDS = [
  'empty-run', 'wave-schedule', 'full-run', 'bark-cone', 'skill-dock',
  'impact-feedback', 'health-bar-colors', 'boss-rig-p1', 'boss-rig-p2',
  'boss-rig-p3', 'boss-rig-p4', 'boss-rig-p5', 'boss-rig-p6',
  'boss-rig-corner-p2', 'boss-rig-attack-p2', 'boss-rig-feedback',
  'audio', 'stress',
] as const satisfies readonly TestScenarioId[];

export async function loadScenario(runtime: SessionScenarioRuntime, id: TestScenarioId): Promise<void> {
  resetRun(runtime);
  switch (id) {
    case 'empty-run':
    case 'audio':
      runtime.useWaveSchedule(1, 'held');
      break;
    case 'wave-schedule':
      runtime.useWaveSchedule(1, 'real');
      runtime.enableWaveAutoClear();
      break;
    case 'full-run':
      runtime.useWaveSchedule(1, 'real');
      break;
    case 'bark-cone':
      runtime.useWaveSchedule(1, 'exhausted');
      seedBarkCone(runtime);
      break;
    case 'skill-dock':
      runtime.useWaveSchedule(1, 'held');
      runtime.grantSnacks(85);
      seedHeld(runtime, { kind: 'poopGuardian', variant: 'male', pathId: 'P3', x: 270, y: 260, hp: 60 });
      break;
    case 'impact-feedback':
      runtime.useWaveSchedule(1, 'held');
      seedHeld(runtime, { kind: 'poopGuardian', variant: 'male', pathId: 'P6', x: 270, y: 590, hp: 18 });
      break;
    case 'health-bar-colors':
      runtime.useWaveSchedule(1, 'held');
      seedHealthBars(runtime);
      break;
    case 'boss-rig-p1': seedBoss(runtime, 'P1', -70, true); break;
    case 'boss-rig-p2': seedBoss(runtime, 'P2', -70, true); break;
    case 'boss-rig-p3': seedBoss(runtime, 'P3', -70, true); break;
    case 'boss-rig-p4': seedBoss(runtime, 'P4', -70, true); break;
    case 'boss-rig-p5': seedBoss(runtime, 'P5', -70, true); break;
    case 'boss-rig-p6': seedBoss(runtime, 'P6', -70, true); break;
    case 'boss-rig-corner-p2': seedBoss(runtime, 'P2', 150, false); break;
    case 'boss-rig-attack-p2':
      runtime.useWaveSchedule(1, 'exhausted');
      runtime.seedEnemy({
        kind: 'dogTrader', variant: 'male', pathId: 'P2', placement: { kind: 'attackBoundary' },
      });
      break;
    case 'boss-rig-feedback':
      runtime.useWaveSchedule(1, 'held');
      seedHeld(runtime, { kind: 'dogTrader', variant: 'male', pathId: 'P6', x: 270, y: 590, hp: 18 });
      break;
    case 'stress':
      runtime.useWaveSchedule(1, 'held');
      runtime.enablePresentationStress();
      seedStress(runtime);
      await runtime.enableStressMaintenance();
      break;
  }
  runtime.resetSimulationClock();
}

function resetRun(runtime: SessionScenarioRuntime): void {
  runtime.stopScenarioMaintainers();
  runtime.resetManualScheduler();
  runtime.resetSession();
  runtime.resetScenarioPresentation();
  runtime.resetEventLog();
  runtime.resetPlayer(270, 650);
}

function seedBarkCone(runtime: SessionScenarioRuntime): void {
  const inputs = [
    { pathId: 'P6' as const, x: 270, y: 625 },
    { pathId: 'P4' as const, x: 220, y: 480 },
    { pathId: 'P5' as const, x: 320, y: 480 },
    { pathId: 'P6' as const, x: 270, y: 790 },
  ];
  inputs.forEach(({ pathId, x, y }, index) => seedHeld(runtime, {
    kind: 'poopGuardian', variant: index % 2 === 0 ? 'male' : 'female', pathId, x, y, hp: 60,
  }));
}

function seedHealthBars(runtime: SessionScenarioRuntime): void {
  const inputs = [
    { kind: 'poopGuardian' as const, pathId: 'P4' as const, x: 170, y: 445, hp: 60, maxHp: 60 },
    { kind: 'offLeashGuardian' as const, pathId: 'P5' as const, x: 370, y: 445, hp: 55, maxHp: 110 },
    { kind: 'illegalBreeder' as const, pathId: 'P6' as const, x: 270, y: 625, hp: 150, maxHp: 1500 },
  ];
  inputs.forEach((input, index) => seedHeld(runtime, {
    variant: index % 2 === 0 ? 'male' : 'female', ...input,
  }));
}

function seedBoss(runtime: SessionScenarioRuntime, pathId: PathId, progress: number, heldForDebug: boolean): void {
  runtime.useWaveSchedule(1, 'exhausted');
  runtime.seedEnemy({
    kind: 'dogTrader',
    variant: 'male',
    pathId,
    placement: { kind: 'pathProgress', value: progress },
    heldForDebug,
  });
}

function seedStress(runtime: SessionScenarioRuntime): void {
  for (let index = 0; index < 60; index += 1) {
    runtime.seedEnemy({
      kind: index % 2 === 0 ? 'poopGuardian' : 'offLeashGuardian',
      variant: index % 2 === 0 ? 'male' : 'female',
      pathId: `P${index % 3 + 1}` as PathId,
      placement: {
        kind: 'worldPoint',
        x: 60 + index % 12 * 38,
        y: 130 + Math.floor(index / 12) * 50,
      },
      currentHp: 1_000_000,
      maxHp: 1_000_000,
      heldForDebug: true,
    });
  }
  for (let index = 0; index < 80; index += 1) {
    runtime.seedProjectile({
      id: index,
      castId: `e2e-stress-projectile:${index}`,
      enemyId: index,
      kind: 'poopGuardian',
      projectileKind: 'poop',
      from: { x: 24 + index % 20 * 26, y: 24 + Math.floor(index / 20) * 72 },
      to: { x: 270, y: 480 },
      speed: 1,
      damage: 0,
      lifeMs: 60_000,
    });
  }
}

function seedHeld(runtime: SessionScenarioRuntime, input: {
  readonly kind: 'poopGuardian' | 'offLeashGuardian' | 'dogTrader' | 'illegalBreeder';
  readonly variant: 'male' | 'female';
  readonly pathId: PathId;
  readonly x: number;
  readonly y: number;
  readonly hp: number;
  readonly maxHp?: number;
}): void {
  runtime.seedEnemy({
    kind: input.kind,
    variant: input.variant,
    pathId: input.pathId,
    placement: { kind: 'worldPoint', x: input.x, y: input.y },
    currentHp: input.hp,
    maxHp: input.maxHp ?? input.hp,
    heldForDebug: true,
  });
}
