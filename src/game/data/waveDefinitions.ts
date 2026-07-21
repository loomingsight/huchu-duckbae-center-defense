import type { WaveDefinition } from '../waves/WaveTypes';

export const WAVE_DEFINITIONS = [
  {
    wave: 1,
    pathIds: ['P1', 'P2'],
    groups: [[0, 2, 0], [5, 2, 0], [10, 2, 0], [15, 2, 0], [20, 2, 0]],
  },
  {
    wave: 2,
    pathIds: ['P1', 'P2', 'P3', 'P4'],
    groups: [
      [0, 1, 1],
      [4.5, 1, 1],
      [9, 1, 1],
      [13.5, 1, 1],
      [18, 1, 1],
      [22.5, 1, 1],
      [28, 0, 2],
    ],
  },
  {
    wave: 3,
    pathIds: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'],
    groups: [
      [0, 1, 2],
      [6.5, 2, 1],
      [13, 1, 2],
      [19.5, 1, 2],
      [26, 2, 1],
      [32.5, 1, 2],
    ],
  },
  {
    wave: 4,
    pathIds: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'],
    groups: [[0, 2, 2], [10, 1, 2], [20, 1, 2], [34, 0, 0, 'dogTrader']],
  },
  {
    wave: 5,
    pathIds: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'],
    groups: [
      [0, 2, 2],
      [10, 1, 2],
      [20, 1, 2],
      [40, 0, 0, 'illegalBreeder'],
      [55, 2, 2],
    ],
  },
] as const satisfies readonly WaveDefinition[];
