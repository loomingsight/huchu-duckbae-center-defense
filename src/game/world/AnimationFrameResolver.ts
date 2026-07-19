import { TIME_EPSILON_MS } from '../constants';

export const loopFrame = (
  elapsedMs: number,
  fps: number,
  start: number,
  count: number,
): number => {
  validateFrameInput(elapsedMs, fps, start, count);
  return start + Math.floor((elapsedMs + TIME_EPSILON_MS) / (1000 / fps)) % count;
};

export const oneShotFrame = (
  elapsedMs: number,
  fps: number,
  start: number,
  count: number,
): number => {
  validateFrameInput(elapsedMs, fps, start, count);
  return start
    + Math.min(count - 1, Math.floor((elapsedMs + TIME_EPSILON_MS) / (1000 / fps)));
};

export const attackFrameAt = (elapsedMs: number): number => oneShotFrame(elapsedMs, 8, 4, 4);

export const idleBreathScale = (elapsedMs: number): number => {
  validateElapsed(elapsedMs);
  return 1 + Math.sin(elapsedMs / 700) * 0.008;
};

function validateFrameInput(
  elapsedMs: number,
  fps: number,
  start: number,
  count: number,
): void {
  validateElapsed(elapsedMs);
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new RangeError('animation fps must be finite and positive');
  }
  if (!Number.isSafeInteger(start) || start < 0) {
    throw new RangeError('animation start frame must be a non-negative integer');
  }
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new RangeError('animation frame count must be a positive integer');
  }
}

function validateElapsed(elapsedMs: number): void {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError('animation elapsed time must be finite and non-negative');
  }
}
