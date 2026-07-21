import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AudioSystem } from '../../src/game/audio/AudioSystem';
import type { AudioSnapshot, SfxId, SfxPlayInput, StoragePort } from '../../src/game/audio/AudioTypes';
import { E2eAudioStressLoadController } from '../../src/game/debug/E2eAudioStressLoadController';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

it('production AudioSystem에서 실제 12/6/18 high-water와 run epoch/reset을 관측한다', async () => {
  const context = new FakeAudioContext();
  const audio = new AudioSystem(() => context.asAudioContext(), memoryStorage());
  expect(await audio.unlock()).toBe(true);
  audio.beginRun();
  const driver = new E2eAudioStressLoadController(audio);
  expect(driver.snapshot()).toEqual({
    generation: 0,
    peakSfxVoices: 0,
    peakBgmVoices: 0,
    peakTotalVoices: 0,
  });

  await driver.primeAtDownbeat();

  expect(driver.snapshot()).toEqual({
    generation: 1,
    peakSfxVoices: 12,
    peakBgmVoices: 6,
    peakTotalVoices: 18,
  });
  expect(audio.snapshot()).toMatchObject({ sfxVoices: 12, bgmVoices: 6, totalVoices: 18 });
  const activePhysicalSources = [
    ...context.oscillators,
    ...context.bufferSources,
  ].filter(({ onended }) => onended !== null).length;
  expect(activePhysicalSources).toBe(audio.snapshot().totalVoices);
  expect(activePhysicalSources).toBeLessThanOrEqual(18);
  expect(context.liveScheduledSources).toBe(18);
  expect(context.peakScheduledSources).toBe(18);

  driver.reset();
  expect(driver.snapshot()).toEqual({
    generation: 1,
    peakSfxVoices: 0,
    peakBgmVoices: 0,
    peakTotalVoices: 0,
  });

  await driver.primeAtDownbeat();
  expect(driver.snapshot()).toEqual({
    generation: 2,
    peakSfxVoices: 12,
    peakBgmVoices: 6,
    peakTotalVoices: 18,
  });

  driver.reset();
  expect(driver.snapshot()).toEqual({
    generation: 2,
    peakSfxVoices: 0,
    peakBgmVoices: 0,
    peakTotalVoices: 0,
  });

  await driver.primeAtDownbeat();
  expect(driver.snapshot().generation).toBe(3);
  await audio.destroy();
  expect(context.liveScheduledSources).toBe(0);
});

it('prime은 ambient scheduler를 기다리지 않고 realtime transport를 직접 tick한다', async () => {
  const audio = new TickDrivenStressAudioPort();
  const driver = new E2eAudioStressLoadController(audio);

  const primed = driver.primeAtDownbeat();
  await vi.advanceTimersByTimeAsync(3500);
  await primed;

  expect(audio.tickCount).toBeGreaterThan(0);
  expect(driver.snapshot()).toEqual({
    generation: 1,
    peakSfxVoices: 12,
    peakBgmVoices: 6,
    peakTotalVoices: 18,
  });
});

class TickDrivenStressAudioPort {
  tickCount = 0;
  private sfxVoices = 0;
  private bgmVoices = 0;

  beginRun(): void {
    this.sfxVoices = 0;
    this.bgmVoices = 0;
  }

  handle(): void {}

  tickTransport(): void {
    this.tickCount += 1;
    this.bgmVoices = 6;
  }

  play(_id: SfxId, _input: SfxPlayInput): boolean {
    this.sfxVoices = Math.min(12, this.sfxVoices + 1);
    return true;
  }

  snapshot(): AudioSnapshot {
    return {
      state: 'running',
      muted: false,
      sfxVoices: this.sfxVoices,
      bgmVoices: this.bgmVoices,
      totalVoices: this.sfxVoices + this.bgmVoices,
      transportPhaseSteps: 0,
      bossLayerActive: true,
    };
  }
}

class FakeAudioParam {
  value = 0;

  setValueAtTime(value: number): this {
    this.value = value;
    return this;
  }

  linearRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }

  exponentialRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }

  cancelScheduledValues(): this {
    return this;
  }
}

class FakeAudioNode {
  connect(destination: FakeAudioNode): FakeAudioNode {
    return destination;
  }

  disconnect(): void {}
}

class FakeScheduledSource extends FakeAudioNode {
  onended: (() => void) | null = null;
  private connected = true;

  constructor(
    private readonly release: () => void,
  ) {
    super();
  }

  start(): void {}
  stop(): void {}

  override disconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    this.release();
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
  readonly sampleRate = 1_000;
  readonly destination = new FakeAudioNode();
  readonly oscillators: FakeOscillatorNode[] = [];
  readonly bufferSources: FakeAudioBufferSourceNode[] = [];
  liveScheduledSources = 0;
  peakScheduledSources = 0;
  state: AudioContextState = 'suspended';

  get currentTime(): number {
    return Date.now() / 1_000;
  }

  createOscillator(): OscillatorNode {
    const node = new FakeOscillatorNode(() => this.releaseScheduledSource());
    this.oscillators.push(node);
    this.registerScheduledSource();
    return node as unknown as OscillatorNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    const node = new FakeAudioBufferSourceNode(() => this.releaseScheduledSource());
    this.bufferSources.push(node);
    this.registerScheduledSource();
    return node as unknown as AudioBufferSourceNode;
  }

  createGain(): GainNode {
    return new FakeGainNode() as unknown as GainNode;
  }

  createBiquadFilter(): BiquadFilterNode {
    return new FakeBiquadFilterNode() as unknown as BiquadFilterNode;
  }

  createBuffer(_channels: number, length: number): AudioBuffer {
    return new FakeAudioBuffer(length) as unknown as AudioBuffer;
  }

  async resume(): Promise<void> {
    this.state = 'running';
  }

  async suspend(): Promise<void> {
    this.state = 'suspended';
  }

  async close(): Promise<void> {
    this.state = 'closed';
  }

  asAudioContext(): AudioContext {
    return this as unknown as AudioContext;
  }

  private registerScheduledSource(): void {
    this.liveScheduledSources += 1;
    this.peakScheduledSources = Math.max(this.peakScheduledSources, this.liveScheduledSources);
  }

  private releaseScheduledSource(): void {
    this.liveScheduledSources -= 1;
  }
}

function memoryStorage(): StoragePort {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}
