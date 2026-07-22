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

it('pointerdown은 한 포인터당 정확히 한 번 활성화하고 합성 click은 중복 실행하지 않는다', () => {
  const fake = createFakeDom();
  const actions: string[] = [];
  const dock = new ActionDock(
    fake.root as never,
    fake.document as never,
    (skillId) => ({
      status: 'queueBusy', skillId, cost: 15, spent: 0, snacks: 30, nextCost: 15,
    }),
    (actionId) => {
      actions.push(actionId);
      return { status: 'queued', actionId };
    },
  );
  dock.render(runSnapshot());
  const bark = fake.buttons[0]!;

  bark.dispatch('pointerdown', pointer(22));
  bark.dispatch('pointerdown', pointer(22));
  bark.dispatch('pointerup', pointer(22));
  bark.dispatch('click', click(1));

  expect(actions).toEqual(['bark']);
  expect(fake.captureReleases).toEqual([22]);

  bark.dispatch('click', click(0));
  expect(actions).toEqual(['bark', 'bark']);
  dock.destroy();
});

it('pointercancel과 lostpointercapture는 해당 기술 포인터만 안전하게 정리한다', () => {
  const fake = createFakeDom();
  const actions: string[] = [];
  const dock = new ActionDock(
    fake.root as never,
    fake.document as never,
    (skillId) => ({
      status: 'queueBusy', skillId, cost: 15, spent: 0, snacks: 30, nextCost: 15,
    }),
    (actionId) => {
      actions.push(actionId);
      return { status: 'queued', actionId };
    },
  );
  dock.render(runSnapshot());
  const bark = fake.buttons[0]!;

  bark.dispatch('pointerdown', pointer(31));
  bark.dispatch('pointercancel', pointer(31));
  bark.dispatch('pointerdown', pointer(32));
  bark.losePointerCapture(32);
  bark.dispatch('pointerdown', pointer(33));

  expect(actions).toEqual(['bark', 'bark', 'bark']);
  dock.clearInput();
  expect(fake.captureReleases).toContain(33);
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
  addEventListener(type: string, listener: (event: FakeEvent) => void): void;
  removeEventListener(type: string, listener: (event: FakeEvent) => void): void;
  dispatch(type: string, event: FakeEvent): void;
  losePointerCapture(pointerId: number): void;
  click(): void;
  remove(): void;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
}

function createFakeDom() {
  const buttons: FakeElement[] = [];
  const captureReleases: number[] = [];
  const make = (tag: string): FakeElement => {
    const attributes = new Map<string, string>();
    const listeners = new Map<string, (event: FakeEvent) => void>();
    const styles = new Map<string, string>();
    const captures = new Set<number>();
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
      dispatch: (type, event) => {
        if (!element.disabled || type !== 'click') listeners.get(type)?.(event);
      },
      losePointerCapture: (pointerId) => {
        captures.delete(pointerId);
        listeners.get('lostpointercapture')?.(pointer(pointerId));
      },
      click: () => {
        if (!element.disabled) listeners.get('click')?.(click(0));
      },
      remove: () => undefined,
      setAttribute: (name, value) => attributes.set(name, value),
      getAttribute: (name) => attributes.get(name) ?? null,
    };
    Object.assign(element, {
      setPointerCapture: (pointerId: number) => captures.add(pointerId),
      hasPointerCapture: (pointerId: number) => captures.has(pointerId),
      releasePointerCapture: (pointerId: number) => {
        if (captures.delete(pointerId)) captureReleases.push(pointerId);
      },
    });
    if (tag === 'button') buttons.push(element);
    return element;
  };
  return { document: { createElement: make }, root: make('div'), buttons, captureReleases };
}

interface FakeEvent {
  readonly pointerId?: number;
  readonly detail?: number;
  preventDefault(): void;
  stopPropagation(): void;
}

function pointer(pointerId: number): FakeEvent {
  return { pointerId, preventDefault: () => undefined, stopPropagation: () => undefined };
}

function click(detail: number): FakeEvent {
  return { detail, preventDefault: () => undefined, stopPropagation: () => undefined };
}
