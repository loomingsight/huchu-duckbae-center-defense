import type { TestScenarioId } from './TestContract';
import type {
  ScenarioEnemySeed,
  ScenarioWaveSchedule,
} from './ScenarioSessionPort';

export interface SessionScenarioRuntime {
  resetManualScheduler(): void;
  resetEventLog(): void;
  resetSession(): void;
  suppressWaveSpawns(): void;
  resetPlayer(x: number, y: number): void;
  seedEnemy(seed: ScenarioEnemySeed): number;
  useWaveSchedule(wave: number, schedule: ScenarioWaveSchedule): void;
  damageShelter(damage: number): void;
  enableWaveAutoClear(): void;
  advanceWorldTicks(ticks: number): void;
}

export function loadScenario(runtime: SessionScenarioRuntime, id: TestScenarioId): void {
  switch (id) {
    case 'empty-run':
      resetRun(runtime);
      return;
    case 'wave-schedule':
      resetRun(runtime);
      runtime.enableWaveAutoClear();
      return;
    case 'health-bar-colors':
      resetRun(runtime);
      seedHealthBarColors(runtime);
      return;
    case 'bark-targeting':
      resetRun(runtime);
      seedBarkTargets(runtime);
      return;
    case 'skill-selection':
      resetRun(runtime);
      seedSkillSelection(runtime);
      return;
    case 'skill-selection-wave-clear':
      resetRun(runtime);
      seedSkillSelectionWaveClear(runtime);
      return;
    case 'all-skills':
      resetRun(runtime);
      seedAllSkills(runtime);
      return;
    case 'poop-attack':
      resetRun(runtime);
      runtime.suppressWaveSpawns();
      seedPoopAttack(runtime);
      return;
    case 'boss':
      resetRun(runtime);
      runtime.useWaveSchedule(3, 'exhausted');
      seedBossAttack(runtime);
      return;
    case 'shelter-defeat':
      resetRun(runtime);
      runtime.useWaveSchedule(1, 'held');
      runtime.damageShelter(100);
      return;
    case 'final-enemy':
      resetRun(runtime);
      runtime.useWaveSchedule(5, 'exhausted');
      seedFinalEnemy(runtime);
      return;
    default:
      throw new RangeError(`Unknown test scenario: ${String(id)}`);
  }
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
  runtime.resetManualScheduler();
  runtime.resetEventLog();
  runtime.resetSession();
  runtime.resetPlayer(270, 650);
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
