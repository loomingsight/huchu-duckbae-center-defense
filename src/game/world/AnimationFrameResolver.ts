import { TIME_EPSILON_MS } from '../constants';

export const loopFrame = (
  elapsedMs: number,
  fps: number,
  start: number,
  count: number,
): number => start + Math.floor((elapsedMs + TIME_EPSILON_MS) / (1000 / fps)) % count;

export const oneShotFrame = (
  elapsedMs: number,
  fps: number,
  start: number,
  count: number,
): number =>
  start + Math.min(count - 1, Math.floor((elapsedMs + TIME_EPSILON_MS) / (1000 / fps)));

export const attackFrameAt = (elapsedMs: number): number => oneShotFrame(elapsedMs, 8, 4, 4);

export const idleBreathScale = (elapsedMs: number): number =>
  1 + Math.sin(elapsedMs / 700) * 0.008;
