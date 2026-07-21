import { baseScoreAtStep, type BgmScoreEvent } from './AudioRegistry';
import type {
  AudioTransportClock,
  BgmSnapshot,
  BgmVoiceSink,
} from './AudioTypes';

export const STEP_SECONDS = 0.15;
export const TRANSPORT_STEPS = 512;
export const LOOKAHEAD_SECONDS = 0.18;
export const SCHEDULER_MS = 25;
export const BGM_VOICE_CAP = 6;

const TIME_EPSILON_SECONDS = 1e-9;

interface BossTransition {
  readonly absoluteStep: number;
  readonly step: number;
  readonly when: number;
  readonly active: boolean;
}

export interface BgmSystemOptions {
  readonly automaticScheduler?: boolean;
}

const normalizeStep = (step: number): number => {
  const normalized = ((step % TRANSPORT_STEPS) + TRANSPORT_STEPS) % TRANSPORT_STEPS;
  return Math.round(normalized * 1e12) / 1e12;
};

export class BgmSystem {
  private timer: ReturnType<typeof setInterval> | null = null;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private transportOrigin = 0;
  private pausedPhaseSteps = 0;
  private nextAbsoluteStep = 0;
  private nextNoteTimeValue = 0;
  private lastStartedStepValue: number | null = null;
  private running = false;
  private hasBegun = false;
  private requestedBossActive = false;
  private audibleBossActive = false;
  private transitions: BossTransition[] = [];
  private readonly scheduledBossBeatKeys = new Set<string>();

  constructor(
    private readonly clock: AudioTransportClock,
    private readonly sink: BgmVoiceSink,
    private readonly options: BgmSystemOptions = {},
  ) {}

  beginRun(): void {
    this.clearTimer();
    this.clearFadeTimer();
    if (this.hasBegun) this.sink.stopAll();
    this.hasBegun = true;
    const now = this.clock.nowSeconds();
    this.transportOrigin = now;
    this.pausedPhaseSteps = 0;
    this.nextAbsoluteStep = 0;
    this.nextNoteTimeValue = now;
    this.lastStartedStepValue = 0;
    this.requestedBossActive = false;
    this.audibleBossActive = false;
    this.transitions = [];
    this.scheduledBossBeatKeys.clear();
    this.running = true;
    this.tick();
    this.startTimer();
  }

  tick(): void {
    if (!this.running) return;
    const now = this.clock.nowSeconds();
    this.updateLastStartedStep(now);
    this.applyAudibleBossTransitions(now);

    while (this.nextNoteTimeValue < now - TIME_EPSILON_SECONDS) this.advanceCursor();
    while (this.nextNoteTimeValue < now + LOOKAHEAD_SECONDS - TIME_EPSILON_SECONDS) {
      const step = normalizeStep(this.nextAbsoluteStep);
      const when = this.nextNoteTimeValue;
      this.sink.scheduleBaseStep(step, when);
      if (step % 4 === 0 && this.bossActiveAt(when)) this.scheduleBossBeatOnce(step, when);
      this.advanceCursor();
    }
  }

  setBossActive(active: boolean): void {
    if (active === this.requestedBossActive) return;
    this.requestedBossActive = active;
    if (!this.running) return;
    this.queueBossTransition(active);
  }

  pause(): void {
    if (!this.running) return;
    const now = this.clock.nowSeconds();
    this.pausedPhaseSteps = normalizeStep((now - this.transportOrigin) / STEP_SECONDS);
    this.lastStartedStepValue = Math.floor(this.pausedPhaseSteps);
    this.running = false;
    this.clearTimer();
    this.clearFadeTimer();
    this.sink.stopAll();
    this.transitions = [];
    this.scheduledBossBeatKeys.clear();
  }

  resume(): void {
    if (this.running || !this.hasBegun) return;
    const now = this.clock.nowSeconds();
    const whole = Math.floor(this.pausedPhaseSteps);
    const fraction = this.pausedPhaseSteps - whole;
    this.nextAbsoluteStep = whole + 1;
    this.nextNoteTimeValue = now + (1 - fraction) * STEP_SECONDS;
    this.transportOrigin = this.nextNoteTimeValue - this.nextAbsoluteStep * STEP_SECONDS;
    this.running = true;
    if (this.requestedBossActive !== this.audibleBossActive) {
      this.queueBossTransition(this.requestedBossActive);
    }
    this.tick();
    this.startTimer();
  }

  fadeOut(durationMs: number, beginFade: (durationMs: number) => void): void {
    if (!this.running) return;
    this.clearFadeTimer();
    beginFade(durationMs);
    this.fadeTimer = setTimeout(() => {
      this.fadeTimer = null;
      this.pause();
    }, durationMs);
  }

  snapshot(): BgmSnapshot {
    const phase = this.running
      ? normalizeStep((this.clock.nowSeconds() - this.transportOrigin) / STEP_SECONDS)
      : this.pausedPhaseSteps;
    return {
      transportPhaseSteps: phase,
      voiceCount: this.sink.activeVoiceCount,
      bossLayerActive: this.audibleBossActive,
      lastStartedStep: this.lastStartedStepValue,
      nextStepIndex: normalizeStep(this.nextAbsoluteStep),
      nextNoteTime: this.nextNoteTimeValue,
      scheduledBossTransitions: this.transitions.map(({ step, when, active }) => ({ step, when, active })),
    };
  }

  destroy(): void {
    this.running = false;
    this.clearTimer();
    this.clearFadeTimer();
    this.sink.stopAll();
    this.transitions = [];
    this.scheduledBossBeatKeys.clear();
  }

  private startTimer(): void {
    if (this.options.automaticScheduler === false || this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), SCHEDULER_MS);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private clearFadeTimer(): void {
    if (this.fadeTimer === null) return;
    clearTimeout(this.fadeTimer);
    this.fadeTimer = null;
  }

  private advanceCursor(): void {
    this.nextAbsoluteStep += 1;
    this.nextNoteTimeValue = this.transportOrigin + this.nextAbsoluteStep * STEP_SECONDS;
  }

  private updateLastStartedStep(now: number): void {
    const phase = normalizeStep((now - this.transportOrigin) / STEP_SECONDS);
    this.lastStartedStepValue = Math.floor(phase + TIME_EPSILON_SECONDS);
  }

  private queueBossTransition(active: boolean): void {
    const now = this.clock.nowSeconds();
    const phase = (now - this.transportOrigin) / STEP_SECONDS;
    const absoluteStep = Math.ceil(phase / 4) * 4;
    const step = normalizeStep(absoluteStep);
    const when = this.transportOrigin + absoluteStep * STEP_SECONDS;

    for (const transition of this.transitions) {
      if (transition.when + TIME_EPSILON_SECONDS < now) continue;
      if (transition.active) this.cancelBossBeatIfScheduled(transition.step, transition.when);
    }
    this.transitions = this.transitions.filter((transition) => (
      transition.when + TIME_EPSILON_SECONDS < now
    ));
    this.transitions.push({ absoluteStep, step, when, active });
    this.transitions.sort((left, right) => left.when - right.when);
    if (active) this.scheduleBossBeatOnce(step, when);
    else this.cancelBossBeatIfScheduled(step, when);
    this.applyAudibleBossTransitions(now);
  }

  private bossActiveAt(when: number): boolean {
    let active = this.audibleBossActive;
    for (const transition of this.transitions) {
      if (transition.when > when + TIME_EPSILON_SECONDS) break;
      active = transition.active;
    }
    return active;
  }

  private applyAudibleBossTransitions(now: number): void {
    const pending: BossTransition[] = [];
    for (const transition of this.transitions) {
      if (transition.when <= now + TIME_EPSILON_SECONDS) {
        this.audibleBossActive = transition.active;
      } else {
        pending.push(transition);
      }
    }
    this.transitions = pending;
  }

  private scheduleBossBeatOnce(step: number, when: number): void {
    const key = this.bossBeatKey(step, when);
    if (this.scheduledBossBeatKeys.has(key)) return;
    this.scheduledBossBeatKeys.add(key);
    this.sink.scheduleBossStep(step, when);
  }

  private cancelBossBeatIfScheduled(step: number, when: number): void {
    const key = this.bossBeatKey(step, when);
    if (!this.scheduledBossBeatKeys.delete(key)) return;
    this.sink.cancelBossStep(step, when);
  }

  private bossBeatKey(step: number, when: number): string {
    return `${step}:${when.toFixed(9)}`;
  }
}

type ScheduledSource = OscillatorNode | AudioBufferSourceNode;

interface WebAudioVoice {
  readonly lowPriority: boolean;
  readonly boss: boolean;
  readonly step: number;
  readonly when: number;
  readonly sequence: number;
  cleanup(stop: boolean): void;
}

export class WebAudioBgmVoiceSink implements BgmVoiceSink {
  private readonly voices = new Set<WebAudioVoice>();
  private sequence = 0;

  constructor(
    private readonly context: AudioContext,
    private readonly output: AudioNode,
  ) {}

  get activeVoiceCount(): number {
    return this.voices.size;
  }

  scheduleBaseStep(step: number, when: number): void {
    for (const event of baseScoreAtStep(step)) this.scheduleScoreVoice(event, step, when);
  }

  scheduleBossStep(step: number, when: number): void {
    this.scheduleTone(step, when, true, false, 72, 0.16, 'sine', 0.3);
    this.scheduleNoise(step, when, true, true, 0.08, 'highpass', 3_200, 0.12);
  }

  cancelBossStep(step: number, when: number): void {
    [...this.voices]
      .filter((voice) => voice.boss && voice.step === step && Math.abs(voice.when - when) <= TIME_EPSILON_SECONDS)
      .forEach((voice) => voice.cleanup(true));
  }

  stopAll(): void {
    [...this.voices].forEach((voice) => voice.cleanup(true));
  }

  private scheduleScoreVoice(event: BgmScoreEvent, step: number, when: number): void {
    switch (event.voice) {
      case 'kalimba':
        this.scheduleTone(step, when, false, false, event.midi, 0.14, 'triangle', 0.12);
        break;
      case 'marimbaBass':
        this.scheduleTone(step, when, false, false, event.midi, 0.22, 'sine', 0.18);
        break;
      case 'airyPluck':
        this.scheduleTone(step, when, false, false, event.midi, 0.18, 'sine', 0.08);
        break;
      case 'baseShaker':
        this.scheduleNoise(step, when, false, true, 0.045, 'bandpass', 4_800, 0.055);
        break;
    }
  }

  private scheduleTone(
    step: number,
    when: number,
    boss: boolean,
    lowPriority: boolean,
    midi: number,
    duration: number,
    waveform: OscillatorType,
    peak: number,
  ): void {
    if (!this.makeRoom(lowPriority)) return;
    let voice: WebAudioVoice | null = null;
    try {
      const source = this.context.createOscillator();
      const gain = this.context.createGain();
      const endsAt = when + duration;
      source.type = waveform;
      source.frequency.setValueAtTime(440 * 2 ** ((midi - 69) / 12), when);
      this.envelope(gain.gain, when, endsAt, peak);
      source.connect(gain);
      gain.connect(this.output);
      voice = this.register(source, [gain], { step, when, boss, lowPriority });
      source.start(when);
      source.stop(endsAt);
    } catch {
      voice?.cleanup(true);
      // An incomplete or unavailable Web Audio implementation degrades this voice to silence.
    }
  }

  private scheduleNoise(
    step: number,
    when: number,
    boss: boolean,
    lowPriority: boolean,
    duration: number,
    filterType: BiquadFilterType,
    frequency: number,
    peak: number,
  ): void {
    if (!this.makeRoom(lowPriority)) return;
    let voice: WebAudioVoice | null = null;
    try {
      const frames = Math.max(1, Math.ceil(this.context.sampleRate * duration));
      const buffer = this.context.createBuffer(1, frames, this.context.sampleRate);
      const channel = buffer.getChannelData(0);
      let state = Math.max(1, step + 1);
      for (let index = 0; index < channel.length; index += 1) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        channel[index] = ((state >>> 0) / 0xffff_ffff) * 2 - 1;
      }
      const source = this.context.createBufferSource();
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      const endsAt = when + duration;
      source.buffer = buffer;
      filter.type = filterType;
      filter.frequency.setValueAtTime(frequency, when);
      this.envelope(gain.gain, when, endsAt, peak);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.output);
      voice = this.register(source, [filter, gain], { step, when, boss, lowPriority });
      source.start(when);
      source.stop(endsAt);
    } catch {
      voice?.cleanup(true);
      // An incomplete or unavailable Web Audio implementation degrades this voice to silence.
    }
  }

  private makeRoom(incomingLowPriority: boolean): boolean {
    if (this.voices.size < BGM_VOICE_CAP) return true;
    if (incomingLowPriority) return false;
    const shaker = [...this.voices]
      .filter(({ lowPriority }) => lowPriority)
      .sort((left, right) => left.sequence - right.sequence)[0];
    if (shaker === undefined) return false;
    shaker.cleanup(true);
    return true;
  }

  private register(
    source: ScheduledSource,
    nodes: readonly AudioNode[],
    input: Pick<WebAudioVoice, 'step' | 'when' | 'boss' | 'lowPriority'>,
  ): WebAudioVoice {
    let cleaned = false;
    const voice: WebAudioVoice = {
      ...input,
      sequence: this.sequence,
      cleanup: (stop) => {
        if (cleaned) return;
        cleaned = true;
        source.onended = null;
        if (stop) {
          try {
            source.stop(this.context.currentTime);
          } catch {
            // Already-ended scheduled sources can reject a second stop.
          }
        }
        source.disconnect();
        nodes.forEach((node) => node.disconnect());
        this.voices.delete(voice);
      },
    };
    this.sequence += 1;
    this.voices.add(voice);
    source.onended = () => voice.cleanup(false);
    return voice;
  }

  private envelope(param: AudioParam, when: number, endsAt: number, peak: number): void {
    param.setValueAtTime(0.0001, when);
    param.exponentialRampToValueAtTime(peak, Math.min(endsAt, when + 0.006));
    param.exponentialRampToValueAtTime(0.0001, endsAt);
  }
}
