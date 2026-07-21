import { expect, it, vi } from 'vitest';
import { BgmSystem } from '../../src/game/audio/BgmSystem';
import type { BgmVoiceSink } from '../../src/game/audio/AudioTypes';
import { E2eAudioTestPort } from '../../src/game/debug/E2eAudioTestPort';

function sink(): BgmVoiceSink & { scheduled: number } {
  return {
    scheduled: 0,
    activeVoiceCount: 0,
    scheduleBaseStep() { this.scheduled += 1; },
    scheduleBossStep() { this.scheduled += 1; },
    cancelBossStep() {},
    stopAll() {},
  };
}

it('기본 realtime mode는 clock과 sink를 그대로 delegate한다', () => {
  let now = 3;
  const realSink = sink();
  const port = new E2eAudioTestPort({ clock: { nowSeconds: () => now }, sink: realSink });
  expect(port.snapshot()).toEqual({ mode: 'realtime' });
  expect(port.nowSeconds()).toBe(3);
  port.scheduleBaseStep(0, 3);
  expect(realSink.scheduled).toBe(1);
  port.advanceFromGameMs(1000);
  expect(port.nowSeconds()).toBe(3);
  now = 4;
  expect(port.nowSeconds()).toBe(4);
});

it('1.2 game seconds를 x64/25ms slice로 진행하면 76.8초 loop 한 바퀴다', () => {
  const tick = vi.fn();
  const port = new E2eAudioTestPort({ clock: { nowSeconds: () => 0 }, sink: sink() }, tick);
  const bgm = new BgmSystem(port, port, { automaticScheduler: false });
  bgm.beginRun();
  port.setAccelerated(true);
  port.advanceFromGameMs(1200);
  expect(bgm.snapshot().transportPhaseSteps).toBeCloseTo(0, 9);
  expect(tick).toHaveBeenCalledTimes(3072);
});

it('accelerated sink도 base score의 물리 source 수 4개와 boss 2개를 같은 단위로 계산한다', () => {
  const port = new E2eAudioTestPort({ clock: { nowSeconds: () => 0 }, sink: sink() });
  port.setAccelerated(true);

  port.scheduleBaseStep(0, 0);
  expect(port.activeVoiceCount).toBe(4);
  port.scheduleBossStep(0, 0);
  expect(port.activeVoiceCount).toBe(6);
});
