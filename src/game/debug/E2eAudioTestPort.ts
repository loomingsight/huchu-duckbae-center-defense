import { WebAudioBgmVoiceSink } from '../audio/BgmSystem';
import { baseScoreAtStep } from '../audio/AudioRegistry';
import type {
  AudioTransportClock,
  BgmTransportFactory,
  BgmVoiceSink,
} from '../audio/AudioTypes';

const SCALE = 64;
const MAX_SLICE_SECONDS = 0.025;
const MANUAL_VOICE_CAP = 6;

export interface E2eAudioTestPortSnapshot {
  readonly mode: 'realtime' | 'accelerated';
}

interface RealtimeTransport {
  readonly clock: AudioTransportClock;
  readonly sink: BgmVoiceSink;
}

export class E2eAudioTestPort implements BgmTransportFactory, AudioTransportClock, BgmVoiceSink {
  private realtime: RealtimeTransport | undefined;
  private tickTransport: () => void;
  private accelerated = false;
  private manualNowSeconds = 0;
  private realtimeOffsetSeconds = 0;
  private manualVoices = 0;

  constructor(realtime?: RealtimeTransport, tickTransport: () => void = () => undefined) {
    this.realtime = realtime;
    this.tickTransport = tickTransport;
  }

  bindTickTransport(tickTransport: () => void): void {
    this.tickTransport = tickTransport;
  }

  create(context: AudioContext, bgmBus: GainNode): Readonly<{
    clock: AudioTransportClock;
    sink: BgmVoiceSink;
  }> {
    if (this.realtime !== undefined) throw new Error('E2E audio transport is already bound');
    this.realtime = {
      clock: { nowSeconds: () => context.currentTime },
      sink: new WebAudioBgmVoiceSink(context, bgmBus),
    };
    return { clock: this, sink: this };
  }

  snapshot(): E2eAudioTestPortSnapshot {
    return { mode: this.accelerated ? 'accelerated' : 'realtime' };
  }

  setAccelerated(enabled: boolean): void {
    if (enabled === this.accelerated) return;
    const realtime = this.requireRealtime();
    if (enabled) {
      this.manualNowSeconds = this.nowSeconds();
      realtime.sink.stopAll();
      this.manualVoices = 0;
      this.accelerated = true;
      return;
    }
    realtime.sink.stopAll();
    this.realtimeOffsetSeconds = this.manualNowSeconds - realtime.clock.nowSeconds();
    this.manualVoices = 0;
    this.accelerated = false;
  }

  advanceFromGameMs(gameMs: number): void {
    if (!Number.isFinite(gameMs) || gameMs < 0) {
      throw new RangeError('Audio game delta must be finite and non-negative');
    }
    if (!this.accelerated || gameMs === 0) return;
    let remaining = gameMs / 1000 * SCALE;
    while (remaining > 1e-12) {
      const slice = Math.min(MAX_SLICE_SECONDS, remaining);
      this.manualNowSeconds += slice;
      remaining -= slice;
      this.tickTransport();
    }
  }

  nowSeconds(): number {
    if (this.accelerated) return this.manualNowSeconds;
    return this.requireRealtime().clock.nowSeconds() + this.realtimeOffsetSeconds;
  }

  scheduleBaseStep(step: number, when: number): void {
    if (this.accelerated) {
      this.manualVoices = Math.min(
        MANUAL_VOICE_CAP,
        this.manualVoices + baseScoreAtStep(step).length,
      );
      return;
    }
    this.requireRealtime().sink.scheduleBaseStep(step, this.realtimeWhen(when));
  }

  scheduleBossStep(step: number, when: number): void {
    if (this.accelerated) {
      this.manualVoices = Math.min(MANUAL_VOICE_CAP, this.manualVoices + 2);
      return;
    }
    this.requireRealtime().sink.scheduleBossStep(step, this.realtimeWhen(when));
  }

  cancelBossStep(step: number, when: number): void {
    if (this.accelerated) return;
    this.requireRealtime().sink.cancelBossStep(step, this.realtimeWhen(when));
  }

  stopAll(): void {
    this.manualVoices = 0;
    this.requireRealtime().sink.stopAll();
  }

  get activeVoiceCount(): number {
    return this.accelerated ? this.manualVoices : this.requireRealtime().sink.activeVoiceCount;
  }

  private realtimeWhen(logicalWhen: number): number {
    return logicalWhen - this.realtimeOffsetSeconds;
  }

  private requireRealtime(): RealtimeTransport {
    if (this.realtime === undefined) throw new Error('E2E audio transport is not bound');
    return this.realtime;
  }
}

export const E2E_AUDIO_TEST_PORT_REGISTRY_KEY = 'huchu-defense:e2e-audio-port';
