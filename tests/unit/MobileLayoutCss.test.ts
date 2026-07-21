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

it('390px dock의 안전신문고는 22px SVG와 한 줄 이름 폭을 둘 다 확보한다', () => {
  const button = rule('.skill-dock button');
  const horizontalPadding = secondPx(button, 'padding');
  const border = pxProperty(button, 'border');
  const iconColumn = firstPx(button, 'grid-template-columns');
  const columnGap = secondPx(button, 'gap');
  const dockContentWidth = MOBILE_WIDTH - 12 * 2;
  const buttonWidth = (dockContentWidth - 44 - 6 * 3) / 3;
  const nameWidth = buttonWidth
    - horizontalPadding * 2
    - border * 2
    - iconColumn
    - columnGap;

  expect(nameWidth).toBeGreaterThanOrEqual(60);
  expect(rule('.skill-dock__icon svg')).toMatch(/width:\s*22px;\s*height:\s*22px/);
});

it('자동 기술 5개는 3열 horizontal layout으로 390x844 상단 letterbox 안에 머문다', () => {
  const hud = rule('.auto-skill-hud');
  expect(hud).toMatch(/grid-template-columns:\s*repeat\(3,\s*max-content\)/);

  const top = firstPx(hud, 'top');
  const rowHeight = pxProperty(rule('.auto-skill-row'), 'min-height');
  const rowGap = firstPx(hud, 'gap');
  const rowCount = Math.ceil(5 / 3);
  const hudBottom = top + rowHeight * rowCount + rowGap * (rowCount - 1);
  const fitScale = Math.min(MOBILE_WIDTH / LOGICAL_WIDTH, MOBILE_HEIGHT / LOGICAL_HEIGHT);
  const canvasTop = (MOBILE_HEIGHT - LOGICAL_HEIGHT * fitScale) / 2;

  expect(hudBottom).toBeLessThan(canvasTop);
  expect(hud).toMatch(/left:\s*12px/);
});

it('47px safe-area top에서도 자동 기술은 P1 canvas 진입선 위에서 끝난다', () => {
  const hud = rule('.auto-skill-hud');
  expect(rule('.hud-overlay')).toMatch(/--hud-safe-top:\s*env\(safe-area-inset-top,\s*0px\)/);
  expect(hud).toMatch(/top:\s*max\(12px,\s*var\(--hud-safe-top\)\)/);
  const columnsMatch = hud.match(/grid-template-columns:\s*repeat\((\d+),/);
  if (columnsMatch?.[1] === undefined) throw new Error('Missing auto-skill column count');
  const columnCount = Number(columnsMatch[1]);
  const rowCount = Math.ceil(5 / columnCount);
  const safeTop = 47;
  const top = Math.max(firstPx(hud, 'top'), safeTop);
  const rowHeight = pxProperty(rule('.auto-skill-row'), 'min-height');
  const rowGap = firstPx(hud, 'gap');
  const hudBottom = top + rowHeight * rowCount + rowGap * (rowCount - 1);
  const fitScale = Math.min(MOBILE_WIDTH / LOGICAL_WIDTH, MOBILE_HEIGHT / LOGICAL_HEIGHT);
  const canvasTop = (MOBILE_HEIGHT - LOGICAL_HEIGHT * fitScale) / 2;

  expect(hudBottom).toBeLessThan(canvasTop);
});

it('compact top HUD는 3열 자동 기술과 상단 letterbox를 양분할 여백을 준다', () => {
  const topHud = rule('.top-hud');

  expect(pxProperty(topHud, 'font-size')).toBeLessThanOrEqual(10);
  expect(pxProperty(topHud, 'gap')).toBeLessThanOrEqual(2);
  expect(secondPx(topHud, 'padding')).toBeLessThanOrEqual(2);
  expect(firstPx(topHud, 'right')).toBeLessThanOrEqual(2);
});

it('compact 자동 기술 row는 말줄임 없이 기술명과 cooldown을 보존한다', () => {
  const row = rule('.auto-skill-row');
  const labelWidth = pxProperty(row, 'max-width')
    - secondPx(row, 'padding') * 2
    - pxProperty(rule('.auto-skill-row svg'), 'width')
    - pxProperty(row, 'gap');

  expect(labelWidth).toBeGreaterThanOrEqual(60);
  expect(rule('.auto-skill-row > span:last-child'))
    .toMatch(/text-overflow:\s*clip/);
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

function firstPx(declarations: string, property: string): number {
  const escaped = property.replaceAll('-', '\\-');
  const match = declarations.match(new RegExp(`${escaped}:\\s*[^;]*?([\\d.]+)px`));
  if (match?.[1] === undefined) throw new Error(`Missing px value ${property}`);
  return Number(match[1]);
}

function secondPx(declarations: string, property: string): number {
  const escaped = property.replaceAll('-', '\\-');
  const match = declarations.match(new RegExp(
    `${escaped}:\\s*(?:[\\d.]+px|0)\\s+([\\d.]+)px`,
  ));
  if (match?.[1] === undefined) throw new Error(`Missing two-value px property ${property}`);
  return Number(match[1]);
}
