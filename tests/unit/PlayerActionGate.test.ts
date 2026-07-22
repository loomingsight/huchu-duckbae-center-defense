import { expect, it } from 'vitest';
import { PlayerActionGate } from '../../src/game/player/PlayerActionGate';

it('한 슬롯 큐와 성공 시전 뒤 200ms 전역 잠금을 지킨다', () => {
  const gate = new PlayerActionGate();
  expect(gate.queue('bark')).toEqual({ status: 'queued', actionId: 'bark' });
  expect(gate.queue('aquaBeam')).toEqual({ status: 'queueBusy', actionId: 'aquaBeam' });
  expect(gate.consume(0)).toBe('bark');
  gate.accept(0);
  expect(gate.queue('tailSwipe')).toEqual({ status: 'queued', actionId: 'tailSwipe' });
  expect(gate.consume(199)).toBeNull();
  expect(gate.consume(200)).toBe('tailSwipe');
});

it('reset은 대기 행동과 잠금을 모두 지운다', () => {
  const gate = new PlayerActionGate();
  gate.queue('bark');
  expect(gate.consume(0)).toBe('bark');
  gate.accept(0);
  gate.queue('aquaBeam');

  gate.reset();

  expect(gate.queue('safetyReport')).toEqual({
    status: 'queued', actionId: 'safetyReport',
  });
  expect(gate.consume(0)).toBe('safetyReport');
});
