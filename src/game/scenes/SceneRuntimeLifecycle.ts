export function runCleanupSteps(steps: readonly (() => void)[]): void {
  let failed = false;
  let firstFailure: unknown;
  for (const step of steps) {
    try {
      step();
    } catch (error) {
      if (!failed) firstFailure = error;
      failed = true;
    }
  }
  if (failed) throw firstFailure;
}

export class SceneRuntimeLifecycle {
  private generation = 0;
  private readonly disposers = new Set<() => void>();

  begin(): number {
    const previous = [...this.disposers];
    this.disposers.clear();
    this.generation += 1;
    runCleanupSteps(previous);
    return this.generation;
  }

  isActive(generation: number): boolean {
    return this.generation === generation;
  }

  attach(generation: number, dispose: () => void): boolean {
    if (!this.isActive(generation)) {
      dispose();
      return false;
    }
    this.disposers.add(dispose);
    return true;
  }

  end(generation: number): void {
    if (!this.isActive(generation)) return;
    const current = [...this.disposers];
    this.disposers.clear();
    this.generation += 1;
    runCleanupSteps(current);
  }
}
