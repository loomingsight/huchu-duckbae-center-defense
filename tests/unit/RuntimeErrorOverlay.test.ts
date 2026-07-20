import { describe, expect, it, vi } from 'vitest';
import { RuntimeErrorOverlay } from '../../src/game/ui/RuntimeErrorOverlay';

describe('RuntimeErrorOverlay', () => {
  it('실제 action button만 정확히 한 번 처리하고 메시지와 빈 영역 click은 무시한다', () => {
    const actionButton = new EventTarget();
    const message = new EventTarget();
    const emptyArea = new EventTarget();
    const element = {
      node: {
        querySelector: vi.fn((selector: string) => selector === 'button' ? actionButton : null),
      },
      setDepth: vi.fn().mockReturnThis(),
      addListener: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
      destroy: vi.fn(),
    };
    const createFromHTML = vi.fn(() => element);
    const scene = {
      add: { dom: vi.fn(() => ({ createFromHTML })) },
    };
    const onSelect = vi.fn();
    const overlay = new RuntimeErrorOverlay(scene as never);

    overlay.show('문제', '상세', { label: '재시도', onSelect });
    message.dispatchEvent(new Event('click'));
    emptyArea.dispatchEvent(new Event('click'));
    expect(onSelect).not.toHaveBeenCalled();

    actionButton.dispatchEvent(new Event('click'));
    actionButton.dispatchEvent(new Event('click'));
    expect(onSelect).toHaveBeenCalledTimes(1);

    overlay.destroy();
    actionButton.dispatchEvent(new Event('click'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
