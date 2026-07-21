export const BALANCE = {
  shelter: { maxHp: 1000, x: 270, y: 480, hitRadius: 38 },
  player: { speed: 150, opaqueHeightLogical: 72 },
  waveCountdownMs: 3000,
  enemies: {
    poopGuardian: {
      displayName: '똥 방치 보호자',
      hp: 60,
      speed: 44,
      damage: 25,
      attackIntervalMs: 1800,
      range: 48,
      snack: 2,
      isBoss: false,
      attackTiming: 'normal',
    },
    offLeashGuardian: {
      displayName: '오프리시 보호자',
      hp: 110,
      speed: 42,
      damage: 50,
      attackIntervalMs: 1800,
      range: 32,
      snack: 4,
      isBoss: false,
      attackTiming: 'normal',
    },
    dogTrader: {
      displayName: '개장수',
      hp: 900,
      speed: 30,
      damage: 120,
      attackIntervalMs: 2400,
      range: 64,
      snack: 20,
      isBoss: true,
      attackTiming: 'boss',
    },
    illegalBreeder: {
      displayName: '불법번식업자',
      hp: 1500,
      speed: 27.6,
      damage: 160,
      attackIntervalMs: 2100,
      range: 88,
      snack: 35,
      isBoss: true,
      attackTiming: 'boss',
    },
  },
  caps: { enemies: 60, projectiles: 80, particles: 120 },
} as const;

export const ACTION_TIMINGS = {
  normal: { frameCount: 6, eventFrame: 3, fps: 12 },
  boss: { frameCount: 8, eventFrame: 5, fps: 10 },
} as const;

export function attackImpactMs(kind: keyof typeof ACTION_TIMINGS): number {
  const timing = ACTION_TIMINGS[kind];
  return timing.eventFrame / timing.fps * 1000;
}
