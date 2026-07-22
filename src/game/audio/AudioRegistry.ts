import type { SfxId, SfxRegistry } from './AudioTypes';

export const GAME_AUDIO_REGISTRY_KEY = 'huchu-defense:audio';

export type BgmScoreVoice = 'kalimba' | 'marimbaBass' | 'baseShaker' | 'airyPluck';

export interface BgmScoreEvent {
  readonly voice: BgmScoreVoice;
  readonly midi: number;
}

export const BGM_BAR_ROOTS = [
  60, 60, 65, 67, 60, 69, 67, 65,
  60, 60, 65, 67, 60, 69, 67, 65,
  60, 60, 65, 67, 60, 69, 67, 65,
  60, 60, 65, 67, 60, 69, 67, 65,
] as const;

export function baseScoreAtStep(step: number): readonly BgmScoreEvent[] {
  const normalizedStep = ((Math.floor(step) % 512) + 512) % 512;
  const localStep = normalizedStep % 16;
  const root = BGM_BAR_ROOTS[Math.floor(normalizedStep / 16)]!;
  const events: BgmScoreEvent[] = [];
  if (localStep % 4 === 0) events.push({ voice: 'kalimba', midi: root + (localStep === 12 ? 7 : 12) });
  if (localStep === 0 || localStep === 8) events.push({ voice: 'marimbaBass', midi: root - 12 });
  if (localStep % 2 === 0) events.push({ voice: 'baseShaker', midi: root });
  if (localStep === 0) events.push({ voice: 'airyPluck', midi: root + 19 });
  return events;
}

export const SFX_IDS = [
  'barkHuchu',
  'barkDeokbae',
  'hitLight',
  'hitHeavy',
  'tailSwipe',
  'aquaCharge',
  'aquaImpact',
  'noticePaper',
  'noticeStamp',
  'huchuHit',
  'skillLearned',
  'electricCharge',
  'electricImpact',
] as const satisfies readonly SfxId[];

export const AUDIO_REGISTRY: SfxRegistry = {
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
};
