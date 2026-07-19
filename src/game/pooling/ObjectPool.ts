let nextPoolInstanceId = 1;

export interface PoolSnapshot {
  readonly instanceId: number;
  readonly created: number;
  readonly active: number;
  readonly available: number;
}

export class ObjectPool<T> {
  private readonly availableItems: T[];
  private readonly activeItems = new Set<T>();
  private readonly instanceId = nextPoolInstanceId;

  constructor(
    readonly capacity: number,
    factory: () => T,
  ) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0) {
      throw new RangeError('Pool capacity must be a positive safe integer');
    }
    nextPoolInstanceId += 1;
    this.availableItems = Array.from({ length: capacity }, factory);
  }

  acquire(): T | undefined {
    const item = this.availableItems.pop();
    if (item !== undefined) this.activeItems.add(item);
    return item;
  }

  release(item: T): boolean {
    if (!this.activeItems.delete(item)) return false;
    this.availableItems.push(item);
    return true;
  }

  releaseAll(reset?: (item: T) => void): void {
    for (const item of [...this.activeItems]) {
      reset?.(item);
      this.release(item);
    }
  }

  get createdCount(): number {
    return this.capacity;
  }

  snapshot(): PoolSnapshot {
    return {
      instanceId: this.instanceId,
      created: this.capacity,
      active: this.activeItems.size,
      available: this.availableItems.length,
    };
  }
}
