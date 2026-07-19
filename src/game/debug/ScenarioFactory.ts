import type { TestScenarioId } from './TestContract';

export interface SessionScenarioRuntime {
  resetManualScheduler(): void;
  resetEventLog(): void;
  resetSession(): void;
  resetPlayer(x: number, y: number): void;
}

export function loadScenario(runtime: SessionScenarioRuntime, id: TestScenarioId): void {
  switch (id) {
    case 'empty-run':
    case 'wave-schedule':
      resetRun(runtime);
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

function resetRun(runtime: SessionScenarioRuntime): void {
  runtime.resetManualScheduler();
  runtime.resetEventLog();
  runtime.resetSession();
  runtime.resetPlayer(270, 650);
}
