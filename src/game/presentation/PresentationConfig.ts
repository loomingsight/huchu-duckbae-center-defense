export const GAME_TITLE = '후추덕배 디펜스' as const;

export const HUCHU_PRESENTATION = {
  logicalWidth: 540,
  logicalHeight: 960,
  maxDevicePixelRatio: 2,
  opaqueHeightLogical: 72,
  dogOpaqueHeightLogical: 72,
  regularEnemyOpaqueHeightLogical: 84,
  bossOpaqueHeightLogical: 100,
  truckDisplayLogical: { width: 142, height: 86 },
} as const;

export function clampDevicePixelRatio(raw: number): number {
  if (!Number.isFinite(raw)) return 1;
  return Math.min(HUCHU_PRESENTATION.maxDevicePixelRatio, Math.max(1, raw));
}
