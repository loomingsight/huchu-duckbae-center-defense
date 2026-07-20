import { attackImpactMs } from '../data/balance';
import type { DamageSource, ImpactStrength } from '../types/GameTypes';

export const SKILL_DEFINITIONS = {
  tailSwipe: {
    cooldownMs: 8000,
    impactMs: attackImpactMs('normal') as 250,
    damage: 14,
  },
  aquaBeam: {
    cooldownMs: 10_000,
    impactMs: 600,
    damage: 160,
  },
  safetyReport: {
    cooldownMs: 22_000,
    impactMs: 300,
    regularDamage: 90,
    bossDamage: 45,
  },
} as const;

const IMPACT_STRENGTH_BY_SOURCE: Readonly<Record<DamageSource, ImpactStrength>> = {
  bark: 'light',
  deokbae: 'light',
  tailSwipe: 'medium',
  aquaBeam: 'heavy',
  safetyReport: 'heavy',
};

export function impactStrengthFor(source: DamageSource): ImpactStrength {
  const strength = IMPACT_STRENGTH_BY_SOURCE[source];
  if (strength === undefined) {
    throw new RangeError(`Unknown damage source ${String(source)}`);
  }
  return strength;
}
