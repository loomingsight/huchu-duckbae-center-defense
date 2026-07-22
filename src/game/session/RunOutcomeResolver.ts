import type { WaveNumber } from './RunSnapshot';

export interface PostStepInput {
  readonly playerHp: number;
  readonly wave: WaveNumber;
  readonly active: number;
  readonly pending: number;
}

export type PostStepResolution =
  | { readonly mode: 'lost' | 'won' | 'playing' }
  | {
    readonly mode: 'countdown';
    readonly nextWave: Exclude<WaveNumber, 1>;
    readonly countdownKind: 'nextWave';
  };

export function resolvePostStep(input: PostStepInput): PostStepResolution {
  if (input.playerHp <= 0) return { mode: 'lost' };
  if (input.active !== 0 || input.pending !== 0) return { mode: 'playing' };
  if (input.wave === 5) return { mode: 'won' };
  return {
    mode: 'countdown',
    nextWave: (input.wave + 1) as Exclude<WaveNumber, 1>,
    countdownKind: 'nextWave',
  };
}

export class RunOutcomeResolver {
  private outcome: 'won' | 'lost' | null = null;
  transitionCount = 0;

  resolve(input: PostStepInput): PostStepResolution {
    if (this.outcome !== null) return { mode: this.outcome };
    const resolution = resolvePostStep(input);
    if (resolution.mode === 'won' || resolution.mode === 'lost') {
      this.outcome = resolution.mode;
      this.transitionCount += 1;
    }
    return resolution;
  }

  reset(): void {
    this.outcome = null;
    this.transitionCount = 0;
  }
}
