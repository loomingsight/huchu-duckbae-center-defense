import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HudSystem } from '../../src/game/ui/HudSystem';
import { joystickBottomOffset } from '../../src/game/ui/HudLayout';
import { ACTION_COPY, skillCopy, skillIconSvg } from '../../src/game/ui/SkillIconSvg';
import { TopHud } from '../../src/game/ui/TopHud';
import {
  JOYSTICK_HIT_SIZE,
  JOYSTICK_RING_RADIUS,
  VirtualJoystick,
} from '../../src/game/player/VirtualJoystick';
import type { RunSnapshot } from '../../src/game/session/RunSnapshot';

it('수동 기술 copy, 단색 SVG와 독립된 오른손 joystick 규격을 제공한다', () => {
  expect(skillCopy('tailSwipe')).toEqual({ name: '꼬리치기', icon: 'tail' });
  expect(Object.values(ACTION_COPY).map(({ name }) => name)).toEqual([
    '짖기', '꼬리치기', '아쿠아빔', '안전신문고',
  ]);
  for (const icon of ['bark', 'deokbae', 'tail', 'water', 'report'] as const) {
    const svg = skillIconSvg(icon);
    expect(svg).toContain('<svg viewBox="0 0 24 24"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).not.toMatch(/<img|https?:|data:image|emoji/i);
  }
  expect(joystickBottomOffset(0)).toBe(16);
  expect(joystickBottomOffset(20)).toBe(20);
  expect({ hit: JOYSTICK_HIT_SIZE, ringRadius: JOYSTICK_RING_RADIUS })
    .toEqual({ hit: 112, ringRadius: 46 });
});

it('HUD는 구매, 학습, 시전 실패를 게임을 멈추지 않는 같은 overlay에서 처리한다', () => {
  const fake = createFakeDom();
  const purchases: string[] = [];
  const actions: string[] = [];
  const hud = new HudSystem({
    root: fake.root as never,
    document: fake.document as never,
    queueSkillPurchase: (skillId) => {
      purchases.push(skillId);
      return {
        status: 'queued', skillId, cost: 15, spent: 0, snacks: 19, nextCost: 15,
      };
    },
    queuePlayerAction: (actionId) => {
      actions.push(actionId);
      return { status: 'queued', actionId };
    },
  });
  const run = runSnapshot();

  hud.render(run);
  fake.buttons[1]!.click();
  fake.buttons[2]!.click();

  expect(actions).toEqual(['bark']);
  expect(purchases).toEqual(['tailSwipe']);
  expect(hud.snapshot()).toMatchObject({
    wave: 1,
    timeText: '00:00',
    snacks: 19,
    companion: { label: '덕배 · 자동', ready: true },
    toast: '배울 수 있어요',
  });
  expect(hud.snapshot().actions.buttons.map(({ id }) => id)).toEqual([
    'bark', 'tailSwipe', 'aquaBeam', 'safetyReport',
  ]);

  hud.showNoTarget();
  expect(hud.snapshot().toast).toBe('대상이 없어요');
  hud.step(699);
  expect(hud.snapshot().toast).toBe('대상이 없어요');
  hud.step(1);
  expect(hud.snapshot().toast).toBeNull();

  const learned = runSnapshot({
    snacks: 4,
    nextSkillCost: 25,
    learnedSkills: { tailSwipe: true, aquaBeam: true, safetyReport: false },
    actionStates: {
      ...run.actionStates,
      tailSwipe: skillState(true, 1000, 0),
    },
  });
  hud.showLearned('tailSwipe', learned);
  expect(hud.snapshot().toast).toBe('꼬리치기 습득!');
  expect(hud.snapshot().actions.buttons.find(({ id }) => id === 'tailSwipe'))
    .toMatchObject({ mode: 'cooldown', remainingSeconds: 1 });
  hud.destroy();
});

it('동일한 HUD 표시 상태는 다음 frame에서 DOM을 다시 쓰지 않는다', () => {
  const fake = createFakeDom();
  const hud = new HudSystem({
    root: fake.root as never,
    document: fake.document as never,
    queueSkillPurchase: (skillId) => ({
      status: 'queueBusy', skillId, cost: 15, spent: 0, snacks: 19, nextCost: 15,
    }),
    queuePlayerAction: (actionId) => ({ status: 'queueBusy', actionId }),
  });

  hud.render(runSnapshot({ simulationMs: 100 }));
  const writesAfterFirstFrame = fake.domWrites;
  hud.render(runSnapshot({ simulationMs: 999 }));

  expect(fake.domWrites).toBe(writesAfterFirstFrame);
  hud.destroy();
});

it('overlay는 한 번 mount되고 모든 listener와 mute subscription을 한 번만 정리한다', () => {
  const fake = createFakeDom();
  let muteListener: ((muted: boolean) => void) | undefined;
  let toggles = 0;
  let subscriptions = 0;
  let unsubscriptions = 0;
  const hud = new HudSystem({
    root: fake.root as never,
    document: fake.document as never,
    mutePort: {
      muted: () => false,
      toggle: () => { toggles += 1; },
      subscribe: (listener) => {
        subscriptions += 1;
        muteListener = listener;
        return () => { unsubscriptions += 1; };
      },
    },
    queueSkillPurchase: (skillId) => ({
      status: 'queueBusy', skillId, cost: 15, spent: 0, snacks: 19, nextCost: 15,
    }),
    queuePlayerAction: (actionId) => ({ status: 'queueBusy', actionId }),
  });
  hud.render(runSnapshot());
  const overlay = fake.root.children[0]!;
  const nodes = flatten(overlay);
  const listenerAdds = fake.listenerAdds;

  fake.buttons[0]!.click();
  muteListener?.(true);
  expect(toggles).toBe(1);
  expect(hud.snapshot().muted).toBe(true);
  hud.setActive(false);
  expect(overlay.dataset.active).toBe('false');
  expect(hud.joystick.read()).toEqual({ x: 0, y: 0, magnitude: 0 });
  hud.setActive(true);
  hud.reset();
  hud.render(runSnapshot());
  flatten(overlay).forEach((node, index) => expect(node).toBe(nodes[index]));
  expect(fake.listenerAdds).toBe(listenerAdds);

  hud.destroy();
  hud.destroy();
  expect(fake.listenerAdds).toBe(10);
  expect(fake.listenerRemoves).toBe(10);
  expect(subscriptions).toBe(1);
  expect(unsubscriptions).toBe(1);
});

it('음소거 button은 native click 하나로 마우스와 키보드 경로를 처리한다', () => {
  const fake = createFakeDom();
  let toggles = 0;
  const top = new TopHud(fake.root as never, fake.document as never, {
    muted: () => false,
    toggle: () => { toggles += 1; },
    subscribe: () => () => undefined,
  });

  fake.buttons[0]!.click();
  fake.buttons[0]!.click();
  fake.buttons[0]!.dispatch('pointerup');
  expect(toggles).toBe(2);
  top.destroy();
});

it('joystick은 disable, lost capture, destroy에서 입력과 capture를 정리한다', () => {
  const fake = createFakeDom();
  const joystick = new VirtualJoystick(fake.root as never, fake.document as never);
  const hit = fake.root.children[0]!;

  hit.dispatch('pointerdown', pointer(1, 102, 56));
  expect(joystick.read().magnitude).toBeGreaterThan(0);
  joystick.setEnabled(false);
  expect(fake.captureReleases).toEqual([1]);
  expect(joystick.read()).toEqual({ x: 0, y: 0, magnitude: 0 });

  joystick.setEnabled(true);
  hit.dispatch('pointerdown', pointer(2, 102, 56));
  hit.losePointerCapture(2);
  expect(joystick.read()).toEqual({ x: 0, y: 0, magnitude: 0 });
  joystick.destroy();
});

it('모바일 HUD CSS는 왼손 2x2 원형 기술과 오른손 112px joystick을 분리한다', () => {
  const styles = source('../../src/styles.css');

  expect(cssRule(styles, '.action-dock')).toMatch(/left:\s*max\(12px,\s*env\(safe-area-inset-left/);
  expect(cssRule(styles, '.action-dock')).toMatch(/grid-template-columns:\s*repeat\(2,\s*56px\)/);
  expect(cssRule(styles, '.action-button')).toMatch(/width:\s*56px;\s*height:\s*56px/);
  expect(cssRule(styles, '.action-button')).toMatch(/border-radius:\s*50%/);
  expect(cssRule(styles, '.action-button__cooldown')).toMatch(/conic-gradient/);
  expect(cssRule(styles, '.virtual-joystick')).toMatch(/right:\s*max\(16px/);
  expect(cssRule(styles, '.virtual-joystick')).toMatch(/width:\s*112px;\s*height:\s*112px/);
  expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  expect(styles).toContain('.action-button { animation: none !important; }');
});

it('production scene은 수동 action port를 연결하고 이전 자동 기술 HUD를 사용하지 않는다', () => {
  const scene = source('../../src/game/scenes/GameScene.ts');
  const hud = source('../../src/game/ui/HudSystem.ts');
  const styles = source('../../src/styles.css');

  expect(scene).toContain('queuePlayerAction: (actionId) => this.session.queuePlayerAction(actionId)');
  expect(scene).toContain("event.type === 'playerActionRejected' && event.reason === 'noTarget'");
  expect(hud).toContain('new ActionDock(');
  expect(hud).toContain('new CompanionStatusHud(');
  expect(`${scene}\n${hud}\n${styles}`).not.toMatch(/AutoSkillHud|SkillDock|auto-skill-hud|skill-dock/);
  expect(styles).toContain(
    '#game-root, #game-root * { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }',
  );
});

function runSnapshot(overrides: Partial<RunSnapshot> = {}): RunSnapshot {
  const tail = skillState(false);
  const aqua = skillState(true, 2400, 0.76);
  const safety = skillState(false);
  return {
    mode: 'playing',
    simulationMs: 0,
    wave: 1,
    playerHp: 1000,
    playerMaxHp: 1000,
    snacks: 19,
    nextSkillCost: 15,
    learnedSkills: { tailSwipe: false, aquaBeam: true, safetyReport: false },
    skillStates: { tailSwipe: tail, aquaBeam: aqua, safetyReport: safety },
    actionStates: {
      bark: {
        learned: true, ready: true, cooldownRemainingMs: 0, progress: 1,
        activeCastId: null, phase: 'ready', elapsedMs: 0, lockedTargetId: null,
      },
      tailSwipe: tail,
      aquaBeam: aqua,
      safetyReport: safety,
    },
    companion: { companion: 'deokbae', active: true, cooldownRemainingMs: 0 },
    enemies: [],
    projectiles: [],
    activeEnemyCount: 0,
    pendingSpawns: 0,
    activeProjectileCount: 0,
    ...overrides,
  };
}

function skillState(learned: boolean, cooldownRemainingMs = 0, progress = 0) {
  return {
    learned,
    cooldownRemainingMs,
    ready: learned && cooldownRemainingMs === 0,
    progress,
    activeCastId: null,
  };
}

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

function cssRule(styles: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  if (match?.[1] === undefined) throw new Error(`Missing CSS rule ${selector}`);
  return match[1];
}

interface FakeElement {
  className: string;
  textContent: string;
  innerHTML: string;
  disabled: boolean;
  readonly style: {
    transform: string;
    setProperty(name: string, value: string): void;
    getPropertyValue(name: string): string;
  };
  readonly dataset: Record<string, string>;
  readonly children: FakeElement[];
  append(...children: FakeElement[]): void;
  appendChild(child: FakeElement): FakeElement;
  addEventListener(type: string, listener: (event?: never) => void): void;
  click(): void;
  removeEventListener(type: string, listener: (event?: never) => void): void;
  dispatch(type: string, event?: object): void;
  losePointerCapture(pointerId: number): void;
  remove(): void;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}

function createFakeDom() {
  const buttons: FakeElement[] = [];
  let listenerAdds = 0;
  let listenerRemoves = 0;
  let domWrites = 0;
  const captureReleases: number[] = [];
  const make = (tag: string): FakeElement => {
    const listeners = new Map<string, (event?: never) => void>();
    const attributes = new Map<string, string>();
    const captures = new Set<number>();
    const styleValues = new Map<string, string>();
    let html = '';
    let text = '';
    let disabled = false;
    let transform = '';
    const dataset = new Proxy({} as Record<string, string>, {
      set: (target, property, value: string) => {
        domWrites += 1;
        target[String(property)] = value;
        return true;
      },
    });
    const style = {
      get transform() { return transform; },
      set transform(value: string) { transform = value; domWrites += 1; },
      setProperty: (name: string, value: string) => {
        styleValues.set(name, value);
        domWrites += 1;
      },
      getPropertyValue: (name: string) => styleValues.get(name) ?? '',
    };
    const element: FakeElement = {
      className: '',
      get textContent() { return text; },
      set textContent(value: string) { text = value; domWrites += 1; },
      get innerHTML() { return html; },
      set innerHTML(value: string) { html = value; domWrites += 1; },
      get disabled() { return disabled; },
      set disabled(value: boolean) { disabled = value; domWrites += 1; },
      style,
      dataset,
      children: [],
      append: (...children) => element.children.push(...children),
      appendChild: (child) => { element.children.push(child); return child; },
      addEventListener: (type, listener) => { listenerAdds += 1; listeners.set(type, listener); },
      click: () => { if (!element.disabled) listeners.get('click')?.(); },
      removeEventListener: (type, listener) => {
        if (listeners.get(type) === listener) {
          listenerRemoves += 1;
          listeners.delete(type);
        }
      },
      dispatch: (type, event = {}) => listeners.get(type)?.(event as never),
      losePointerCapture: (pointerId) => {
        captures.delete(pointerId);
        listeners.get('lostpointercapture')?.(pointer(pointerId, 56, 56) as never);
      },
      remove: () => undefined,
      getAttribute: (name) => attributes.get(name) ?? null,
      setAttribute: (name, value) => { domWrites += 1; attributes.set(name, value); },
    };
    Object.assign(element, {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 112, height: 112 }),
      setPointerCapture: (pointerId: number) => captures.add(pointerId),
      hasPointerCapture: (pointerId: number) => captures.has(pointerId),
      releasePointerCapture: (pointerId: number) => {
        if (captures.delete(pointerId)) captureReleases.push(pointerId);
      },
    });
    if (tag === 'button') buttons.push(element);
    return element;
  };
  return {
    document: { createElement: make },
    root: make('div'),
    buttons,
    get listenerAdds() { return listenerAdds; },
    get listenerRemoves() { return listenerRemoves; },
    get domWrites() { return domWrites; },
    captureReleases,
  };
}

function pointer(pointerId: number, clientX: number, clientY: number) {
  return { pointerId, clientX, clientY, preventDefault: () => undefined };
}

function flatten(root: FakeElement): readonly FakeElement[] {
  return [root, ...root.children.flatMap((child) => flatten(child))];
}
