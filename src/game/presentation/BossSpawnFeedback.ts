import type { EnemyKind } from '../types/GameTypes';

export interface BossSpawnCameraFeedback {
  readonly durationMs: number;
  readonly intensity: number;
}

const BOSS_SPAWN_CAMERA_FEEDBACK: BossSpawnCameraFeedback = {
  durationMs: 140,
  intensity: 0.005,
};

export function bossSpawnFeedback(
  kind: EnemyKind,
  reducedMotion: boolean,
): BossSpawnCameraFeedback | null {
  if (reducedMotion) return null;
  return kind === 'dogTrader' || kind === 'illegalBreeder'
    ? BOSS_SPAWN_CAMERA_FEEDBACK
    : null;
}
