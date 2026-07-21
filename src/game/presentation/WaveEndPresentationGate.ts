export type WaveEndPresentationIntent =
  | { readonly kind: 'countdown' }
  | { readonly kind: 'result'; readonly outcome: 'won' };

export class WaveEndPresentationGate {
  private pending: WaveEndPresentationIntent | null = null;

  defer(intent: WaveEndPresentationIntent): void {
    if (this.pending === null) {
      this.pending = intent;
      return;
    }
    if (sameIntent(this.pending, intent)) return;
    throw new Error('Conflicting wave-end intent');
  }

  releaseIf(settled: boolean): WaveEndPresentationIntent | null {
    if (!settled || this.pending === null) return null;
    const intent = this.pending;
    this.pending = null;
    return intent;
  }

  get blocking(): boolean {
    return this.pending !== null;
  }

  reset(): void {
    this.pending = null;
  }
}

function sameIntent(
  left: WaveEndPresentationIntent,
  right: WaveEndPresentationIntent,
): boolean {
  if (left.kind !== right.kind) return false;
  return left.kind === 'countdown'
    || (right.kind === 'result' && left.outcome === right.outcome);
}
