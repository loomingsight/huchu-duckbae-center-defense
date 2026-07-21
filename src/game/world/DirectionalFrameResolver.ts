import type { AnimationDirection } from '../assets/AnimationManifest';

export type Direction8 = AnimationDirection;

const DIRECTION_ORDER: readonly Direction8[] = Object.freeze([
  'east',
  'southEast',
  'south',
  'southWest',
  'west',
  'northWest',
  'north',
  'northEast',
]);
const SECTOR_RADIANS = Math.PI / 4;
const HYSTERESIS_RADIANS = 12 * Math.PI / 180;

function center(direction: Direction8): number {
  return DIRECTION_ORDER.indexOf(direction) * SECTOR_RADIANS;
}

function angularDistance(left: number, right: number): number {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}

export function resolveDirection8(headingRad: number, previous?: Direction8): Direction8 {
  if (!Number.isFinite(headingRad)) throw new RangeError('headingRad must be finite');
  if (
    previous !== undefined &&
    angularDistance(headingRad, center(previous)) <= SECTOR_RADIANS / 2 + HYSTERESIS_RADIANS
  ) {
    return previous;
  }
  return DIRECTION_ORDER.reduce((best, next) =>
    angularDistance(headingRad, center(next)) < angularDistance(headingRad, center(best))
      ? next
      : best,
  );
}
