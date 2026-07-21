import { AUDIO_REGISTRY } from './AudioRegistry';
import type {
  SfxDefinition,
  SfxId,
  SfxPlayInput,
  SfxPort,
  SfxRegistry,
  SfxSnapshot,
  SfxSystemOptions,
} from './AudioTypes';

const VOICE_CAP = 12;
const DEFAULT_DEDUPE_CAST_LIMIT = 256;
const MIN_ENVELOPE_GAIN = 0.0001;
const CHIME_NOTE_SECONDS = 0.18;
const CHIME_STAGGER_SECONDS = 0.06;

type ScheduledSource = OscillatorNode | AudioBufferSourceNode;

interface Voice {
  readonly sequence: number;
  readonly priority: SfxDefinition['priority'];
  readonly cleanups: Set<(stop: boolean) => void>;
}

const isAudioNode = (value: AudioNode | SfxRegistry | undefined): value is AudioNode =>
  value !== undefined && typeof (value as Partial<AudioNode>).connect === 'function';

const isSfxSystemOptions = (
  value: SfxRegistry | SfxSystemOptions | undefined,
): value is SfxSystemOptions => value !== undefined && 'dedupeCastLimit' in value;

export const stableCastPitchFactor = (castId: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < castId.length; index += 1) {
    hash ^= castId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return 0.97 + ((hash >>> 0) / 0xffff_ffff) * 0.06;
};

export class SfxSystem implements SfxPort {
  private readonly output: AudioNode;
  private readonly registry: SfxRegistry;
  private readonly dedupeCastLimit: number;
  private readonly voices = new Set<Voice>();
  private readonly lastPlayedAtMs = new Map<SfxId, number>();
  private readonly perCastCounts = new Map<string, Map<SfxId, number>>();
  private sequence = 0;
  private destroyed = false;

  constructor(context: AudioContext, registry?: SfxRegistry, options?: SfxSystemOptions);
  constructor(
    context: AudioContext,
    output: AudioNode,
    registry?: SfxRegistry,
    options?: SfxSystemOptions,
  );
  constructor(
    private readonly context: AudioContext,
    outputOrRegistry?: AudioNode | SfxRegistry,
    registryOrOptions?: SfxRegistry | SfxSystemOptions,
    explicitOptions?: SfxSystemOptions,
  ) {
    this.output = isAudioNode(outputOrRegistry) ? outputOrRegistry : context.destination;
    this.registry = isAudioNode(outputOrRegistry)
      ? (isSfxSystemOptions(registryOrOptions) ? AUDIO_REGISTRY : registryOrOptions ?? AUDIO_REGISTRY)
      : outputOrRegistry ?? AUDIO_REGISTRY;
    const options = explicitOptions
      ?? (isSfxSystemOptions(registryOrOptions) ? registryOrOptions : undefined);
    this.dedupeCastLimit = Math.max(1, Math.floor(options?.dedupeCastLimit ?? DEFAULT_DEDUPE_CAST_LIMIT));
  }

  play(id: SfxId, input: SfxPlayInput): boolean {
    if (this.destroyed) return false;
    const definition = this.registry[id];
    const when = Math.max(this.context.currentTime, input.scheduledAtSeconds ?? this.context.currentTime);
    if (!Number.isFinite(when)) return false;
    const nowMs = when * 1_000;
    const previousAtMs = this.lastPlayedAtMs.get(id);
    if (previousAtMs !== undefined && nowMs - previousAtMs + Number.EPSILON < definition.minGapMs) {
      return false;
    }
    if ((this.perCastCounts.get(input.castId)?.get(id) ?? 0) >= definition.maxPerCast) {
      return false;
    }

    if (!this.makeRoom(definition)) return false;

    const voice: Voice = {
      sequence: this.sequence,
      priority: definition.priority,
      cleanups: new Set(),
    };
    this.sequence += 1;
    this.voices.add(voice);

    try {
      this.buildVoice(voice, definition, input.castId, when);
    } catch {
      this.disposeVoice(voice, true);
      return false;
    }

    if (voice.cleanups.size === 0) {
      this.voices.delete(voice);
      return false;
    }
    this.lastPlayedAtMs.set(id, nowMs);
    this.recordCastPlay(input.castId, id);
    return true;
  }

  snapshot(): SfxSnapshot {
    return {
      voiceCount: this.activeSourceCount(),
      dedupeCastCount: this.perCastCounts.size,
    };
  }

  stopAll(): void {
    [...this.voices].forEach((voice) => this.disposeVoice(voice, true));
  }

  resetDedupe(): void {
    this.lastPlayedAtMs.clear();
    this.perCastCounts.clear();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopAll();
    this.resetDedupe();
  }

  private buildVoice(
    voice: Voice,
    definition: SfxDefinition,
    castId: string,
    when: number,
  ): void {
    const pitch = stableCastPitchFactor(castId);
    if (definition.tone !== undefined) this.buildTone(voice, definition.tone, when, pitch);
    if (definition.noise !== undefined) this.buildNoise(voice, definition.noise, when, castId);
    definition.chime?.forEach((frequencyHz, index) => {
      const startsAt = when + index * CHIME_STAGGER_SECONDS;
      this.buildChimeNote(voice, frequencyHz * pitch, startsAt);
    });
  }

  private buildTone(
    voice: Voice,
    [waveform, startHz, endHz, durationMs]: NonNullable<SfxDefinition['tone']>,
    when: number,
    pitch: number,
  ): void {
    const source = this.context.createOscillator();
    const envelope = this.context.createGain();
    const endsAt = when + durationMs / 1_000;
    source.type = waveform;
    source.frequency.setValueAtTime(startHz * pitch, when);
    source.frequency.exponentialRampToValueAtTime(Math.max(1, endHz * pitch), endsAt);
    this.configureEnvelope(envelope.gain, when, endsAt, 0.34);
    source.connect(envelope);
    envelope.connect(this.output);
    this.registerSource(voice, source, [envelope]);
    source.start(when);
    source.stop(endsAt);
  }

  private buildNoise(
    voice: Voice,
    [filterType, frequencyHz, durationMs]: NonNullable<SfxDefinition['noise']>,
    when: number,
    castId: string,
  ): void {
    const durationSeconds = durationMs / 1_000;
    const frameCount = Math.max(1, Math.ceil(this.context.sampleRate * durationSeconds));
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
    this.fillNoise(buffer.getChannelData(0), castId);
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    const endsAt = when + durationSeconds;
    source.buffer = buffer;
    filter.type = filterType;
    filter.frequency.setValueAtTime(frequencyHz, when);
    this.configureEnvelope(envelope.gain, when, endsAt, 0.22);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.output);
    this.registerSource(voice, source, [filter, envelope]);
    source.start(when);
    source.stop(endsAt);
  }

  private buildChimeNote(voice: Voice, frequencyHz: number, when: number): void {
    const source = this.context.createOscillator();
    const envelope = this.context.createGain();
    const endsAt = when + CHIME_NOTE_SECONDS;
    source.type = 'sine';
    source.frequency.setValueAtTime(frequencyHz, when);
    this.configureEnvelope(envelope.gain, when, endsAt, 0.2);
    source.connect(envelope);
    envelope.connect(this.output);
    this.registerSource(voice, source, [envelope]);
    source.start(when);
    source.stop(endsAt);
  }

  private configureEnvelope(
    gain: AudioParam,
    when: number,
    endsAt: number,
    peak: number,
  ): void {
    gain.setValueAtTime(MIN_ENVELOPE_GAIN, when);
    gain.exponentialRampToValueAtTime(peak, Math.min(endsAt, when + 0.006));
    gain.exponentialRampToValueAtTime(MIN_ENVELOPE_GAIN, endsAt);
  }

  private registerSource(voice: Voice, source: ScheduledSource, nodes: readonly AudioNode[]): void {
    let cleaned = false;
    const cleanup = (stop: boolean): void => {
      if (cleaned) return;
      cleaned = true;
      source.onended = null;
      if (stop) {
        try {
          source.stop(this.context.currentTime);
        } catch {
          // Already-ended Web Audio sources may reject a second stop.
        }
      }
      source.disconnect();
      nodes.forEach((node) => node.disconnect());
      voice.cleanups.delete(cleanup);
      if (voice.cleanups.size === 0) this.voices.delete(voice);
    };
    voice.cleanups.add(cleanup);
    source.onended = () => cleanup(false);
  }

  private disposeVoice(voice: Voice, stop: boolean): void {
    [...voice.cleanups].forEach((cleanup) => cleanup(stop));
    this.voices.delete(voice);
  }

  private makeRoom(definition: SfxDefinition): boolean {
    const required = this.sourceCount(definition);
    if (required === 0 || required > VOICE_CAP) return false;
    const active = this.activeSourceCount();
    if (active + required <= VOICE_CAP) return true;

    const preemptable = [...this.voices]
      .filter((voice) => voice.priority < definition.priority)
      .sort((left, right) => left.sequence - right.sequence);
    const selected: Voice[] = [];
    let freed = 0;
    for (const voice of preemptable) {
      selected.push(voice);
      freed += voice.cleanups.size;
      if (active - freed + required <= VOICE_CAP) break;
    }
    if (active - freed + required > VOICE_CAP) return false;
    selected.forEach((voice) => this.disposeVoice(voice, true));
    return true;
  }

  private activeSourceCount(): number {
    let count = 0;
    this.voices.forEach((voice) => { count += voice.cleanups.size; });
    return count;
  }

  private sourceCount(definition: SfxDefinition): number {
    return Number(definition.tone !== undefined)
      + Number(definition.noise !== undefined)
      + (definition.chime?.length ?? 0);
  }

  private recordCastPlay(castId: string, id: SfxId): void {
    let counts = this.perCastCounts.get(castId);
    if (counts === undefined) {
      if (this.perCastCounts.size >= this.dedupeCastLimit) {
        const oldest = this.perCastCounts.keys().next().value as string | undefined;
        if (oldest !== undefined) this.perCastCounts.delete(oldest);
      }
      counts = new Map();
      this.perCastCounts.set(castId, counts);
    }
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  private fillNoise(channel: Float32Array, castId: string): void {
    let state = Math.max(1, Math.floor(stableCastPitchFactor(castId) * 0x7fff_ffff));
    for (let index = 0; index < channel.length; index += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      channel[index] = ((state >>> 0) / 0xffff_ffff) * 2 - 1;
    }
  }
}
