export type SfxId =
  | 'barkHuchu'
  | 'barkDeokbae'
  | 'hitLight'
  | 'hitHeavy'
  | 'tailSwipe'
  | 'aquaCharge'
  | 'aquaImpact'
  | 'noticePaper'
  | 'noticeStamp'
  | 'shelterWood'
  | 'skillLearned'
  | 'electricCharge'
  | 'electricImpact';

export type SfxPriority = 0 | 1 | 2 | 3;
export type ToneDefinition = readonly [
  waveform: OscillatorType,
  startHz: number,
  endHz: number,
  durationMs: number,
];
export type NoiseDefinition = readonly [
  filter: BiquadFilterType,
  frequencyHz: number,
  durationMs: number,
];

export interface SfxDefinition {
  readonly priority: SfxPriority;
  readonly minGapMs: number;
  readonly maxPerCast: number;
  readonly tone?: ToneDefinition;
  readonly noise?: NoiseDefinition;
  readonly chime?: readonly number[];
}

export type SfxRegistry = Readonly<Record<SfxId, SfxDefinition>>;

export interface SfxPlayInput {
  readonly castId: string;
  readonly scheduledAtSeconds?: number;
}

export interface SfxSnapshot {
  readonly voiceCount: number;
  readonly dedupeCastCount: number;
}

export interface SfxPort {
  play(id: SfxId, input: SfxPlayInput): boolean;
  snapshot(): SfxSnapshot;
  stopAll(): void;
  resetDedupe(): void;
  destroy(): void;
}

export interface SfxFactory {
  create(context: AudioContext, sfxBus: GainNode): SfxPort;
}

export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AudioSnapshot {
  readonly state: 'locked' | 'running' | 'suspended' | 'silent';
  readonly muted: boolean;
  readonly sfxVoices: number;
  readonly bgmVoices: number;
  readonly totalVoices: number;
  readonly transportPhaseSteps: number;
  readonly bossLayerActive: boolean;
}

export interface AudioTransportClock {
  nowSeconds(): number;
}

export interface BgmVoiceSink {
  scheduleBaseStep(step: number, when: number): void;
  scheduleBossStep(step: number, when: number): void;
  cancelBossStep(step: number, when: number): void;
  stopAll(): void;
  readonly activeVoiceCount: number;
}

export interface BgmSnapshot {
  readonly transportPhaseSteps: number;
  readonly voiceCount: number;
  readonly bossLayerActive: boolean;
  readonly lastStartedStep: number | null;
  readonly nextStepIndex: number;
  readonly nextNoteTime: number;
  readonly scheduledBossTransitions: readonly Readonly<{
    step: number;
    when: number;
    active: boolean;
  }>[];
}

export interface BgmTransportFactory {
  create(
    context: AudioContext,
    bgmBus: GainNode,
  ): Readonly<{ clock: AudioTransportClock; sink: BgmVoiceSink }>;
}

export interface AudioSystemOptions {
  readonly bgmTransportFactory?: BgmTransportFactory;
  readonly sfxFactory?: SfxFactory | ((context: AudioContext, sfxBus: GainNode) => SfxPort);
}

export interface SfxSystemOptions {
  readonly dedupeCastLimit?: number;
}
