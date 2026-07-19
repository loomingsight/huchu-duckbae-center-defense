import type { SkillId, SkillLevel } from '../types/GameTypes';

export type SkillLevels = Readonly<Record<SkillId, SkillLevel>>;

export interface SkillCard {
  readonly id: string;
  readonly skillId: SkillId;
  readonly nextLevel: Exclude<SkillLevel, 0>;
  readonly kind: 'unlock' | 'upgrade';
  readonly title: string;
}
