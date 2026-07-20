import type { PurchasableSkillId, SkillCost } from '../types/GameTypes';

export interface SkillPurchaseResult {
  readonly status:
    | 'queued'
    | 'learned'
    | 'alreadyLearned'
    | 'insufficientSnacks'
    | 'queueBusy';
  readonly skillId: PurchasableSkillId;
  readonly cost: SkillCost | null;
  readonly spent: number;
  readonly snacks: number;
  readonly nextCost: SkillCost | null;
}

export interface ProgressionSnapshot {
  readonly snacks: number;
  readonly learned: Readonly<Record<PurchasableSkillId, boolean>>;
  readonly queuedSkillId: PurchasableSkillId | null;
  readonly nextCost: SkillCost | null;
}
