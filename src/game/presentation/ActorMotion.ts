export interface SecondaryMotion {
  readonly bobY: number;
  readonly tiltRad: number;
  readonly scaleY: number;
}

export function secondaryMotionAt(
  elapsedMs: number,
  reducedMotion: boolean,
): SecondaryMotion {
  assertFiniteNonNegative(elapsedMs, 'Secondary motion elapsedMs');
  const phase = elapsedMs / 1000 * Math.PI * 4;
  const factor = reducedMotion ? 0.5 : 1;
  const wave = Math.sin(phase);
  return {
    bobY: -Math.abs(wave) * 1.5 * factor,
    tiltRad: wave * 0.018 * factor,
    scaleY: 1 - Math.abs(wave) * 0.025 * factor,
  };
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative`);
  }
}
