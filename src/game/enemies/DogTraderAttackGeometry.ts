import { resolveDogTraderAsset } from '../assets/DogTraderDirectionalAssets';
import { HUCHU_PRESENTATION } from '../presentation/PresentationConfig';
import { resolveDirection8 } from '../world/DirectionalFrameResolver';
import type { Point } from '../world/Geometry';
import type { EnemySnapshot } from './EnemyTypes';

const FEET_X_IN_CELL = 128;
const FEET_Y_IN_CELL = 256;

export function dogTraderAttackOrigin(snapshot: EnemySnapshot): Point {
  if (snapshot.kind !== 'dogTrader') {
    throw new RangeError('Dog trader attack origin requires a dogTrader snapshot');
  }
  assertPoint(snapshot.position, 'Dog trader attack position');
  assertPoint(snapshot.heading, 'Dog trader attack heading');
  const feet = snapshot.position;
  const heading = Math.atan2(snapshot.heading.y, snapshot.heading.x);
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

function assertPoint(point: Point, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError(`${label} must be finite`);
  }
}
