import { expect, test } from '@playwright/test';
import { advance, openScenario, snapshot } from './helpers';

test('간식이 차도 멈추지 않고 먼저 누른 기술 하나를 배운다', async ({ page }) => {
  await openScenario(page, 'skill-dock');
  const before = await snapshot(page);
  const autoSkillList = page.getByRole('list', { name: '자동 기술 상태' });
  const visibleAutoSkills = autoSkillList.getByRole('listitem');
  await expect(visibleAutoSkills).toHaveCount(2);
  await expect(visibleAutoSkills.nth(0)).toHaveAccessibleName('짖기 · 자동');
  await expect(visibleAutoSkills.nth(1)).toHaveAccessibleName('덕배 공격 · 자동');
  const tail = page.locator('[data-skill="tailSwipe"]');
  const aqua = page.locator('[data-skill="aquaBeam"]');
  await expect(tail).toHaveAttribute('data-affordable', 'true');
  await expect(tail).toHaveAccessibleName('꼬리치기, 간식 15개, 배울 수 있음');

  await tail.click();
  await aqua.click();
  await advance(page, 1000 / 60);

  const after = await snapshot(page);
  expect(after.run.simulationMs).toBeGreaterThan(before.run.simulationMs);
  expect(after.run.learnedSkills).toMatchObject({ tailSwipe: true, aquaBeam: false });
  expect(after.run.snacks).toBe(before.run.snacks - 15);
  await expect(page.getByText('꼬리치기 습득!')).toBeVisible();
  await expect(aqua).toHaveAttribute('data-learned', 'false');
  await expect(page.locator('[data-ui="skill-selection"]')).toHaveCount(0);
  await expect(visibleAutoSkills).toHaveCount(3);
  await expect(autoSkillList.getByRole('listitem', { name: /^꼬리치기 · \d+초$/ })).toHaveCount(1);

  await advance(page, 1000 / 60);
  await expect(visibleAutoSkills).toHaveCount(3);
  await expect(page.locator('.auto-skill-row[data-visible="true"]')).toHaveCount(3);
});

test('stable skill button으로 직접 구매하면 비용이 15→25→40 순서로 차감된다', async ({ page }) => {
  await openScenario(page, 'skill-dock');
  const purchases = [
    { skillId: 'tailSwipe', cost: 15, snacksAfter: 65, nextCost: 25 },
    { skillId: 'aquaBeam', cost: 25, snacksAfter: 40, nextCost: 40 },
    { skillId: 'safetyReport', cost: 40, snacksAfter: 0, nextCost: null },
  ] as const;

  const activations = ['click', 'Enter', 'Space'] as const;
  for (const [index, purchase] of purchases.entries()) {
    const before = await snapshot(page);
    expect(before.run.nextSkillCost).toBe(purchase.cost);
    const button = page.locator(`[data-skill="${purchase.skillId}"]`);
    await expect(button).toHaveCount(1);
    await expect(button).toHaveAttribute('data-affordable', 'true');
    await expect(button.locator('small')).toHaveText(`${purchase.cost}개`);
    await expect(button).toHaveAccessibleName(
      `${skillName(purchase.skillId)}, 간식 ${purchase.cost}개, 배울 수 있음`,
    );

    const activation = activations[index]!;
    if (activation === 'click') {
      await button.click();
    } else {
      await button.focus();
      await page.keyboard.press(activation);
    }
    await expect(button).toHaveAttribute('data-queued', 'true');
    await advance(page, 1000 / 60);

    const after = await snapshot(page);
    expect(after.run.learnedSkills[purchase.skillId]).toBe(true);
    expect(after.run.snacks).toBe(purchase.snacksAfter);
    expect(after.run.nextSkillCost).toBe(purchase.nextCost);
    await expect(button).toHaveAttribute('data-learned', 'true');
    await expect(button).toHaveAccessibleName(`${skillName(purchase.skillId)}, 배움, 자동 시전`);
  }

  expect((await snapshot(page)).run.learnedSkills).toEqual({
    tailSwipe: true,
    aquaBeam: true,
    safetyReport: true,
  });
});

function skillName(skillId: 'tailSwipe' | 'aquaBeam' | 'safetyReport'): string {
  if (skillId === 'tailSwipe') return '꼬리치기';
  if (skillId === 'aquaBeam') return '아쿠아빔';
  return '안전신문고';
}

test('HUD overlay는 390px CSS 좌표에서 dock과 joystick이 겹치지 않는다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await openScenario(page, 'skill-dock');
  const box = async (selector: string) => {
    const value = await page.locator(selector).boundingBox();
    if (value === null) throw new Error(`missing ${selector}`);
    return value;
  };
  const root = await box('#game-root');
  const overlay = await box('.hud-overlay');
  const joystickControl = page.getByRole('application', { name: '이동 조이스틱' });
  await expect(joystickControl).toHaveAttribute(
    'aria-description',
    '터치로 드래그하거나 WASD 및 방향키로 이동합니다',
  );
  await expect(joystickControl).toHaveAttribute(
    'aria-keyshortcuts',
    'W A S D ArrowUp ArrowDown ArrowLeft ArrowRight',
  );
  const joystick = await box('.virtual-joystick');
  const ring = await box('.virtual-joystick__ring');
  const dock = await box('.skill-dock');
  expect(root.width).toBeCloseTo(390, 0);
  expect(root.height).toBeCloseTo(844, 0);
  expect(overlay.width).toBeCloseTo(root.width, 0);
  expect(overlay.height).toBeCloseTo(root.height, 0);
  expect(joystick.width).toBeCloseTo(112, 0);
  expect(joystick.height).toBeCloseTo(112, 0);
  expect(ring.width).toBeCloseTo(92, 0);
  expect(ring.height).toBeCloseTo(92, 0);
  expect(joystick.x + joystick.width / 2).toBeGreaterThan(root.x + root.width / 2);
  expect(root.x + root.width - (joystick.x + joystick.width)).toBeGreaterThanOrEqual(16);
  expect(dock.y - (joystick.y + joystick.height)).toBeGreaterThanOrEqual(16);
  expect(root.y + root.height - (dock.y + dock.height)).toBeGreaterThanOrEqual(12);
  expect(joystick.x).toBeGreaterThanOrEqual(root.x);
  expect(joystick.y).toBeGreaterThanOrEqual(root.y);
  expect(joystick.x + joystick.width).toBeLessThanOrEqual(root.x + root.width);
  expect(joystick.y + joystick.height).toBeLessThanOrEqual(root.y + root.height);
  expect(dock.x).toBeGreaterThanOrEqual(root.x);
  expect(dock.y).toBeGreaterThanOrEqual(root.y);
  expect(dock.x + dock.width).toBeLessThanOrEqual(root.x + root.width);
  expect(dock.y + dock.height).toBeLessThanOrEqual(root.y + root.height);
  for (const button of await page.locator('.skill-dock button').all()) {
    const buttonBox = await button.boundingBox();
    expect(buttonBox?.width).toBeGreaterThanOrEqual(88);
    expect(buttonBox?.height).toBeGreaterThanOrEqual(56);
  }
});
