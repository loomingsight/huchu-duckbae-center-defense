export interface PostStepInput {
  readonly shelterHp: number;
  readonly wave: number;
  readonly active: number;
  readonly pending: number;
  readonly skillDue: boolean;
}

export interface PostStepResolution {
  readonly mode: 'lost' | 'won' | 'skillSelection' | 'countdown' | 'playing';
  readonly nextWave?: number;
  readonly countdownKind?: 'nextWave';
}

export function resolvePostStep(input: PostStepInput): PostStepResolution {
  if (input.shelterHp <= 0) return { mode: 'lost' };

  const waveClear = input.active === 0 && input.pending === 0;
  if (waveClear && input.wave === 5) return { mode: 'won' };
  if (waveClear && input.wave < 5) {
    const transition = { nextWave: input.wave + 1, countdownKind: 'nextWave' as const };
    return input.skillDue
      ? { mode: 'skillSelection', ...transition }
      : { mode: 'countdown', ...transition };
  }
  if (input.skillDue) return { mode: 'skillSelection' };

  return { mode: 'playing' };
}

export class RunOutcomeResolver {
  private outcome: 'won' | 'lost' | null = null;
  transitionCount = 0;

  resolve(input: PostStepInput): PostStepResolution {
    if (this.outcome !== null) return { mode: this.outcome };

    const next = resolvePostStep(input);
    if (next.mode === 'won' || next.mode === 'lost') {
      this.outcome = next.mode;
      this.transitionCount += 1;
    }

    return next;
  }

  reset(): void {
    this.outcome = null;
    this.transitionCount = 0;
  }
}
