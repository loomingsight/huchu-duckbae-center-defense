import { actionButtons, ActionDock } from '../../src/game/ui/ActionDock';
import type { RunSnapshot } from '../../src/game/session/RunSnapshot';

it('행동 버튼은 시전, 구매, 쿨타임, 잠김 상태를 한 모델로 표현한다', () => {
  const models = actionButtons(runSnapshot());

  expect(models.map(({ id, mode, disabled, remainingSeconds }) => ({
    id, mode, disabled, remainingSeconds,
  }))).toEqual([
    { id: 'bark', mode: 'cast', disabled: false, remainingSeconds: 0 },
    { id: 'tailSwipe', mode: 'buy', disabled: false, remainingSeconds: 0 },
    { id: 'aquaBeam', mode: 'cooldown', disabled: true, remainingSeconds: 3 },
    { id: 'safetyReport', mode: 'locked', disabled: true, remainingSeconds: 0 },
  ]);
  expect(models.find(({ id }) => id === 'aquaBeam')).toMatchObject({
    cooldownAngleDeg: 86.4,
    accessibleName: '아쿠아빔, 쿨타임 3초',
  });
});

it('구매 탭은 구매만 큐에 넣고, 학습 뒤 다음 탭부터 시전한다', () => {
  const fake = createFakeDom();
  const purchases: string[] = [];
  const actions: string[] = [];
  const dock = new ActionDock(
    fake.root as never,
    fake.document as never,
    (skillId) => {
      purchases.push(skillId);
      return {
        status: 'queued' as const,
        skillId,
        cost: 15 as const,
        spent: 0,
        snacks: 30,
        nextCost: 15 as const,
      };
    },
    (actionId) => {
      actions.push(actionId);
      return { status: 'queued' as const, actionId };
    },
  );

  dock.render(runSnapshot());
  fake.buttons[1]!.click();
  fake.buttons[1]!.click();

  expect(purchases).toEqual(['tailSwipe']);
  expect(actions).toEqual([]);
  expect(fake.buttons[1]!.dataset.mode).toBe('queued');

  dock.resolve('tailSwipe');
  dock.render(runSnapshot({
    learnedSkills: { tailSwipe: true, aquaBeam: true, safetyReport: false },
    actionStates: {
      ...runSnapshot().actionStates,
      tailSwipe: skillState(true, 0, 1),
    },
  }));
  fake.buttons[1]!.click();

  expect(actions).toEqual(['tailSwipe']);
  dock.destroy();
});

it('쿨타임 버튼은 원형 진행각과 남은 초를 표시하고 비활성화한다', () => {
  const fake = createFakeDom();
  const dock = new ActionDock(
    fake.root as never,
    fake.document as never,
    (skillId) => ({
      status: 'queueBusy' as const,
      skillId,
      cost: 15,
      spent: 0,
      snacks: 30,
      nextCost: 15,
    }),
    (actionId) => ({ status: 'queued' as const, actionId }),
  );

  dock.render(runSnapshot());
  const aqua = fake.buttons[2]!;

  expect(aqua.disabled).toBe(true);
  expect(aqua.style.getPropertyValue('--cooldown-angle')).toBe('86.4deg');
  expect(aqua.children[3]?.textContent).toBe('3');
  expect(aqua.getAttribute('aria-label')).toBe('아쿠아빔, 쿨타임 3초');
  dock.destroy();
});

function runSnapshot(overrides: Partial<RunSnapshot> = {}): RunSnapshot {
  const actionStates = {
    bark: {
      learned: true as const,
      ready: true,
      cooldownRemainingMs: 0,
      progress: 1,
      activeCastId: null,
      phase: 'ready' as const,
      elapsedMs: 0,
      lockedTargetId: null,
    },
    tailSwipe: skillState(false),
    aquaBeam: skillState(true, 2_400, 0.76),
    safetyReport: skillState(false),
  };
  return {
    mode: 'playing',
    simulationMs: 0,
    wave: 1,
    playerHp: 1000,
    playerMaxHp: 1000,
    snacks: 19,
    nextSkillCost: 15,
    learnedSkills: { tailSwipe: false, aquaBeam: true, safetyReport: false },
    skillStates: {
      tailSwipe: actionStates.tailSwipe,
      aquaBeam: actionStates.aquaBeam,
      safetyReport: actionStates.safetyReport,
    },
    actionStates,
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

interface FakeElement {
  className: string;
  textContent: string;
  innerHTML: string;
  disabled: boolean;
  readonly dataset: Record<string, string>;
  readonly children: FakeElement[];
  readonly style: {
    setProperty(name: string, value: string): void;
    getPropertyValue(name: string): string;
  };
  append(...children: FakeElement[]): void;
  appendChild(child: FakeElement): FakeElement;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  click(): void;
  remove(): void;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
}

function createFakeDom() {
  const buttons: FakeElement[] = [];
  const make = (tag: string): FakeElement => {
    const attributes = new Map<string, string>();
    const listeners = new Map<string, () => void>();
    const styles = new Map<string, string>();
    const element: FakeElement = {
      className: '',
      textContent: '',
      innerHTML: '',
      disabled: false,
      dataset: {},
      children: [],
      style: {
        setProperty: (name, value) => styles.set(name, value),
        getPropertyValue: (name) => styles.get(name) ?? '',
      },
      append: (...children) => element.children.push(...children),
      appendChild: (child) => { element.children.push(child); return child; },
      addEventListener: (type, listener) => listeners.set(type, listener),
      removeEventListener: (type, listener) => {
        if (listeners.get(type) === listener) listeners.delete(type);
      },
      click: () => { if (!element.disabled) listeners.get('click')?.(); },
      remove: () => undefined,
      setAttribute: (name, value) => attributes.set(name, value),
      getAttribute: (name) => attributes.get(name) ?? null,
    };
    if (tag === 'button') buttons.push(element);
    return element;
  };
  return { document: { createElement: make }, root: make('div'), buttons };
}
