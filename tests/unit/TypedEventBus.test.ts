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

it('runEnded와 resultReady를 서로 다른 discriminated event로 구독한다', () => {
  const bus = new TypedEventBus();
  const received: string[] = [];
  bus.on('runEnded', (event) => received.push(`ended:${event.outcome}`));
  bus.on('resultReady', (event) => received.push(`ready:${event.outcome}`));

  bus.emit({ type: 'runEnded', outcome: 'lost' });
  bus.emit({ type: 'resultReady', outcome: 'lost' });

  expect(received).toEqual(['ended:lost', 'ready:lost']);
});
