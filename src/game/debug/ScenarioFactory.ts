import type { TestScenarioId } from './TestContract';
import type {
  ScenarioEnemySeed,
  ScenarioWaveSchedule,
} from './ScenarioSessionPort';
import type { ProjectileSpawn } from '../combat/ProjectileSystem';
import type { PathId } from '../types/GameTypes';

export interface SessionScenarioRuntime {
  stopScenarioMaintainers(): void;
  resetManualScheduler(): void;
  resetEventLog(): void;
  resetSession(): void;
  suppressWaveSpawns(): void;
  resetPlayer(x: number, y: number): void;
  seedEnemy(seed: ScenarioEnemySeed): number;
  useWaveSchedule(wave: number, schedule: ScenarioWaveSchedule): void;
  damageShelter(damage: number): void;
  replaceShelter(currentHp: number, maxHp?: number): void;
  seedProjectile(seed: ProjectileSpawn): void;
  seedEffectPool(active: number): void;
  enableStressMaintenance(): void;
  resetSimulationClock(): void;
  enableWaveAutoClear(): void;
  advanceWorldTicks(ticks: number): void;
}

export function loadScenario(runtime: SessionScenarioRuntime, id: TestScenarioId): void {
  resetRun(runtime);
  switch (id) {
    case 'empty-run':
      break;
    case 'wave-schedule':
      runtime.useWaveSchedule(1, 'real');
      runtime.enableWaveAutoClear();
      break;
    case 'health-bar-colors':
      seedHealthBarColors(runtime);
      break;
    case 'bark-targeting':
      runtime.useWaveSchedule(1, 'real');
      seedBarkTargets(runtime);
      break;
    case 'skill-selection':
      seedSkillSelection(runtime);
      break;
    case 'skill-selection-wave-clear':
      seedSkillSelectionWaveClear(runtime);
      break;
    case 'all-skills':
      seedAllSkills(runtime);
      break;
    case 'poop-attack':
      runtime.suppressWaveSpawns();
      seedPoopAttack(runtime);
      break;
    case 'boss':
      runtime.useWaveSchedule(3, 'exhausted');
      seedBossAttack(runtime);
      break;
    case 'shelter-defeat':
      runtime.useWaveSchedule(1, 'held');
      runtime.damageShelter(100);
      break;
    case 'final-enemy':
      runtime.useWaveSchedule(5, 'exhausted');
      seedFinalEnemy(runtime);
      break;
    case 'stress':
      seedStress(runtime);
      break;
    default:
      throw new RangeError(`Unknown test scenario: ${String(id)}`);
  }
  runtime.resetSimulationClock();
}

export function loadEmptyRun(runtime: SessionScenarioRuntime): void {
  resetRun(runtime);
}

export function loadWaveSchedule(runtime: SessionScenarioRuntime): void {
  resetRun(runtime);
  runtime.enableWaveAutoClear();
}

export function loadHealthBarColors(runtime: SessionScenarioRuntime): void {
  resetRun(runtime);
  seedHealthBarColors(runtime);
}

export function loadBarkTargeting(runtime: SessionScenarioRuntime): void {
  resetRun(runtime);
  seedBarkTargets(runtime);
}

function resetRun(runtime: SessionScenarioRuntime): void {
  runtime.stopScenarioMaintainers();
  runtime.resetManualScheduler();
  runtime.resetSession();
  runtime.resetEventLog();
  runtime.resetPlayer(270, 650);
  runtime.useWaveSchedule(1, 'held');
}

function seedStress(runtime: SessionScenarioRuntime): void {
  runtime.replaceShelter(1_000_000, 1_000_000);
  for (let index = 0; index < 60; index += 1) {
    runtime.seedEnemy({
      kind: index % 2 === 0 ? 'poopGuardian' : 'offLeashGuardian',
      variant: index % 2 === 0 ? 'male' : 'female',
      pathId: `P${index % 6 + 1}` as PathId,
      placement: {
        kind: 'worldPoint',
        x: 40 + index % 10 * 50,
        y: 120 + Math.floor(index / 10) * 90,
      },
      currentHp: 1_000_000,
      maxHp: 1_000_000,
    });
  }
  for (let index = 0; index < 80; index += 1) {
    runtime.seedProjectile({
      id: index,
      kind: 'poop',
      from: { x: 24 + index % 20 * 26, y: 24 + Math.floor(index / 20) * 72 },
      to: { x: 270, y: 480 },
      speed: 1,
      damage: 0,
      lifeMs: 60_000,
    });
  }
  runtime.seedEffectPool(120);
  runtime.enableStressMaintenance();
}

function seedHealthBarColors(runtime: SessionScenarioRuntime): void {
  const placements = [
    { pathId: 'P4' as const, x: 170, y: 445 },
    { pathId: 'P5' as const, x: 370, y: 445 },
    { pathId: 'P6' as const, x: 270, y: 625 },
  ];
  [35, 17, 6].forEach((currentHp, index) => {
    const placement = placements[index]!;
    runtime.seedEnemy({
      kind: 'poopGuardian',
      variant: index % 2 === 0 ? 'male' : 'female',
      pathId: placement.pathId,
      placement: { kind: 'worldPoint', x: placement.x, y: placement.y },
      currentHp,
      maxHp: 35,
      state: 'stunned',
      stunnedMs: 60_000,
    });
  });
}

function seedBarkTargets(runtime: SessionScenarioRuntime): void {
  runtime.seedEnemy({
    kind: 'poopGuardian',
    variant: 'male',
    pathId: 'P6',
    placement: { kind: 'worldPoint', x: 270, y: 625 },
    currentHp: 20,
    maxHp: 35,
    state: 'stunned',
    stunnedMs: 60_000,
  });
  runtime.seedEnemy({
    kind: 'poopGuardian',
    variant: 'female',
    pathId: 'P6',
    placement: { kind: 'worldPoint', x: 270, y: 704 },
    currentHp: 35,
    maxHp: 35,
    state: 'stunned',
    stunnedMs: 60_000,
  });
}

function seedPoopAttack(runtime: SessionScenarioRuntime): void {
  runtime.seedEnemy({
    kind: 'poopGuardian',
    variant: 'male',
    pathId: 'P6',
    placement: { kind: 'attackBoundary' },
  });
}

function seedBossAttack(runtime: SessionScenarioRuntime): void {
  runtime.seedEnemy({
    kind: 'dogTrader',
    variant: 'male',
    pathId: 'P3',
    placement: { kind: 'attackBoundary' },
  });
}

function seedFinalEnemy(runtime: SessionScenarioRuntime): void {
  runtime.seedEnemy({
    kind: 'illegalBreeder',
    variant: 'male',
    pathId: 'P6',
    placement: { kind: 'worldPoint', x: 270, y: 625 },
    currentHp: 10,
    maxHp: 1000,
    state: 'stunned',
    stunnedMs: 60_000,
  });
}

function seedSkillSelection(runtime: SessionScenarioRuntime): void {
  runtime.suppressWaveSpawns();
  runtime.resetPlayer(270, 750);
  seedSkillRewardTargets(runtime);
  runtime.advanceWorldTicks(102);
  seedAttackBoundary(runtime, 'poopGuardian', 'male');
  runtime.advanceWorldTicks(15);
  seedAttackBoundary(runtime, 'offLeashGuardian', 'female');
  seedAttackBoundary(runtime, 'poopGuardian', 'female');
  runtime.advanceWorldTicks(15);
  seedBarkDamageTarget(runtime);
}

function seedSkillSelectionWaveClear(runtime: SessionScenarioRuntime): void {
  runtime.suppressWaveSpawns();
  runtime.resetPlayer(270, 750);
  seedSkillRewardTargets(runtime);
  runtime.advanceWorldTicks(132);
}

function seedAllSkills(runtime: SessionScenarioRuntime): void {
  runtime.suppressWaveSpawns();
  runtime.resetPlayer(270, 905);
  // 31 × 2 snacks lands exactly on the fourth threshold (62), so the final
  // combat window cannot be interrupted by the fifth skill selection.
  for (let index = 0; index < 31; index += 1) {
    runtime.seedEnemy({
      kind: 'offLeashGuardian',
      variant: index % 2 === 0 ? 'male' : 'female',
      pathId: 'P6',
      placement: { kind: 'worldPoint', x: 270, y: 960 },
      currentHp: 10,
      maxHp: 65,
      state: 'stunned',
      stunnedMs: 60_000,
    });
  }
  // Safety Report has global threat targeting. This target is outside every
  // local auto-skill range and dies to its exact 90 damage, which keeps the
  // lethal damage-before-status path covered while the visual targets remain.
  runtime.seedEnemy({
    kind: 'poopGuardian',
    variant: 'male',
    pathId: 'P3',
    placement: { kind: 'attackBoundary' },
    currentHp: 90,
    maxHp: 90,
    state: 'stunned',
    stunnedMs: 120_000,
  });
  for (let index = 0; index < 4; index += 1) {
    runtime.seedEnemy({
      kind: 'poopGuardian',
      variant: index % 2 === 0 ? 'male' : 'female',
      pathId: 'P1',
      placement: { kind: 'worldPoint', x: 110, y: 0 },
      currentHp: 10_000,
      maxHp: 10_000,
      state: 'stunned',
      stunnedMs: 120_000,
    });
  }
  runtime.seedEnemy({
    kind: 'illegalBreeder',
    variant: 'male',
    pathId: 'P6',
    placement: { kind: 'worldPoint', x: 270, y: 960 },
    currentHp: 10_000,
    maxHp: 10_000,
    state: 'stunned',
    stunnedMs: 120_000,
  });
  runtime.advanceWorldTicks(132);
}

function seedSkillRewardTargets(runtime: SessionScenarioRuntime): void {
  for (let index = 0; index < 4; index += 1) {
    runtime.seedEnemy({
      kind: 'offLeashGuardian',
      variant: index % 2 === 0 ? 'male' : 'female',
      pathId: 'P6',
      placement: { kind: 'worldPoint', x: 270 + index, y: 725 },
      currentHp: 10,
      maxHp: 65,
      state: 'stunned',
      stunnedMs: 60_000,
    });
  }
}

function seedAttackBoundary(
  runtime: SessionScenarioRuntime,
  kind: 'poopGuardian' | 'offLeashGuardian',
  variant: 'male' | 'female',
): void {
  runtime.seedEnemy({
    kind,
    variant,
    pathId: 'P6',
    placement: { kind: 'attackBoundary' },
  });
}

function seedBarkDamageTarget(runtime: SessionScenarioRuntime): void {
  runtime.seedEnemy({
    kind: 'illegalBreeder',
    variant: 'male',
    pathId: 'P6',
    placement: { kind: 'worldPoint', x: 270, y: 725 },
    currentHp: 1000,
    maxHp: 1000,
    state: 'stunned',
    stunnedMs: 60_000,
  });
}
