import type { AudioSystem } from '../audio/AudioSystem';
import type { HuchuAudioTestProbe } from './TestContract';

export function installE2eTitleAudioProbe(audio: AudioSystem): HuchuAudioTestProbe {
  if (import.meta.env.MODE !== 'e2e') {
    throw new Error('E2E title audio probe is only available in e2e mode');
  }
  const probe: HuchuAudioTestProbe = {
    ready: Promise.resolve(),
    snapshot: () => audio.snapshot(),
  };
  window.__HUCHU_AUDIO_TEST__ = probe;
  return probe;
}
