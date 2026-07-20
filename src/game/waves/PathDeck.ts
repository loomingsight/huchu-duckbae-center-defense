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

    let draftDeck = [...this.deck];
    const selected: PathId[] = [];
    while (selected.length < count) {
      if (draftDeck.length === 0) draftDeck = this.refill();
      const index = draftDeck.findIndex((pathId) => !selected.includes(pathId));
      if (index < 0) {
        draftDeck = this.refill();
        continue;
      }
      selected.push(draftDeck.splice(index, 1)[0]!);
    }
    this.deck = draftDeck;
    return selected;
  }

  private refill(): PathId[] {
    const refilled = [...this.paths];
    for (let index = refilled.length - 1; index > 0; index -= 1) {
      const random = this.rng.next();
      if (!Number.isFinite(random) || random < 0 || random >= 1) {
        throw new RangeError('RandomSource.next() must return a value in [0, 1)');
      }
      const swapIndex = Math.floor(random * (index + 1));
      [refilled[index], refilled[swapIndex]] = [
        refilled[swapIndex]!,
        refilled[index]!,
      ];
    }
    return refilled;
  }
}
