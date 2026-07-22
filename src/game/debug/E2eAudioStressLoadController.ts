import type { AudioSnapshot, SfxId, SfxPlayInput } from '../audio/AudioTypes';

const POLL_MS = 25;
const TIMEOUT_MS = 3500;
const BURST_IDS: readonly SfxId[] = [
  'barkHuchu', 'barkDeokbae', 'hitLight', 'hitHeavy', 'tailSwipe', 'aquaCharge',
  'aquaImpact', 'noticePaper', 'noticeStamp', 'huchuHit', 'skillLearned', 'electricCharge',
];

interface StressAudioPort {
  beginRun(): void;
  handle(event: { readonly type: 'bossActiveChanged'; readonly active: boolean; readonly activeBossCount: number }): void;
  play(id: SfxId, input: SfxPlayInput): boolean;
  snapshot(): AudioSnapshot;
  tickTransport(): void;
}

export interface E2eAudioStressSnapshot {
  readonly generation: number;
  readonly peakSfxVoices: number;
  readonly peakBgmVoices: number;
  readonly peakTotalVoices: number;
}

export class E2eAudioStressLoadController {
  private generation = 0;
  private peakSfxVoices = 0;
  private peakBgmVoices = 0;
  private peakTotalVoices = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private active = false;
  private burstSequence = 0;

  constructor(private readonly audio: StressAudioPort) {}

  async primeAtDownbeat(): Promise<void> {
    if (!this.active) this.beginGeneration();
    this.audio.beginRun();
    this.audio.handle({ type: 'bossActiveChanged', active: true, activeBossCount: 1 });
    if (this.tryBurstAtDownbeat()) return;
    await new Promise<void>((resolve, reject) => {
      const startedAt = Date.now();
      this.clearTimer();
      this.timer = setInterval(() => {
        if (this.tryBurstAtDownbeat()) {
          this.clearTimer();
          resolve();
        } else if (Date.now() - startedAt >= TIMEOUT_MS) {
          this.clearTimer();
          reject(new Error('E2E audio stress did not observe a 6-voice downbeat within 3500ms'));
        }
      }, POLL_MS);
    });
  }

  observe(): void {
    if (this.active) {
      this.tryBurstAtDownbeat();
      return;
    }
    this.record(this.audio.snapshot());
  }

  snapshot(): E2eAudioStressSnapshot {
    return {
      generation: this.generation,
      peakSfxVoices: this.peakSfxVoices,
      peakBgmVoices: this.peakBgmVoices,
      peakTotalVoices: this.peakTotalVoices,
    };
  }

  reset(): void {
    this.clearTimer();
    this.audio.handle({ type: 'bossActiveChanged', active: false, activeBossCount: 0 });
    this.active = false;
    this.peakSfxVoices = 0;
    this.peakBgmVoices = 0;
    this.peakTotalVoices = 0;
  }

  destroy(): void {
    this.clearTimer();
    this.audio.handle({ type: 'bossActiveChanged', active: false, activeBossCount: 0 });
    this.active = false;
    this.peakSfxVoices = 0;
    this.peakBgmVoices = 0;
    this.peakTotalVoices = 0;
  }

  private beginGeneration(): void {
    this.generation += 1;
    this.active = true;
  }

  private tryBurstAtDownbeat(): boolean {
    this.audio.tickTransport();
    const before = this.audio.snapshot();
    this.record(before);
    if (before.bgmVoices !== 6 || before.sfxVoices !== 0) return false;
    const burst = this.burstSequence;
    this.burstSequence += 1;
    BURST_IDS.forEach((id, index) => {
      this.audio.play(id, { castId: `e2e-stress:${this.generation}:${burst}:${index}` });
    });
    const after = this.audio.snapshot();
    this.record(after);
    return after.sfxVoices === 12 && after.bgmVoices === 6 && after.totalVoices === 18;
  }

  private record(snapshot: AudioSnapshot): void {
    if (snapshot.sfxVoices > 12 || snapshot.bgmVoices > 6 || snapshot.totalVoices > 18) {
      throw new Error('Audio voice budget exceeded');
    }
    this.peakSfxVoices = Math.max(this.peakSfxVoices, snapshot.sfxVoices);
    this.peakBgmVoices = Math.max(this.peakBgmVoices, snapshot.bgmVoices);
    this.peakTotalVoices = Math.max(this.peakTotalVoices, snapshot.totalVoices);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
