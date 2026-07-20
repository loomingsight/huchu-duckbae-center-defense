import type { WaveDefinition } from '../waves/WaveTypes';

export const WAVE_DEFINITIONS = [
  {
    wave: 1,
    pathIds: ['P1', 'P2'],
    groups: [[0, 2, 0], [7, 2, 0], [14, 2, 0], [21, 2, 0], [28, 2, 0]],
  },
  {
    wave: 2,
    pathIds: ['P1', 'P2', 'P3', 'P4'],
    groups: [
      [0, 1, 1],
      [7, 1, 1],
      [14, 1, 1],
      [21, 1, 1],
      [28, 1, 1],
      [35, 1, 1],
      [42, 0, 2],
    ],
  },
  {
    wave: 3,
    pathIds: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'],
    groups: [
      [0, 1, 2],
      [8, 2, 1],
      [16, 1, 2],
      [24, 1, 2],
      [32, 2, 1],
      [40, 1, 2],
    ],
  },
  {
    wave: 4,
    pathIds: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'],
    groups: [[0, 2, 2], [12, 1, 2], [24, 1, 2], [32, 0, 0, 'dogTrader']],
  },
  {
    wave: 5,
    pathIds: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'],
    groups: [
      [0, 2, 2],
      [12, 1, 2],
      [24, 1, 2],
      [32, 0, 0, 'illegalBreeder'],
      [42, 2, 2],
    ],
  },
] as const satisfies readonly WaveDefinition[];
