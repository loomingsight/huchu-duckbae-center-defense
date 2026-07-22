export const JOYSTICK_SAFE_GAP = 16;

export function joystickBottomOffset(safeBottomPx: number): number {
  if (!Number.isFinite(safeBottomPx) || safeBottomPx < 0) {
    throw new RangeError('safe-area bottom inset must be finite and non-negative');
  }
  return Math.max(JOYSTICK_SAFE_GAP, safeBottomPx);
}
