import { resolveDogTraderAsset } from '../assets/DogTraderDirectionalAssets';
import { PATH_DEFINITIONS } from '../data/pathDefinitions';
import { HUCHU_PRESENTATION } from '../presentation/PresentationConfig';
import type { PathId } from '../types/GameTypes';
import { resolveDirection8 } from '../world/DirectionalFrameResolver';
import type { Point } from '../world/Geometry';
import { PathPoseSampler } from '../world/PathPoseSampler';
import type { EnemySnapshot } from './EnemyTypes';

export const DEFAULT_PATH_POSE_SAMPLERS: Readonly<Record<PathId, PathPoseSampler>> =
  Object.freeze({
    P1: new PathPoseSampler(PATH_DEFINITIONS.P1),
    P2: new PathPoseSampler(PATH_DEFINITIONS.P2),
    P3: new PathPoseSampler(PATH_DEFINITIONS.P3),
    P4: new PathPoseSampler(PATH_DEFINITIONS.P4),
    P5: new PathPoseSampler(PATH_DEFINITIONS.P5),
    P6: new PathPoseSampler(PATH_DEFINITIONS.P6),
  });

const SHELTER_CENTER = Object.freeze({ x: 270, y: 480 });
const FEET_X_IN_CELL = 128;
const FEET_Y_IN_CELL = 256;

export function dogTraderAttackOrigin(snapshot: EnemySnapshot): Point {
  if (snapshot.kind !== 'dogTrader') {
    throw new RangeError('Dog trader attack origin requires a dogTrader snapshot');
  }
  const feet = DEFAULT_PATH_POSE_SAMPLERS[snapshot.pathId]
    .sampleExtended(snapshot.pathProgress).position;
  const heading = Math.atan2(
    SHELTER_CENTER.y - feet.y,
    SHELTER_CENTER.x - feet.x,
  );
  const direction = resolveDirection8(heading);
  const resolved = resolveDogTraderAsset('attack', direction);
  const socket = resolved.eventSocket;
  if (socket === undefined) throw new Error('Dog trader attack asset requires an event socket');
  const scale = HUCHU_PRESENTATION.bossOpaqueHeightLogical /
    resolved.entry.opaqueHeightPx;
  return {
    x: feet.x + (socket.x - FEET_X_IN_CELL) * scale,
    y: feet.y + (socket.y - FEET_Y_IN_CELL) * scale,
  };
}
