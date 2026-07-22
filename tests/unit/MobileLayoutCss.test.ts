import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const styles = readFileSync(
  fileURLToPath(new URL('../../src/styles.css', import.meta.url)),
  'utf8',
);

const MOBILE_WIDTH = 390;
const MOBILE_HEIGHT = 844;
const LOGICAL_WIDTH = 540;
const LOGICAL_HEIGHT = 960;
const MIN_TOUCH_TARGET_PX = 44;

it('390x844 FIT 후 Title/Result primary button은 44px 이상이다', () => {
  const fitScale = Math.min(MOBILE_WIDTH / LOGICAL_WIDTH, MOBILE_HEIGHT / LOGICAL_HEIGHT);
  const logicalHeight = pxProperty(rule('.primary-game-button'), 'min-height');

  expect(logicalHeight * fitScale).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
});

it('비축척 HUD mute button은 44px 이상 touch target을 제공한다', () => {
  expect(pxProperty(rule('.top-hud__mute'), 'min-height'))
    .toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
});

it('왼손 ActionDock은 safe-area 안 2x2 56px 버튼으로 고정된다', () => {
  const dock = rule('.action-dock');
  const button = rule('.action-button');

  expect(dock).toMatch(/left:\s*max\(12px,\s*env\(safe-area-inset-left,\s*0px\)\)/);
  expect(dock).toMatch(/bottom:\s*max\(14px,\s*env\(safe-area-inset-bottom,\s*0px\)\)/);
  expect(dock).toMatch(/grid-template-columns:\s*repeat\(2,\s*56px\)/);
  expect(dock).toMatch(/grid-template-rows:\s*auto\s+repeat\(2,\s*56px\)/);
  expect(pxProperty(button, 'width')).toBe(56);
  expect(pxProperty(button, 'height')).toBe(56);
  expect(button).toMatch(/border-radius:\s*50%/);
});

it('오른손 joystick은 하단 dock 높이에 종속되지 않고 112px를 유지한다', () => {
  const joystick = rule('.virtual-joystick');

  expect(joystick).toMatch(/right:\s*max\(16px,\s*env\(safe-area-inset-right,\s*0px\)\)/);
  expect(joystick).toMatch(/bottom:\s*max\(16px,\s*env\(safe-area-inset-bottom,\s*0px\)\)/);
  expect(pxProperty(joystick, 'width')).toBe(112);
  expect(pxProperty(joystick, 'height')).toBe(112);
  expect(joystick).not.toMatch(/calc\(/);
});

it('상단 companion 상태는 safe-area에 맞춘 한 줄이며 자동 기술 grid는 없다', () => {
  const companion = rule('.companion-status');

  expect(rule('.hud-overlay')).toMatch(/--hud-safe-top:\s*env\(safe-area-inset-top,\s*0px\)/);
  expect(companion).toMatch(/top:\s*max\(12px,\s*var\(--hud-safe-top\)\)/);
  expect(companion).toMatch(/white-space:\s*nowrap/);
  expect(styles).not.toMatch(/\.auto-skill-hud|\.auto-skill-row/);
});

it('쿨타임은 conic-gradient 시계이며 reduced motion에서 pulse를 제거한다', () => {
  expect(rule('.action-button__cooldown')).toMatch(/background:\s*conic-gradient/);
  expect(rule('.action-button__remaining')).toMatch(/font-size:\s*18px/);
  expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  expect(styles).toContain('.action-button { animation: none !important; }');
});

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  if (match?.[1] === undefined) throw new Error(`Missing CSS rule ${selector}`);
  return match[1];
}

function pxProperty(declarations: string, property: string): number {
  const escaped = property.replaceAll('-', '\\-');
  const match = declarations.match(new RegExp(`${escaped}:\\s*([\\d.]+)px`));
  if (match?.[1] === undefined) throw new Error(`Missing px property ${property}`);
  return Number(match[1]);
}
