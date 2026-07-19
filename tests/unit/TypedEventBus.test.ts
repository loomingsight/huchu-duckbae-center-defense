import { expect, it } from 'vitest';
import { TypedEventBus } from '../../src/game/core/TypedEventBus';

it('타입별 이벤트를 전달하고 구독 해제한다', () => {
  const bus = new TypedEventBus();
  const received: string[] = [];
  const unsubscribe = bus.on('modeChanged', (event) => received.push(event.mode));

  bus.emit({ type: 'modeChanged', mode: 'countdown' });
  unsubscribe();
  bus.emit({ type: 'modeChanged', mode: 'playing' });

  expect(received).toEqual(['countdown']);
});

it('오래된 unsubscribe를 반복 호출해도 새 구독을 삭제하지 않는다', () => {
  const bus = new TypedEventBus();
  const oldUnsubscribe = bus.on('runEnded', () => undefined);

  oldUnsubscribe();
  const received: string[] = [];
  bus.on('runEnded', (event) => received.push(event.outcome));
  oldUnsubscribe();

  bus.emit({ type: 'runEnded', outcome: 'won' });

  expect(received).toEqual(['won']);
});
