import type { TestScenarioId } from './TestContract';
import type { ScenarioEnemySeed } from './ScenarioSessionPort';

export interface SessionScenarioRuntime {
  resetManualScheduler(): void;
  resetEventLog(): void;
  resetSession(): void;
  resetPlayer(x: number, y: number): void;
  seedEnemy(seed: ScenarioEnemySeed): number;
}

export function loadScenario(runtime: SessionScenarioRuntime, id: TestScenarioId): void {
  switch (id) {
    case 'empty-run':
    case 'wave-schedule':
      resetRun(runtime);
      return;
    case 'health-bar-colors':
      resetRun(runtime);
      seedHealthBarColors(runtime);
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
}

export function loadHealthBarColors(runtime: SessionScenarioRuntime): void {
  resetRun(runtime);
  seedHealthBarColors(runtime);
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
