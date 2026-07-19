import { reachedDuration, subtractDuration } from '../constants';

export class FixedStepClock {
  private accumulatorMs = 0;

  constructor(
    private readonly stepMs: number,
    private readonly maxCatchUp: number,
  ) {}

  consume(deltaMs: number): readonly number[] {
    this.accumulatorMs += Math.min(deltaMs, this.stepMs * this.maxCatchUp);
    const steps: number[] = [];

    while (reachedDuration(this.accumulatorMs, this.stepMs) && steps.length < this.maxCatchUp) {
      steps.push(this.stepMs);
      this.accumulatorMs = subtractDuration(this.accumulatorMs, this.stepMs);
    }

    return steps;
  }

  reset(): void {
    this.accumulatorMs = 0;
  }
}
