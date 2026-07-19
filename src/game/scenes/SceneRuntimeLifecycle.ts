export class SceneRuntimeLifecycle {
  private generation = 0;
  private readonly disposers = new Set<() => void>();

  begin(): number {
    const previous = [...this.disposers];
    this.disposers.clear();
    this.generation += 1;
    previous.forEach((dispose) => dispose());
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
    current.forEach((dispose) => dispose());
  }
}
