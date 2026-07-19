export interface PlayerOnlyScenarioRuntime {
  resetManualScheduler(): void;
  resetEventLog(): void;
  resetPlayer(x: number, y: number): void;
}

export function loadEmptyRun(runtime: PlayerOnlyScenarioRuntime): void {
  runtime.resetManualScheduler();
  runtime.resetEventLog();
  runtime.resetPlayer(270, 650);
}
