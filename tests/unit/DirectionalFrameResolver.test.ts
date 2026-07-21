import { describe, expect, it } from 'vitest';
import { resolveDirection8 } from '../../src/game/world/DirectionalFrameResolver';

const rad = (degrees: number): number => degrees * Math.PI / 180;

describe('resolveDirection8', () => {
  it.each([
    [0, 'east'],
    [45, 'southEast'],
    [90, 'south'],
    [135, 'southWest'],
    [180, 'west'],
    [-135, 'northWest'],
    [-90, 'north'],
    [-45, 'northEast'],
  ] as const)('maps the %d degree sector center to %s', (degrees, expected) => {
    expect(resolveDirection8(rad(degrees))).toBe(expected);
  });

  it('keeps west inside the 12 degree boundary hysteresis and switches after it', () => {
    expect(resolveDirection8(rad(-157.5 + 11.9), 'west')).toBe('west');
    expect(resolveDirection8(rad(-157.5 + 12.1), 'west')).toBe('northWest');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects a non-finite heading (%s)',
    (heading) => {
      expect(() => resolveDirection8(heading)).toThrow(new RangeError('headingRad must be finite'));
    },
  );
});
