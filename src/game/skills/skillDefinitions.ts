export const SKILL_DEFINITIONS = {
  scold: {
    cooldownMs: 8000,
    damage: 20,
    angleDeg: 70,
    distance: 115,
    knockback: 28,
  },
  aquaBeam: {
    cooldownMs: 9000,
    damage: 32,
    length: 250,
    width: 22,
  },
  deokbaeHowl: {
    cooldownMs: 14000,
    damage: 45,
    radius: 80,
    bucketSize: 80,
  },
  safetyReport: {
    cooldownMs: 20000,
    damage: 90,
    regularStunMs: 3000,
    bossStunMs: 1500,
  },
} as const;
