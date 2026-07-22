import { MobileInputGuard } from '../../src/game/ui/MobileInputGuard';

it('핀치와 iOS gesture 기본 동작을 막고 lifecycle 중단 시 입력을 한 번 정리한다', () => {
  const root = new FakeTarget();
  const documentRef = new FakeTarget() as FakeTarget & { hidden: boolean; defaultView: FakeTarget };
  documentRef.hidden = false;
  documentRef.defaultView = new FakeTarget();
  let clears = 0;
  const guard = new MobileInputGuard(
    root as never,
    documentRef as never,
    () => { clears += 1; },
  );

  const oneTouch = touchEvent(1);
  const twoTouches = touchEvent(2);
  root.dispatch('touchmove', oneTouch);
  root.dispatch('touchmove', twoTouches);
  root.dispatch('gesturestart', twoTouches);

  expect(oneTouch.prevented).toBe(false);
  expect(twoTouches.prevented).toBe(true);

  documentRef.hidden = true;
  documentRef.dispatch('visibilitychange', touchEvent(0));
  documentRef.defaultView.dispatch('blur', touchEvent(0));
  documentRef.defaultView.dispatch('pagehide', touchEvent(0));
  expect(clears).toBe(3);

  guard.destroy();
  expect(root.listenerCount()).toBe(0);
  expect(documentRef.listenerCount()).toBe(0);
  expect(documentRef.defaultView.listenerCount()).toBe(0);
});

class FakeTarget {
  hidden = false;
  defaultView: FakeTarget | null = null;
  private readonly listeners = new Map<string, Set<(event: TestEvent) => void>>();

  addEventListener(type: string, listener: (event: TestEvent) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: TestEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: TestEvent): void {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }

  listenerCount(): number {
    return Array.from(this.listeners.values()).reduce((count, listeners) => count + listeners.size, 0);
  }
}

interface TestEvent {
  readonly touches: readonly unknown[];
  prevented: boolean;
  preventDefault(): void;
}

function touchEvent(touchCount: number): TestEvent {
  const event: TestEvent = {
    touches: Array.from({ length: touchCount }),
    prevented: false,
    preventDefault: () => { event.prevented = true; },
  };
  return event;
}
