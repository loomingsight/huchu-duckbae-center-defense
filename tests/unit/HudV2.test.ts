import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AutoSkillHud, autoRows, compactAutoRowLabel } from '../../src/game/ui/AutoSkillHud';
import { dockButtons, SkillDock } from '../../src/game/ui/SkillDock';
import { skillCopy, skillIconSvg } from '../../src/game/ui/SkillIconSvg';
import { formatShelterHp, shelterVisualState } from '../../src/game/ui/ShelterHpView';
import { joystickBottomOffset } from '../../src/game/ui/HudLayout';
import { HudSystem } from '../../src/game/ui/HudSystem';
import { TopHud } from '../../src/game/ui/TopHud';
import {
  JOYSTICK_HIT_SIZE,
  JOYSTICK_RING_RADIUS,
  VirtualJoystick,
} from '../../src/game/player/VirtualJoystick';
import type { PurchasableSkillId } from '../../src/game/types/GameTypes';
import type { RunSnapshot } from '../../src/game/session/RunSnapshot';

const state = {
  snacks: 0,
  nextSkillCost: 15 as const,
  learnedSkills: {
    tailSwipe: false,
    aquaBeam: false,
    safetyReport: false,
  },
  skillStates: {
    tailSwipe: skillState(false),
    aquaBeam: skillState(false),
    safetyReport: skillState(false),
  },
  companion: {
    companion: 'deokbae' as const,
    active: true as const,
    cooldownRemainingMs: 0,
  },
};

it('V2 자동 HUD, 구매 도크, 보호소 HP와 safe-area 수식이 canonical 계약을 따른다', () => {
  expect(skillCopy('tailSwipe')).toEqual({ name: '꼬리치기', icon: 'tail' });
  expect(autoRows(state).map((row) => row.label)).toEqual([
    '짖기 · 자동',
    '덕배 공격 · 자동',
  ]);
  expect(dockButtons(state).map((button) => button.name)).toEqual([
    '꼬리치기',
    '아쿠아빔',
    '안전신문고',
  ]);
  expect(formatShelterHp(734, 1000)).toBe('734 / 1,000');
  expect([670, 660, 330, 0].map((hp) => shelterVisualState(hp, 1000))).toEqual([
    'healthy',
    'damaged',
    'critical',
    'failed',
  ]);
  expect(dockButtons({ ...state, snacks: 40, nextSkillCost: 25 })
    .filter((button) => button.affordable)
    .map((button) => button.id)).toEqual(['tailSwipe', 'aquaBeam', 'safetyReport']);
  expect(joystickBottomOffset(0)).toBe(96);
  expect(joystickBottomOffset(20)).toBe(108);
  expect({ hit: JOYSTICK_HIT_SIZE, ringRadius: JOYSTICK_RING_RADIUS })
    .toEqual({ hit: 112, ringRadius: 46 });
});

it('inline monochrome SVG만 제공하고 learned 기술은 즉시 cooldown row가 된다', () => {
  for (const icon of ['bark', 'deokbae', 'tail', 'water', 'report'] as const) {
    const svg = skillIconSvg(icon);
    expect(svg).toContain('<svg viewBox="0 0 24 24"');
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).not.toMatch(/<img|https?:|data:image|emoji/i);
  }

  const learned = {
    ...state,
    learnedSkills: { ...state.learnedSkills, tailSwipe: true },
    skillStates: {
      ...state.skillStates,
      tailSwipe: skillState(true, 7_200, 0.1),
    },
  };
  expect(autoRows(learned).map(({ id, label }) => [id, label])).toEqual([
    ['bark', '짖기 · 자동'],
    ['deokbae', '덕배 공격 · 자동'],
    ['tailSwipe', '꼬리치기 · 8초'],
  ]);
  expect(autoRows(learned).map(compactAutoRowLabel)).toEqual([
    '짖기·자동',
    '덕배·자동',
    '꼬리·8초',
  ]);
  expect(compactAutoRowLabel({
    id: 'safetyReport',
    label: '안전신문고 · 22초',
    progress: 0,
    ready: false,
  })).toBe('신고·22초');
});

it('native click 활성화는 queued 동안 정확히 한 번이고 표시 상태를 낙관 변경하지 않는다', () => {
  const fake = createFakeDom();
  const requested: PurchasableSkillId[] = [];
  const dock = new SkillDock(
    fake.root as never,
    fake.document as never,
    (skillId) => {
      requested.push(skillId);
      return {
        status: 'queued' as const,
        skillId,
        cost: 15 as const,
        spent: 0,
        snacks: 0,
        nextCost: 15 as const,
      };
    },
  );
  dock.render({ ...state, snacks: 15 });

  const tail = fake.buttons.at(0)!;
  tail.click();
  tail.click();

  expect(requested).toEqual(['tailSwipe']);
  expect(dock.snapshot().find(({ id }) => id === 'tailSwipe')).toMatchObject({
    learned: false,
    queued: true,
    snacks: 15,
  });
  expect(state.learnedSkills.tailSwipe).toBe(false);
  expect(state.snacks).toBe(0);

  dock.destroy();
  dock.destroy();
  expect(fake.listenerAdds).toBe(3);
  expect(fake.listenerRemoves).toBe(3);
});

it('button native click은 Enter와 Space의 표준 경로이며 destroy가 click listener를 제거한다', () => {
  const fake = createFakeDom();
  const requested: PurchasableSkillId[] = [];
  const dock = new SkillDock(fake.root as never, fake.document as never, (skillId) => {
    requested.push(skillId);
    return {
      status: 'queueBusy', skillId, cost: 15, spent: 0, snacks: 15, nextCost: 15,
    };
  });
  const tail = fake.buttons[0]!;
  dock.render({ ...state, snacks: 15 });

  tail.click();
  expect(requested).toEqual(['tailSwipe']);
  expect(fake.listenerAddTypes).toEqual(['click', 'click', 'click']);

  dock.destroy();
  expect(fake.listenerRemoveTypes).toEqual(['click', 'click', 'click']);
  tail.click();
  expect(requested).toEqual(['tailSwipe']);
});

it('음소거 button은 pointerup/keydown 중복 없이 native click 하나로 마우스·Enter·Space를 처리한다', () => {
  const fake = createFakeDom();
  let toggles = 0;
  const top = new TopHud(fake.root as never, fake.document as never, {
    muted: () => false,
    toggle: () => { toggles += 1; },
    subscribe: () => () => undefined,
  });
  const mute = fake.buttons[0]!;

  mute.click();
  mute.click();
  mute.click();
  mute.dispatch('pointerup');

  expect(toggles).toBe(3);
  expect(fake.listenerAddTypes).toEqual(['click']);
  top.destroy();
  expect(fake.listenerRemoveTypes).toEqual(['click']);
});

it('dock button은 stable skill id와 비용 및 상태를 포함한 accessible name을 제공한다', () => {
  const fake = createFakeDom();
  const dock = new SkillDock(fake.root as never, fake.document as never, (skillId) => ({
    status: 'queued', skillId, cost: 15, spent: 0, snacks: 15, nextCost: 15,
  }));

  dock.render(state);
  expect(fake.buttons.map(({ dataset }) => dataset.skill)).toEqual([
    'tailSwipe',
    'aquaBeam',
    'safetyReport',
  ]);
  expect(fake.buttons[0]!.getAttribute('aria-label')).toMatch(/꼬리치기.*15.*잠김/);

  dock.render({ ...state, snacks: 15 });
  expect(fake.buttons[0]!.getAttribute('aria-label')).toMatch(/꼬리치기.*15.*배울 수 있음/);
  fake.buttons[0]!.click();
  expect(fake.buttons[0]!.getAttribute('aria-label')).toMatch(/꼬리치기.*처리 중/);

  dock.render({
    ...state,
    learnedSkills: { ...state.learnedSkills, tailSwipe: true },
  });
  expect(fake.buttons[0]!.getAttribute('aria-label')).toMatch(/꼬리치기.*배움.*자동 시전/);
  dock.destroy();
});

it('자동 기술 HUD는 이름 있는 list와 stable listitem으로 읽힌다', () => {
  const fake = createFakeDom();
  const hud = new AutoSkillHud(fake.root as never, fake.document as never);
  const list = fake.root.children[0]!;

  hud.render(state);

  expect(list.getAttribute('role')).toBe('list');
  expect(list.getAttribute('aria-label')).toBe('자동 기술 상태');
  expect(list.children).toHaveLength(5);
  expect(list.children.every((row) => row.getAttribute('role') === 'listitem')).toBe(true);
  expect(list.children[0]!.getAttribute('aria-label')).toBe('짖기 · 자동');
  expect(list.children[1]!.getAttribute('aria-label')).toBe('덕배 공격 · 자동');

  hud.destroy();
});

it('간식 기술 도크는 이름 있는 group이며 보유 간식 수를 중복 live 발표 없이 제공한다', () => {
  const fake = createFakeDom();
  const dock = new SkillDock(fake.root as never, fake.document as never, (skillId) => ({
    status: 'queued', skillId, cost: 15, spent: 0, snacks: 15, nextCost: 15,
  }));
  const group = fake.root.children[0]!;
  const snack = group.children[0]!;

  expect(group.getAttribute('role')).toBe('group');
  expect(group.getAttribute('aria-label')).toBe('간식 기술 습득');
  expect(snack.getAttribute('role')).toBeNull();
  expect(snack.getAttribute('aria-label')).toBe('보유 간식 0개');

  dock.render({ ...state, snacks: 15 });
  expect(snack.textContent).toBe('간식\n15');
  expect(snack.getAttribute('aria-label')).toBe('보유 간식 15개');

  dock.destroy();
});

it('dock reset은 unresolved queue와 cache를 비워 새 run에서 같은 기술을 다시 구매한다', () => {
  const fake = createFakeDom();
  const requested: PurchasableSkillId[] = [];
  const dock = new SkillDock(fake.root as never, fake.document as never, (skillId) => {
    requested.push(skillId);
    return {
      status: 'queued', skillId, cost: 15, spent: 0, snacks: 15, nextCost: 15,
    };
  });
  const affordable = { ...state, snacks: 15 };
  dock.render(affordable);
  fake.buttons[0]!.click();

  dock.reset();
  expect(dock.snapshot()).toEqual([]);
  expect(fake.buttons[0]!.getAttribute('aria-label')).toBe('꼬리치기, 비용 미정, 잠김');
  dock.render(affordable);
  fake.buttons[0]!.click();

  expect(requested).toEqual(['tailSwipe', 'tailSwipe']);
  dock.destroy();
});

it('동일한 HUD 표시 상태는 다음 frame에서 DOM property와 attribute를 다시 쓰지 않는다', () => {
  const fake = createFakeDom();
  const hud = new HudSystem({
    root: fake.root as never,
    document: fake.document as never,
    queueSkillPurchase: (skillId) => ({
      status: 'queued', skillId, cost: 15, spent: 0, snacks: 15, nextCost: 15,
    }),
  });
  const first = runSnapshot({ snacks: 15, simulationMs: 100 });
  hud.render(first);
  const writesAfterFirstFrame = fake.domWrites;

  hud.render(runSnapshot({ snacks: 15, simulationMs: 999 }));

  expect(fake.domWrites).toBe(writesAfterFirstFrame);
  hud.destroy();
});

it('dock render는 stable child node를 재사용하고 constructor 이후 innerHTML을 쓰지 않는다', () => {
  const fake = createFakeDom();
  const dock = new SkillDock(fake.root as never, fake.document as never, (skillId) => ({
    status: 'queued', skillId, cost: 15, spent: 0, snacks: 15, nextCost: 15,
  }));
  const buttonChildren = fake.buttons.map((button) => [...button.children]);
  const constructorWrites = fake.innerHtmlWrites;

  dock.render({ ...state, snacks: 15 });
  dock.render({ ...state, snacks: 40, nextSkillCost: 25 });

  expect(buttonChildren.every((children) => children.length === 3)).toBe(true);
  fake.buttons.forEach((button, buttonIndex) => {
    button.children.forEach((child, childIndex) => {
      expect(child).toBe(buttonChildren[buttonIndex]![childIndex]);
    });
  });
  expect(fake.innerHtmlWrites).toBe(constructorWrites);
  dock.destroy();
});

it('overlay는 root 직계 자식 하나로 mount되고 toast와 listener를 simulation lifecycle로 한 번만 정리한다', () => {
  const fake = createFakeDom();
  let muteListener: ((muted: boolean) => void) | undefined;
  let muteToggles = 0;
  let muteSubscriptions = 0;
  let muteUnsubscriptions = 0;
  const hud = new HudSystem({
    root: fake.root as never,
    document: fake.document as never,
    mutePort: {
      muted: () => false,
      toggle: () => { muteToggles += 1; },
      subscribe: (listener) => {
        muteSubscriptions += 1;
        muteListener = listener;
        return () => { muteUnsubscriptions += 1; };
      },
    },
    queueSkillPurchase: (skillId) => ({
      status: 'queued', skillId, cost: 15, spent: 0, snacks: 15, nextCost: 15,
    }),
  });
  const run = runSnapshot({ snacks: 15 });

  const writesBeforeRender = fake.innerHtmlWrites;
  hud.render(run);
  const overlay = fake.root.children[0]!;
  const autoRowsBefore = [...overlay.children[1]!.children];
  const allNodesBefore = flatten(overlay);
  const listenerAddsBeforeTransition = fake.listenerAdds;
  expect(fake.innerHtmlWrites).toBe(writesBeforeRender);
  expect(fake.root.children).toHaveLength(1);
  expect(overlay.className).toBe('hud-overlay');
  fake.buttons[0]!.click();
  expect(muteToggles).toBe(1);
  muteListener?.(true);
  expect(hud.snapshot()).toMatchObject({
    wave: 1,
    timeText: '00:00',
    snacks: 15,
    shelter: { current: 1000, maximum: 1000, visual: 'healthy' },
    muted: true,
    toast: '배울 수 있어요',
  });
  hud.step(1199);
  expect(hud.snapshot().toast).toBe('배울 수 있어요');
  hud.step(1);
  expect(hud.snapshot().toast).toBeNull();

  const learned = runSnapshot({
    snacks: 0,
    nextSkillCost: 25,
    learnedSkills: { ...state.learnedSkills, tailSwipe: true },
    skillStates: { ...state.skillStates, tailSwipe: skillState(true, 8000, 0) },
  });
  hud.showLearned('tailSwipe', learned);
  expect(hud.snapshot().toast).toBe('꼬리치기 습득!');
  expect(hud.snapshot().autoSkills.map(({ id }) => id)).toContain('tailSwipe');
  overlay.children[1]!.children.forEach((row, index) => {
    expect(row).toBe(autoRowsBefore[index]);
  });
  expect(fake.innerHtmlWrites).toBe(writesBeforeRender);

  hud.setActive(false);
  expect(overlay.dataset.active).toBe('false');
  expect(hud.joystick.read()).toEqual({ x: 0, y: 0, magnitude: 0 });
  hud.setActive(true);
  hud.reset();
  hud.render(run);
  flatten(overlay).forEach((node, index) => {
    expect(node).toBe(allNodesBefore[index]);
  });
  expect(fake.listenerAdds).toBe(listenerAddsBeforeTransition);

  hud.destroy();
  hud.destroy();
  expect(fake.listenerAdds).toBe(9);
  expect(fake.listenerRemoves).toBe(9);
  expect(muteSubscriptions).toBe(1);
  expect(muteUnsubscriptions).toBe(1);
});

it('joystick은 disable, lost capture, destroy에서 capture를 id 제거 전에 해제한다', () => {
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

  hit.dispatch('pointerdown', pointer(3, 102, 56));
  joystick.destroy();
  joystick.destroy();
  expect(fake.captureReleases).toEqual([1, 3]);
  expect(fake.listenerAddTypes).toEqual([
    'pointerdown',
    'pointermove',
    'pointerup',
    'pointercancel',
    'lostpointercapture',
  ]);
  expect(fake.listenerAdds).toBe(5);
  expect(fake.listenerRemoves).toBe(5);
});

it('joystick은 포커스 가능한 custom control로 터치와 기존 keyboard 이동법을 안내한다', () => {
  const fake = createFakeDom();
  const joystick = new VirtualJoystick(fake.root as never, fake.document as never);
  const hit = fake.root.children[0]!;

  expect(hit.getAttribute('role')).toBe('application');
  expect(hit.getAttribute('tabindex')).toBe('0');
  expect(hit.getAttribute('aria-label')).toBe('이동 조이스틱');
  expect(hit.getAttribute('aria-description')).toMatch(/터치.*WASD.*방향키/);
  expect(hit.getAttribute('aria-keyshortcuts')).toBe('W A S D ArrowUp ArrowDown ArrowLeft ArrowRight');
  expect(hit.getAttribute('aria-disabled')).toBe('false');

  joystick.setEnabled(false);
  expect(hit.getAttribute('aria-disabled')).toBe('true');
  joystick.setEnabled(true);
  expect(hit.getAttribute('aria-disabled')).toBe('false');

  joystick.destroy();
});

it('하단 skill SVG는 22px이고 56px button touch target은 줄지 않는다', () => {
  const styles = source('../../src/styles.css');

  expect(styles).toContain('.skill-dock button { min-width: 88px; min-height: 56px;');
  expect(styles).toContain('.skill-dock__icon { grid-row: 1 / 3; width: 24px; height: 24px; }');
  expect(styles).toContain('.skill-dock__icon svg { width: 22px; height: 22px; }');
});

it('production scene은 legacy modal/HUD나 Phaser joystick을 import하지 않고 CSS geometry가 model과 일치한다', () => {
  const scene = source('../../src/game/scenes/GameScene.ts');
  const boot = source('../../src/game/scenes/BootScene.ts');
  const hudSystem = source('../../src/game/ui/HudSystem.ts');
  const joystick = source('../../src/game/player/VirtualJoystick.ts');
  const shelter = source('../../src/game/shelter/ShelterView.ts');
  const assetKeys = source('../../src/game/assets/AssetKeys.ts');
  const combatAtlas = source('../../src/game/assets/CombatShapeAtlas.ts');
  const combatEffects = source('../../src/game/combat/CombatEffectPool.ts');
  const styles = source('../../src/styles.css');
  const hudOverlayRule = cssRule(styles, '.hud-overlay');

  expect(`${scene}\n${boot}`).not.toMatch(/SkillSelectionModal|SkillHud|SkillIconTextures/);
  expect(scene).not.toMatch(/scene\.add\.dom|this\.add\.dom/);
  expect(scene.match(/new HudSystem/g)).toHaveLength(1);
  expect(scene.match(/this\.hud\.destroy\(\)/g)).toHaveLength(1);
  expect(scene).not.toContain('this.virtualJoystick.destroy()');
  expect(scene).toContain('this.hud.setActive(false)');
  expect(scene).toContain('this.hud.setActive(true)');
  expect(hudSystem.match(/options\.root\.appendChild\(this\.overlay\)/g)).toHaveLength(1);
  expect(joystick).not.toMatch(/scene\.add\.circle|canvas\.addEventListener/);
  expect(shelter).not.toContain('shelter-states-edit');
  expect(`${assetKeys}\n${combatEffects}`).not.toMatch(/skillSafetyReport|skill-icon-|generateTexture/);
  expect(combatEffects).not.toContain('.fillStyle(0xffffff, 1)');
  expect(combatEffects).not.toContain('.fillRect(-12, -15, 24, 30)');
  expect(combatEffects).toContain('this.setBobFrame(SAFETY_REPORT_FRAME)');
  expect(combatAtlas).toContain("export const SAFETY_REPORT_FRAME = 'safety-report'");
  expect(combatAtlas).toContain('const orange = 0xff6b35');
  expect(styles).toContain('#game-root { position: relative; width: 100vw; height: 100dvh;');
  expect(hudOverlayRule).toMatch(/(?:^|;)\s*--hud-safe-top:\s*env\(safe-area-inset-top,\s*0px\)\s*(?:;|$)/);
  expect(hudOverlayRule).toMatch(/(?:^|;)\s*position:\s*absolute\s*(?:;|$)/);
  expect(hudOverlayRule).toMatch(/(?:^|;)\s*inset:\s*0\s*(?:;|$)/);
  expect(styles).toContain('grid-template-columns: 44px repeat(3, minmax(88px, 1fr));');
  expect(styles).toContain('bottom: calc(max(12px, env(safe-area-inset-bottom)) + 68px + max(16px, env(safe-area-inset-bottom)));');
  expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  expect(styles).toContain('animation: none !important;');
});

function skillState(learned: boolean, cooldownRemainingMs = 0, progress = 0) {
  return {
    learned,
    cooldownRemainingMs,
    ready: learned && cooldownRemainingMs === 0,
    progress,
    activeCastId: null,
  };
}

function runSnapshot(overrides: Partial<RunSnapshot> = {}): RunSnapshot {
  return { ...runSnapshotBase(), ...overrides };
}

function runSnapshotBase(): RunSnapshot {
  return {
    mode: 'playing' as const,
    simulationMs: 0,
    wave: 1 as const,
    shelterHp: 1000,
    shelterMaxHp: 1000 as const,
    snacks: state.snacks,
    nextSkillCost: state.nextSkillCost,
    learnedSkills: state.learnedSkills,
    skillStates: state.skillStates,
    companion: state.companion,
    enemies: [],
    projectiles: [],
    activeEnemyCount: 0,
    pendingSpawns: 0,
    activeProjectileCount: 0,
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
  readonly style: { transform: string };
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
  const listenerAddTypes: string[] = [];
  const listenerRemoveTypes: string[] = [];
  let innerHtmlWrites = 0;
  let domWrites = 0;
  const captureReleases: number[] = [];
  const make = (tag: string): FakeElement => {
    const listeners = new Map<string, (event?: never) => void>();
    const attributes = new Map<string, string>();
    const captures = new Set<number>();
    let html = '';
    let text = '';
    let disabled = false;
    const dataset = new Proxy({} as Record<string, string>, {
      set: (target, property, value: string) => {
        domWrites += 1;
        target[String(property)] = value;
        return true;
      },
    });
    const element: FakeElement = {
      className: '',
      get textContent() { return text; },
      set textContent(value: string) { text = value; domWrites += 1; },
      get innerHTML() { return html; },
      set innerHTML(value: string) { html = value; innerHtmlWrites += 1; domWrites += 1; },
      get disabled() { return disabled; },
      set disabled(value: boolean) { disabled = value; domWrites += 1; },
      style: { transform: '' },
      dataset,
      children: [],
      append: (...children) => element.children.push(...children),
      appendChild: (child) => {
        element.children.push(child);
        return child;
      },
      addEventListener: (type, listener) => {
        listenerAdds += 1;
        listenerAddTypes.push(type);
        listeners.set(type, listener);
      },
      click: () => {
        if (!element.disabled) listeners.get('click')?.();
      },
      removeEventListener: (type, listener) => {
        if (listeners.get(type) === listener) {
          listenerRemoves += 1;
          listenerRemoveTypes.push(type);
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
      setAttribute: (name, value) => {
        domWrites += 1;
        attributes.set(name, value);
      },
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
    listenerAddTypes,
    listenerRemoveTypes,
    get innerHtmlWrites() { return innerHtmlWrites; },
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
