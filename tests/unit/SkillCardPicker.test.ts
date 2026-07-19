import { SeededRng } from '../../src/game/core/SeededRng';
import { pickSkillCards } from '../../src/game/progression/SkillCardPicker';
import type { SkillLevels } from '../../src/game/skills/SkillTypes';
import { skillLevels } from './fixtures';

describe('pickSkillCards', () => {
  it('배우지 않은 스킬이 있으면 서로 다른 세 장 중 최소 하나를 해금 카드로 준다', () => {
    const cards = pickSkillCards(skillLevels({ bark: 1 }), new SeededRng(9));

    expect(cards).toHaveLength(3);
    expect(new Set(cards.map((card) => card.id)).size).toBe(3);
    expect(cards.some((card) => card.kind === 'unlock')).toBe(true);
  });

  it('seeded 최종 순서는 upgrade를 첫 카드로 둘 수 있고 unlock 보장은 유지한다', () => {
    const cards = pickSkillCards(skillLevels({ bark: 1 }), new SeededRng(7));

    expect(cards.at(0)).toMatchObject({ id: 'bark:2', kind: 'upgrade' });
    expect(cards.some((card) => card.kind === 'unlock')).toBe(true);
  });

  it('최대 레벨 항목은 후보에서 제거하고 같은 seed는 같은 결과다', () => {
    const current = skillLevels({ bark: 3, scold: 3, aquaBeam: 1 });

    const a = pickSkillCards(current, new SeededRng(42));
    const b = pickSkillCards(current, new SeededRng(42));

    expect(a).toEqual(b);
    expect(a.every((card) => !['bark', 'scold'].includes(card.skillId))).toBe(true);
  });

  it('후보가 세 개 미만이면 표시 가능한 카드만 반환한다', () => {
    const cards = pickSkillCards(
      skillLevels({ bark: 3, scold: 3, aquaBeam: 3, deokbaeHowl: 3, safetyReport: 2 }),
      new SeededRng(1),
    );

    expect(cards).toEqual([{
      id: 'safetyReport:3',
      skillId: 'safetyReport',
      nextLevel: 3,
      kind: 'upgrade',
      title: '안전신문고 신고하기 Lv.3',
    }]);
  });

  it('정상 다섯 threshold 선택 동안 매번 서로 다른 카드 세 장을 유지한다', () => {
    const rng = new SeededRng(20260720);
    let levels: SkillLevels = skillLevels();

    for (let threshold = 0; threshold < 5; threshold += 1) {
      const cards = pickSkillCards(levels, rng);
      expect(cards).toHaveLength(3);
      expect(new Set(cards.map((card) => card.id)).size).toBe(3);
      const selected = cards.at(0)!;
      levels = { ...levels, [selected.skillId]: selected.nextLevel };
    }
  });
});
