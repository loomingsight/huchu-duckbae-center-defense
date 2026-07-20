import type { RandomSource } from '../core/SeededRng';
import type { PathId } from '../types/GameTypes';

export class PathDeck {
  private readonly paths: readonly PathId[];
  private deck: PathId[] = [];

  constructor(paths: readonly PathId[], private readonly rng: RandomSource) {
    this.paths = [...new Set(paths)];
  }

  drawMany(count: number): readonly PathId[] {
    if (!Number.isSafeInteger(count) || count < 0 || count > this.paths.length) {
      throw new RangeError('Invalid event path count');
    }

    const selected: PathId[] = [];
    while (selected.length < count) {
      if (this.deck.length === 0) this.refill();
      const index = this.deck.findIndex((pathId) => !selected.includes(pathId));
      if (index < 0) {
        this.refill();
        continue;
      }
      selected.push(this.deck.splice(index, 1)[0]!);
    }
    return selected;
  }

  private refill(): void {
    this.deck = [...this.paths];
    for (let index = this.deck.length - 1; index > 0; index -= 1) {
      const random = this.rng.next();
      if (!Number.isFinite(random) || random < 0 || random >= 1) {
        throw new RangeError('RandomSource.next() must return a value in [0, 1)');
      }
      const swapIndex = Math.floor(random * (index + 1));
      [this.deck[index], this.deck[swapIndex]] = [
        this.deck[swapIndex]!,
        this.deck[index]!,
      ];
    }
  }
}
