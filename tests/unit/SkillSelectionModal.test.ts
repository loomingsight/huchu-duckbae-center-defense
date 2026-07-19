import { SkillSelectionModal } from '../../src/game/ui/SkillSelectionModal';
import type { SkillCard } from '../../src/game/skills/SkillTypes';

const CARDS: readonly SkillCard[] = [
  { id: 'bark:2', skillId: 'bark', nextLevel: 2, kind: 'upgrade', title: '짖기 Lv.2' },
  { id: 'scold:1', skillId: 'scold', nextLevel: 1, kind: 'unlock', title: '호통치기 배우기' },
  { id: 'aquaBeam:1', skillId: 'aquaBeam', nextLevel: 1, kind: 'unlock', title: '아쿠아빔 배우기' },
];

describe('SkillSelectionModal', () => {
  it('정확한 제목과 44px 이상인 서로 다른 button 세 개를 만든다', () => {
    const fake = createModalFakeScene();

    new SkillSelectionModal(fake.scene as never, CARDS, () => undefined);

    expect(fake.dom).toHaveLength(4);
    expect(fake.dom.at(0)!.html).toContain('간식으로 스킬 배우기');
    const buttons = fake.dom.slice(1);
    expect(buttons.every(({ html }) => html.startsWith('<button'))).toBe(true);
    expect(buttons.every(({ html }) => html.includes('min-height:64px'))).toBe(true);
    expect(buttons.map(({ html }) => html)).toEqual(expect.arrayContaining([
      expect.stringContaining('짖기 Lv.2'),
      expect.stringContaining('호통치기 배우기'),
      expect.stringContaining('아쿠아빔 배우기'),
    ]));
  });

  it('handler 진입 즉시 accept를 잠가 double click에도 한 번만 선택한다', () => {
    const fake = createModalFakeScene();
    const selected: string[] = [];
    new SkillSelectionModal(fake.scene as never, CARDS, (cardId) => selected.push(cardId));
    const click = fake.dom.at(1)!.listeners.get('click')!;

    click();
    click();

    expect(selected).toEqual(['bark:2']);
    expect(fake.dom.every(({ destroyCount }) => destroyCount === 1)).toBe(true);
    expect(fake.graphics.destroyCount).toBe(1);
  });

  it('reset/shutdown cleanup은 listener와 DOM을 중복 destroy하지 않는다', () => {
    const fake = createModalFakeScene();
    const modal = new SkillSelectionModal(fake.scene as never, CARDS, () => undefined);

    modal.destroy();
    modal.destroy();

    expect(fake.dom.every(({ listeners, destroyCount }) => (
      listeners.size === 0 && destroyCount === 1
    ))).toBe(true);
    expect(fake.graphics.destroyCount).toBe(1);
  });
});

interface FakeObject {
  readonly object: object;
  html: string;
  readonly listeners: Map<string, () => void>;
  destroyCount: number;
}

function createModalFakeScene(): {
  readonly scene: object;
  readonly dom: FakeObject[];
  readonly graphics: FakeObject;
} {
  const dom: FakeObject[] = [];
  const graphics = createFakeObject();
  return {
    scene: {
      add: {
        graphics: () => graphics.object,
        dom: () => {
          const fake = createFakeObject();
          dom.push(fake);
          return fake.object;
        },
      },
    },
    dom,
    graphics,
  };
}

function createFakeObject(): FakeObject {
  const fake: FakeObject = {
    object: {},
    html: '',
    listeners: new Map(),
    destroyCount: 0,
  };
  const object = new Proxy({}, {
    get: (_target, property) => (...args: unknown[]) => {
      const name = String(property);
      if (name === 'createFromHTML') fake.html = String(args.at(0));
      if (name === 'on') fake.listeners.set(String(args.at(0)), args.at(1) as () => void);
      if (name === 'removeAllListeners') fake.listeners.clear();
      if (name === 'destroy') fake.destroyCount += 1;
      return object;
    },
  });
  Object.defineProperty(fake, 'object', { value: object });
  return fake;
}
