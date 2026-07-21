import type { PurchasableSkillId } from '../types/GameTypes';

export type SkillIconId = 'bark' | 'deokbae' | 'tail' | 'water' | 'report';

export const SKILL_COPY = {
  tailSwipe: { name: '꼬리치기', icon: 'tail' },
  aquaBeam: { name: '아쿠아빔', icon: 'water' },
  safetyReport: { name: '안전신문고', icon: 'report' },
} as const satisfies Record<PurchasableSkillId, { readonly name: string; readonly icon: SkillIconId }>;

export function skillCopy(skillId: PurchasableSkillId): typeof SKILL_COPY[PurchasableSkillId] {
  return SKILL_COPY[skillId];
}

const PATHS: Record<SkillIconId, string> = {
  bark: '<path d="M4 9h5l5-4v14l-5-4H4z"/><path d="M17 8l3-2M18 12h4M17 16l3 2"/>',
  deokbae: '<path d="M6 10L4 4l5 3a7 7 0 0 1 6 0l5-3-2 6v5a6 6 0 0 1-12 0z"/><path d="M9 13h.01M15 13h.01M10 17h4"/>',
  tail: '<path d="M5 17c5 2 11-1 12-6 .6-3-2-5-5-3-2 1-1 4 1 3"/><path d="M5 17l3 3"/>',
  water: '<path d="M12 3C9 7 6 10 6 14a6 6 0 0 0 12 0c0-4-3-7-6-11z"/><path d="M9 15c.5 2 2 3 4 3"/>',
  report: '<path d="M7 3h10l3 3v15H7z"/><path d="M17 3v4h4M10 11h7M10 15h7M10 19h4"/>',
};

export function skillIconSvg(icon: SkillIconId): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[icon]}</svg>`;
}
