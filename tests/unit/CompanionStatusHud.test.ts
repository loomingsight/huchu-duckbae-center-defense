import {
  companionStatus,
  CompanionStatusHud,
} from '../../src/game/ui/CompanionStatusHud';

it('덕배 상태는 쿨타임과 관계없이 자동 컴패니언 한 줄로 유지된다', () => {
  expect(companionStatus({
    companion: 'deokbae', active: true, cooldownRemainingMs: 500,
  })).toEqual({ label: '덕배 · 자동', ready: false });
  expect(companionStatus({
    companion: 'deokbae', active: true, cooldownRemainingMs: 0,
  })).toEqual({ label: '덕배 · 자동', ready: true });
});

it('컴패니언 HUD는 안정적인 한 행만 만들고 ready 상태만 갱신한다', () => {
  const rows: FakeElement[] = [];
  const root = fakeElement();
  const documentRef = {
    createElement: () => {
      const element = fakeElement();
      rows.push(element);
      return element;
    },
  };
  const hud = new CompanionStatusHud(root as never, documentRef as never);

  hud.render({ companion: 'deokbae', active: true, cooldownRemainingMs: 500 });
  expect(root.children).toHaveLength(1);
  expect(root.children[0]!.children).toHaveLength(2);
  expect(root.children[0]!.getAttribute('aria-label')).toBe('덕배 · 자동');
  expect(root.children[0]!.dataset.ready).toBe('false');

  hud.render({ companion: 'deokbae', active: true, cooldownRemainingMs: 0 });
  expect(root.children[0]!.dataset.ready).toBe('true');
  expect(hud.snapshot()).toEqual({ label: '덕배 · 자동', ready: true });
  hud.destroy();
});

interface FakeElement {
  className: string;
  textContent: string;
  innerHTML: string;
  readonly dataset: Record<string, string>;
  readonly children: FakeElement[];
  append(...children: FakeElement[]): void;
  appendChild(child: FakeElement): FakeElement;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  remove(): void;
}

function fakeElement(): FakeElement {
  const attributes = new Map<string, string>();
  const element: FakeElement = {
    className: '',
    textContent: '',
    innerHTML: '',
    dataset: {},
    children: [],
    append: (...children) => element.children.push(...children),
    appendChild: (child) => { element.children.push(child); return child; },
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: (name) => attributes.get(name) ?? null,
    remove: () => undefined,
  };
  return element;
}
