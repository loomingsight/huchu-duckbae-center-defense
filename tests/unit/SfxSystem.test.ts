import { describe, expect, it } from 'vitest';
import { AUDIO_REGISTRY, SFX_IDS } from '../../src/game/audio/AudioRegistry';
import { SfxSystem, stableCastPitchFactor } from '../../src/game/audio/SfxSystem';
import type { SfxDefinition, SfxId, SfxRegistry } from '../../src/game/audio/AudioTypes';

class FakeAudioParam {
  value = 0;
  readonly values: Array<{ readonly kind: string; readonly value: number; readonly at: number }> = [];

  setValueAtTime(value: number, at: number): this {
    this.value = value;
    this.values.push({ kind: 'set', value, at });
    return this;
  }

  linearRampToValueAtTime(value: number, at: number): this {
    this.value = value;
    this.values.push({ kind: 'linear', value, at });
    return this;
  }

  exponentialRampToValueAtTime(value: number, at: number): this {
    this.value = value;
    this.values.push({ kind: 'exponential', value, at });
    return this;
  }
}

class FakeAudioNode {
  readonly connections: FakeAudioNode[] = [];
  disconnectCalls = 0;

  connect(destination: FakeAudioNode): FakeAudioNode {
    this.connections.push(destination);
    return destination;
  }

  disconnect(): void {
    this.disconnectCalls += 1;
    this.connections.length = 0;
  }
}

class FakeScheduledSource extends FakeAudioNode {
  onended: (() => void) | null = null;
  readonly starts: number[] = [];
  readonly stops: number[] = [];

  start(at = 0): void {
    this.starts.push(at);
  }

  stop(at = 0): void {
    this.stops.push(at);
  }

  finish(): void {
    this.onended?.();
  }
}

class FakeOscillatorNode extends FakeScheduledSource {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeAudioParam();
}

class FakeAudioBufferSourceNode extends FakeScheduledSource {
  buffer: AudioBuffer | null = null;
}

class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam();
}

class FakeBiquadFilterNode extends FakeAudioNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeAudioParam();
}

class FakeAudioBuffer {
  private readonly channel: Float32Array;

  constructor(length: number) {
    this.channel = new Float32Array(length);
  }

  getChannelData(): Float32Array {
    return this.channel;
  }
}

class FakeAudioContext {
  currentTime = 0;
  sampleRate = 1_000;
  readonly destination = new FakeAudioNode();
  readonly oscillators: FakeOscillatorNode[] = [];
  readonly bufferSources: FakeAudioBufferSourceNode[] = [];
  readonly gains: FakeGainNode[] = [];
  readonly filters: FakeBiquadFilterNode[] = [];

  createOscillator(): OscillatorNode {
    const node = new FakeOscillatorNode();
    this.oscillators.push(node);
    return node as unknown as OscillatorNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    const node = new FakeAudioBufferSourceNode();
    this.bufferSources.push(node);
    return node as unknown as AudioBufferSourceNode;
  }

  createGain(): GainNode {
    const node = new FakeGainNode();
    this.gains.push(node);
    return node as unknown as GainNode;
  }

  createBiquadFilter(): BiquadFilterNode {
    const node = new FakeBiquadFilterNode();
    this.filters.push(node);
    return node as unknown as BiquadFilterNode;
  }

  createBuffer(_channels: number, length: number): AudioBuffer {
    return new FakeAudioBuffer(length) as unknown as AudioBuffer;
  }

  asAudioContext(): AudioContext {
    return this as unknown as AudioContext;
  }
}

const definition = (priority: 0 | 1 | 2 | 3): SfxDefinition => ({
  priority,
  minGapMs: 0,
  maxPerCast: 1,
  tone: ['sine', 100, 80, 1_000],
});

const registryWithPriorities = (
  priorityById: Partial<Readonly<Record<SfxId, 0 | 1 | 2 | 3>>>,
): SfxRegistry => Object.fromEntries(
  SFX_IDS.map((id) => [id, definition(priorityById[id] ?? 0)]),
) as unknown as SfxRegistry;

describe('AudioRegistry', () => {
  it('정확한 13개 합성 cue 정의를 보존한다', () => {
    expect(SFX_IDS).toEqual([
      'barkHuchu', 'barkDeokbae', 'hitLight', 'hitHeavy', 'tailSwipe',
      'aquaCharge', 'aquaImpact', 'noticePaper', 'noticeStamp', 'huchuHit',
      'skillLearned', 'electricCharge', 'electricImpact',
    ]);
    expect(AUDIO_REGISTRY).toEqual({
      barkHuchu: { priority: 0, minGapMs: 120, maxPerCast: 1, tone: ['triangle', 150, 95, 120], noise: ['bandpass', 620, 80] },
      barkDeokbae: { priority: 0, minGapMs: 120, maxPerCast: 1, tone: ['triangle', 230, 160, 100], noise: ['bandpass', 900, 65] },
      hitLight: { priority: 0, minGapMs: 35, maxPerCast: 1, tone: ['sine', 95, 65, 70], noise: ['highpass', 1500, 25] },
      hitHeavy: { priority: 2, minGapMs: 60, maxPerCast: 1, tone: ['sine', 80, 42, 150], noise: ['lowpass', 900, 55] },
      tailSwipe: { priority: 2, minGapMs: 120, maxPerCast: 1, tone: ['sine', 120, 70, 130], noise: ['bandpass', 1100, 120] },
      aquaCharge: { priority: 2, minGapMs: 200, maxPerCast: 1, tone: ['sine', 330, 660, 600] },
      aquaImpact: { priority: 2, minGapMs: 120, maxPerCast: 1, tone: ['sine', 120, 60, 140], noise: ['lowpass', 1800, 180] },
      noticePaper: { priority: 2, minGapMs: 120, maxPerCast: 1, noise: ['bandpass', 2200, 100] },
      noticeStamp: { priority: 2, minGapMs: 45, maxPerCast: 3, tone: ['sine', 90, 50, 110], noise: ['lowpass', 700, 45] },
      huchuHit: { priority: 3, minGapMs: 80, maxPerCast: 1, tone: ['sine', 130, 72, 120], noise: ['bandpass', 520, 70] },
      skillLearned: { priority: 1, minGapMs: 250, maxPerCast: 1, chime: [659, 784, 988] },
      electricCharge: { priority: 3, minGapMs: 180, maxPerCast: 1, tone: ['sawtooth', 180, 520, 300], noise: ['highpass', 2400, 220] },
      electricImpact: { priority: 3, minGapMs: 120, maxPerCast: 1, tone: ['sine', 75, 38, 180], noise: ['highpass', 1800, 130] },
    });
  });
});

describe('SfxSystem', () => {
  it('voiceCount는 cue가 아니라 실제 AudioScheduledSourceNode 수를 센다', () => {
    const fake = new FakeAudioContext();
    const sfx = new SfxSystem(fake.asAudioContext());

    expect(sfx.play('hitLight', { castId: 'physical:hit' })).toBe(true);
    expect(sfx.snapshot().voiceCount).toBe(2);
    expect([
      ...fake.oscillators,
      ...fake.bufferSources,
    ].filter(({ onended }) => onended !== null)).toHaveLength(2);

    expect(sfx.play('skillLearned', { castId: 'physical:chime' })).toBe(true);
    expect(sfx.snapshot().voiceCount).toBe(5);
  });

  it('active voice를 12개로 제한하고 strictly 높은 priority만 가장 오래된 낮은 voice를 선점한다', () => {
    const fake = new FakeAudioContext();
    const registry = registryWithPriorities({ huchuHit: 3, electricCharge: 0 });
    const sfx = new SfxSystem(fake.asAudioContext(), registry);

    SFX_IDS.slice(0, 12).forEach((id, index) => {
      expect(sfx.play(id, { castId: `low:${index}` })).toBe(true);
    });
    expect(sfx.snapshot().voiceCount).toBe(12);
    const oldest = fake.oscillators[0];

    expect(sfx.play('electricCharge', { castId: 'same-priority' })).toBe(false);
    expect(sfx.play('huchuHit', { castId: 'higher-priority' })).toBe(true);
    expect(sfx.snapshot().voiceCount).toBe(12);
    expect(oldest?.stops).toContain(0);
    expect(oldest?.disconnectCalls).toBe(1);
  });

  it('id min gap과 cast cap을 지키고 cast hash detune을 0.97~1.03에서 안정적으로 만든다', () => {
    const fake = new FakeAudioContext();
    const sfx = new SfxSystem(fake.asAudioContext());

    expect(sfx.play('noticeStamp', { castId: 'safety:4' })).toBe(true);
    fake.currentTime = 0.044;
    expect(sfx.play('noticeStamp', { castId: 'safety:4' })).toBe(false);
    fake.currentTime = 0.045;
    expect(sfx.play('noticeStamp', { castId: 'safety:4' })).toBe(true);
    fake.currentTime = 0.09;
    expect(sfx.play('noticeStamp', { castId: 'safety:4' })).toBe(true);
    fake.currentTime = 0.135;
    expect(sfx.play('noticeStamp', { castId: 'safety:4' })).toBe(false);

    const first = stableCastPitchFactor('same-cast');
    expect(first).toBe(stableCastPitchFactor('same-cast'));
    expect(first).toBeGreaterThanOrEqual(0.97);
    expect(first).toBeLessThanOrEqual(1.03);
    expect(new Set(Array.from({ length: 16 }, (_, index) => stableCastPitchFactor(`cast:${index}`))).size)
      .toBeGreaterThan(1);
  });

  it('ended/preempted source와 중간 node를 disconnect하고 dedupe를 bounded/resettable하게 유지한다', () => {
    const fake = new FakeAudioContext();
    const sfx = new SfxSystem(fake.asAudioContext(), undefined, { dedupeCastLimit: 3 });

    expect(sfx.play('hitLight', { castId: 'cast:1' })).toBe(true);
    const oscillator = fake.oscillators[0];
    const bufferSource = fake.bufferSources[0];
    oscillator?.finish();
    bufferSource?.finish();
    expect(sfx.snapshot()).toMatchObject({ voiceCount: 0, dedupeCastCount: 1 });
    expect(oscillator?.disconnectCalls).toBe(1);
    expect(bufferSource?.disconnectCalls).toBe(1);
    expect(fake.filters[0]?.disconnectCalls).toBe(1);
    expect(fake.gains.every(({ disconnectCalls }) => disconnectCalls === 1)).toBe(true);

    fake.currentTime = 1;
    ['cast:2', 'cast:3', 'cast:4'].forEach((castId) => {
      expect(sfx.play('hitLight', { castId })).toBe(true);
      fake.currentTime += 1;
    });
    expect(sfx.snapshot().dedupeCastCount).toBe(3);
    sfx.resetDedupe();
    expect(sfx.snapshot().dedupeCastCount).toBe(0);
    expect(sfx.play('hitLight', { castId: 'cast:4' })).toBe(true);

    sfx.stopAll();
    expect(sfx.snapshot().voiceCount).toBe(0);
    expect([...fake.oscillators, ...fake.bufferSources].every((source) => source.stops.length > 0 || source.disconnectCalls > 0)).toBe(true);
  });
});
