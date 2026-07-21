import { describe, expect, it, vi } from 'vitest';
import {
  BGM_VOICE_CAP,
  BgmSystem,
  LOOKAHEAD_SECONDS,
  SCHEDULER_MS,
  STEP_SECONDS,
  TRANSPORT_STEPS,
  WebAudioBgmVoiceSink,
} from '../../src/game/audio/BgmSystem';
import { BGM_BAR_ROOTS, baseScoreAtStep } from '../../src/game/audio/AudioRegistry';
import type { AudioTransportClock, BgmVoiceSink } from '../../src/game/audio/AudioTypes';

class FakeClock implements AudioTransportClock {
  currentTime = 0;

  nowSeconds(): number {
    return this.currentTime;
  }
}

class RecordingSink implements BgmVoiceSink {
  readonly base: Array<{ readonly step: number; readonly when: number }> = [];
  readonly boss: Array<{ readonly step: number; readonly when: number }> = [];
  readonly cancelledBoss: Array<{ readonly step: number; readonly when: number }> = [];
  stopAllCalls = 0;
  private voicesAt = Number.NaN;
  private voices = 0;

  get activeVoiceCount(): number {
    return this.voices;
  }

  scheduleBaseStep(step: number, when: number): void {
    this.base.push({ step, when });
    const events = baseScoreAtStep(step);
    if (events.length === 0) return;
    this.useTimestamp(when);
    this.voices = Math.min(6, this.voices + events.length);
  }

  scheduleBossStep(step: number, when: number): void {
    this.useTimestamp(when);
    this.boss.push({ step, when });
    this.voices = Math.min(6, this.voices + 2);
  }

  cancelBossStep(step: number, when: number): void {
    this.cancelledBoss.push({ step, when });
    this.boss.splice(0, this.boss.length, ...this.boss.filter((note) => (
      note.step !== step || Math.abs(note.when - when) > 1e-9
    )));
  }

  stopAll(): void {
    this.stopAllCalls += 1;
    this.voices = 0;
  }

  private useTimestamp(when: number): void {
    if (Math.abs(this.voicesAt - when) <= 1e-9) return;
    this.voicesAt = when;
    this.voices = 0;
  }
}

class FakeBgmAudioParam {
  value = 0;

  setValueAtTime(value: number): this {
    this.value = value;
    return this;
  }

  exponentialRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
}

class FakeBgmAudioNode {
  disconnectCalls = 0;

  connect(destination: FakeBgmAudioNode): FakeBgmAudioNode {
    return destination;
  }

  disconnect(): void {
    this.disconnectCalls += 1;
  }
}

class FakeBgmScheduledSource extends FakeBgmAudioNode {
  onended: (() => void) | null = null;
  readonly stops: number[] = [];
  throwOnStart = false;

  start(): void {
    if (this.throwOnStart) throw new Error('start blocked');
  }

  stop(at = 0): void {
    this.stops.push(at);
  }
}

class FakeBgmOscillator extends FakeBgmScheduledSource {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeBgmAudioParam();
}

class FakeBgmBufferSource extends FakeBgmScheduledSource {
  buffer: AudioBuffer | null = null;
}

class FakeBgmGain extends FakeBgmAudioNode {
  readonly gain = new FakeBgmAudioParam();
}

class FakeBgmFilter extends FakeBgmAudioNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeBgmAudioParam();
}

class FakeBgmBuffer {
  private readonly channel: Float32Array;

  constructor(length: number) {
    this.channel = new Float32Array(length);
  }

  getChannelData(): Float32Array {
    return this.channel;
  }
}

class FakeBgmAudioContext {
  readonly sampleRate = 1_000;
  readonly destination = new FakeBgmAudioNode();
  readonly oscillators: FakeBgmOscillator[] = [];
  readonly bufferSources: FakeBgmBufferSource[] = [];
  currentTime = 0;
  throwOnStart = false;

  createOscillator(): OscillatorNode {
    const source = new FakeBgmOscillator();
    source.throwOnStart = this.throwOnStart;
    this.oscillators.push(source);
    return source as unknown as OscillatorNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeBgmBufferSource();
    source.throwOnStart = this.throwOnStart;
    this.bufferSources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  createGain(): GainNode {
    return new FakeBgmGain() as unknown as GainNode;
  }

  createBiquadFilter(): BiquadFilterNode {
    return new FakeBgmFilter() as unknown as BiquadFilterNode;
  }

  createBuffer(_channels: number, length: number): AudioBuffer {
    return new FakeBgmBuffer(length) as unknown as AudioBuffer;
  }

  asAudioContext(): AudioContext {
    return this as unknown as AudioContext;
  }
}

const createHarness = () => {
  const clock = new FakeClock();
  const sink = new RecordingSink();
  const bgm = new BgmSystem(clock, sink, { automaticScheduler: false });
  const tickAt = (seconds: number): void => {
    clock.currentTime = seconds;
    bgm.tick();
  };
  return { clock, sink, bgm, tickAt };
};

describe('BgmSystem', () => {
  it('WebAudio sink는 7번째 voice에서 low-priority를 거절하고 가장 오래된 low-priority만 선점한다', () => {
    const context = new FakeBgmAudioContext();
    const sink = new WebAudioBgmVoiceSink(
      context.asAudioContext(),
      context.destination as unknown as AudioNode,
    );
    sink.scheduleBaseStep(0, 0);
    sink.scheduleBossStep(0, 0);

    expect(sink.activeVoiceCount).toBe(BGM_VOICE_CAP);
    const createdAtCap = context.oscillators.length + context.bufferSources.length;
    expect(createdAtCap).toBe(BGM_VOICE_CAP);
    const oldestLowPriority = context.bufferSources[0];

    sink.scheduleBaseStep(2, 0.3);
    expect(context.oscillators.length + context.bufferSources.length).toBe(createdAtCap);
    expect(sink.activeVoiceCount).toBe(BGM_VOICE_CAP);

    sink.scheduleBossStep(4, 0.6);
    expect(context.oscillators.length + context.bufferSources.length).toBe(createdAtCap + 1);
    expect(sink.activeVoiceCount).toBe(BGM_VOICE_CAP);
    expect(oldestLowPriority?.stops).toContain(context.currentTime);
    expect(oldestLowPriority?.disconnectCalls).toBe(1);
  });

  it('snapshot은 sink의 실제 active voice 수를 감추지 않는다', () => {
    const sink: BgmVoiceSink = {
      activeVoiceCount: 7,
      scheduleBaseStep: () => undefined,
      scheduleBossStep: () => undefined,
      cancelBossStep: () => undefined,
      stopAll: () => undefined,
    };
    const bgm = new BgmSystem(new FakeClock(), sink, { automaticScheduler: false });

    expect(bgm.snapshot().voiceCount).toBe(7);
  });

  it('WebAudio source 시작 실패는 등록한 voice와 source를 즉시 정리한다', () => {
    const context = new FakeBgmAudioContext();
    context.throwOnStart = true;
    const sink = new WebAudioBgmVoiceSink(
      context.asAudioContext(),
      context.destination as unknown as AudioNode,
    );

    sink.scheduleBaseStep(0, 0);

    const sources = [...context.oscillators, ...context.bufferSources];
    expect(sources).toHaveLength(4);
    expect(sink.activeVoiceCount).toBe(0);
    expect(sources.every(({ disconnectCalls }) => disconnectCalls === 1)).toBe(true);
  });

  it('100BPM 512-step transport는 76.8초에 wrap하고 exact scheduler 상수를 쓴다', () => {
    const h = createHarness();
    h.bgm.beginRun();
    h.tickAt(76.8);

    expect({ STEP_SECONDS, TRANSPORT_STEPS, LOOKAHEAD_SECONDS, SCHEDULER_MS }).toEqual({
      STEP_SECONDS: 0.15,
      TRANSPORT_STEPS: 512,
      LOOKAHEAD_SECONDS: 0.18,
      SCHEDULER_MS: 25,
    });
    expect(h.bgm.snapshot().transportPhaseSteps).toBeCloseTo(0, 9);
    expect(h.bgm.snapshot().voiceCount).toBeLessThanOrEqual(6);
  });

  it('5.4-step pause는 step 6을 +0.09초에 재개하고 숨은 note를 몰아 재생하지 않는다', () => {
    const h = createHarness();
    h.bgm.beginRun();
    h.clock.currentTime = 0.81;
    h.bgm.pause();

    expect(h.bgm.snapshot()).toMatchObject({
      transportPhaseSteps: 5.4,
      lastStartedStep: 5,
    });
    const callsBeforeResume = [...h.sink.base];
    h.clock.currentTime = 10;
    h.bgm.resume();

    expect(h.bgm.snapshot()).toMatchObject({ nextStepIndex: 7 });
    expect(h.bgm.snapshot().nextNoteTime).toBeCloseTo(10.24, 9);
    expect(h.sink.base.slice(callsBeforeResume.length)).toEqual([{ step: 6, when: 10.09 }]);
    h.tickAt(10);
    expect(h.sink.base.at(-1)).toEqual({ step: 6, when: 10.09 });
    expect(h.sink.base.filter(({ step }) => step <= 5)).toEqual(callsBeforeResume.filter(({ step }) => step <= 5));
  });

  it('5.9-step 복귀는 25ms scheduler보다 먼저 +15ms의 첫 미재생 step을 예약한다', () => {
    vi.useFakeTimers();
    const clock = new FakeClock();
    const sink = new RecordingSink();
    const bgm = new BgmSystem(clock, sink);
    try {
      bgm.beginRun();
      clock.currentTime = 0.885;
      bgm.pause();
      const scheduledBeforeResume = sink.base.length;
      clock.currentTime = 10;

      bgm.resume();
      clock.currentTime = 10.025;
      vi.advanceTimersByTime(25);

      expect(sink.base.slice(scheduledBeforeResume)).toContainEqual({ step: 6, when: 10.015 });
    } finally {
      bgm.destroy();
      vi.useRealTimers();
    }
  });

  it('boss on/off는 lookahead 안에서도 다음 4-step beat에서만 공개 상태를 바꾼다', () => {
    const h = createHarness();
    h.bgm.beginRun();
    h.clock.currentTime = 0.45;
    h.bgm.setBossActive(true);
    h.bgm.tick();

    expect(h.bgm.snapshot().bossLayerActive).toBe(false);
    expect(h.bgm.snapshot().scheduledBossTransitions).toContainEqual({ step: 4, when: 0.6, active: true });
    expect(h.sink.boss).toContainEqual({ step: 4, when: 0.6 });

    h.tickAt(0.6);
    expect(h.bgm.snapshot().bossLayerActive).toBe(true);
    h.clock.currentTime = 1.05;
    h.bgm.setBossActive(false);
    h.bgm.tick();
    expect(h.bgm.snapshot().scheduledBossTransitions).toContainEqual({ step: 8, when: 1.2, active: false });
    h.tickAt(1.2);
    expect(h.bgm.snapshot().bossLayerActive).toBe(false);
  });

  it('이미 base step 4가 prequeue된 뒤 늦은 boss event도 같은 timestamp에 정확히 한 번 합류한다', () => {
    const h = createHarness();
    h.bgm.beginRun();
    h.tickAt(0.45);
    expect(h.sink.base).toContainEqual({ step: 4, when: 0.6 });

    h.clock.currentTime = 0.5;
    h.bgm.setBossActive(true);
    h.bgm.setBossActive(true);

    expect(h.bgm.snapshot().scheduledBossTransitions).toContainEqual({ step: 4, when: 0.6, active: true });
    expect(h.sink.boss.filter(({ step, when }) => step === 4 && when === 0.6)).toHaveLength(1);
  });

  it('32-bar root table과 bar downbeat base 4 + boss 2 voice를 정확히 고정한다', () => {
    expect(BGM_BAR_ROOTS).toEqual([
      60, 60, 65, 67, 60, 69, 67, 65,
      60, 60, 65, 67, 60, 69, 67, 65,
      60, 60, 65, 67, 60, 69, 67, 65,
      60, 60, 65, 67, 60, 69, 67, 65,
    ]);
    expect(baseScoreAtStep(16).map(({ voice }) => voice)).toEqual([
      'kalimba', 'marimbaBass', 'baseShaker', 'airyPluck',
    ]);

    const h = createHarness();
    h.bgm.beginRun();
    h.clock.currentTime = 0.01;
    h.bgm.setBossActive(true);
    for (let time = 0.025; time <= 2.4; time += 0.025) h.tickAt(time);
    h.tickAt(2.4);

    expect(h.sink.base).toContainEqual({ step: 16, when: 2.4 });
    expect(h.sink.boss).toContainEqual({ step: 16, when: 2.4 });
    expect(h.bgm.snapshot().voiceCount).toBe(6);
  });

  it('pause는 timer/source를 먼저 정리하고 fade 완료 뒤 transport를 멈춘다', () => {
    vi.useFakeTimers();
    const clock = new FakeClock();
    const sink = new RecordingSink();
    const bgm = new BgmSystem(clock, sink);
    bgm.beginRun();
    expect(vi.getTimerCount()).toBe(1);

    bgm.fadeOut(600, () => undefined);
    expect(vi.getTimerCount()).toBe(2);
    vi.advanceTimersByTime(600);
    expect(sink.stopAllCalls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
