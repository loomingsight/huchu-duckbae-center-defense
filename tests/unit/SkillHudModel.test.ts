import { AssetKeys } from '../../src/game/assets/AssetKeys';
import {
  buildSkillSlots,
  cooldownMaskAngle,
  cooldownSeconds,
  skillIconKey,
  SKILL_SLOT,
} from '../../src/game/ui/SkillHud';
import { formatTopHud } from '../../src/game/ui/TopHud';
import { skillLevels } from './fixtures';

it('bark를 첫 칸에 고정하고 실제 배운 순서만 32px 슬롯으로 배치한다', () => {
  const slots = buildSkillSlots(
    ['aquaBeam', 'scold', 'deokbaeHowl'],
    skillLevels({ aquaBeam: 1, scold: 2 }),
  );

  expect(slots.map((slot) => slot.id)).toEqual(['bark', 'aquaBeam', 'scold']);
  expect(slots.map((slot) => [slot.x, slot.y, slot.width, slot.height])).toEqual([
    [12, 92, 32, 32],
    [12, 128, 32, 32],
    [12, 164, 32, 32],
  ]);
  expect(SKILL_SLOT).toMatchObject({ iconMax: 28, fontPx: 9, gap: 4 });
});

it('cooldown 원형 mask와 9px seconds는 0%/경계를 결정적으로 표시한다', () => {
  expect(cooldownMaskAngle(0)).toBeCloseTo(Math.PI * 2, 12);
  expect(cooldownMaskAngle(0.5)).toBeCloseTo(Math.PI, 12);
  expect(cooldownMaskAngle(1)).toBe(0);
  expect([0, 1, 999, 1000, 1001].map(cooldownSeconds)).toEqual([null, 1, 1, 1, 2]);
});

it('다섯 skill id는 Boot에서 만든 고유 icon texture에 exact 매핑된다', () => {
  expect([
    skillIconKey('bark'),
    skillIconKey('scold'),
    skillIconKey('aquaBeam'),
    skillIconKey('deokbaeHowl'),
    skillIconKey('safetyReport'),
  ]).toEqual([
    AssetKeys.skillBark,
    AssetKeys.skillScold,
    AssetKeys.skillAquaBeam,
    AssetKeys.skillDeokbaeHowl,
    AssetKeys.skillSafetyReport,
  ]);
});

it('TopHud는 shelter HP, WAVE n/5, 누적 snack을 한 줄로 만든다', () => {
  const text = formatTopHud({ shelterHp: 87, wave: 3, snacks: 22 });

  expect(text).toBe('보호소 HP 87/100   WAVE 3/5   간식 22');
  expect(text).not.toContain('\n');
});

it('중복 learned order와 level 0 항목은 표시하지 않고 입력을 변경하지 않는다', () => {
  const order = ['scold', 'scold', 'safetyReport'] as const;
  const levels = skillLevels({ scold: 1 });

  expect(buildSkillSlots(order, levels).map(({ id }) => id)).toEqual(['bark', 'scold']);
  expect(order).toEqual(['scold', 'scold', 'safetyReport']);
  expect(levels).toEqual(skillLevels({ scold: 1 }));
});
