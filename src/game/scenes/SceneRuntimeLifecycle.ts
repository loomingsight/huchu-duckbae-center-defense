const NOOP = (): void => {};

export class SceneRuntimeLifecycle {
  private generation = 0;
  private dispose = NOOP;

  begin(): number {
    const disposePrevious = this.dispose;
    this.dispose = NOOP;
    this.generation += 1;
    disposePrevious();
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
    const disposePrevious = this.dispose;
    this.dispose = dispose;
    disposePrevious();
    return true;
  }

  end(generation: number): void {
    if (!this.isActive(generation)) return;
    const dispose = this.dispose;
    this.dispose = NOOP;
    this.generation += 1;
    dispose();
  }
}
