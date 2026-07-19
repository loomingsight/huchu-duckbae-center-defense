import type { RandomSource } from '../core/SeededRng';
import type { SkillCard, SkillLevels } from '../skills/SkillTypes';
import type { SkillId, SkillLevel } from '../types/GameTypes';

const SKILL_IDS: readonly SkillId[] = [
  'bark',
  'scold',
  'aquaBeam',
  'deokbaeHowl',
  'safetyReport',
];

const TITLES: Readonly<Record<SkillId, string>> = {
  bark: '짖기',
  scold: '호통치기',
  aquaBeam: '아쿠아빔',
  deokbaeHowl: '덕배 하울링',
  safetyReport: '안전신문고 신고하기',
};

function shuffle<T>(values: readonly T[], rng: RandomSource): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng.next() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

function cardFor(skillId: SkillId, level: SkillLevel): SkillCard | undefined {
  if (level === 3) return undefined;
  const nextLevel = (level + 1) as Exclude<SkillLevel, 0>;
  const kind = level === 0 ? 'unlock' : 'upgrade';
  return {
    id: `${skillId}:${nextLevel}`,
    skillId,
    nextLevel,
    kind,
    title: kind === 'unlock'
      ? `${TITLES[skillId]} 배우기`
      : `${TITLES[skillId]} Lv.${nextLevel}`,
  };
}

export function pickSkillCards(
  levels: SkillLevels,
  rng: RandomSource,
): readonly SkillCard[] {
  const candidates = SKILL_IDS
    .map((id) => cardFor(id, levels[id]))
    .filter((card): card is SkillCard => card !== undefined);
  const unlocks = candidates.filter((card) => card.kind === 'unlock');
  const selected: SkillCard[] = [];
  if (unlocks.length > 0) selected.push(shuffle(unlocks, rng).at(0)!);
  const remaining = candidates.filter((card) => (
    !selected.some((chosen) => chosen.id === card.id)
  ));
  selected.push(...shuffle(remaining, rng).slice(0, 3 - selected.length));
  return shuffle(selected, rng);
}
