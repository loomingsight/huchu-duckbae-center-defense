import type { PathId } from '../types/GameTypes';

export type PathWaypoint = readonly [number, number];
export type PathDefinitions = Readonly<Record<string, readonly PathWaypoint[]>>;

export const PATH_DEFINITIONS = {
  P1: [[110, 0], [116, 75], [138, 159], [222, 214], [264, 265], [270, 350], [270, 430]],
  P2: [[430, 0], [424, 75], [402, 159], [318, 214], [276, 265], [270, 350], [270, 430]],
  P3: [[270, 0], [270, 110], [270, 220], [270, 340], [270, 430]],
  P4: [[0, 482], [90, 482], [170, 445], [220, 420], [240, 447], [220, 480]],
  P5: [[540, 482], [450, 482], [370, 445], [320, 420], [300, 447], [320, 480]],
  P6: [[270, 960], [270, 875], [270, 790], [270, 704], [270, 625], [270, 530]],
} as const satisfies PathDefinitions;

export const TRADER_SIDE_BY_PATH: Readonly<Record<PathId, -1 | 1>> = {
  P1: -1,
  P2: 1,
  P3: -1,
  P4: 1,
  P5: -1,
  P6: 1,
};
