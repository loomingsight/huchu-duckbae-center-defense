import type { MutePort } from './MutePort';

export interface TopHudModel {
  readonly wave: number;
  readonly simulationMs: number;
}

export interface TopHudSnapshot {
  readonly waveText: string;
  readonly timeText: string;
  readonly muted: boolean;
}

export function formatElapsedTime(simulationMs: number): string {
  if (!Number.isFinite(simulationMs) || simulationMs < 0) {
    throw new RangeError('HUD simulationMs must be finite and non-negative');
  }
  const totalSeconds = Math.floor(simulationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export class TopHud {
  private readonly element: HTMLElement;
  private readonly wave: HTMLElement;
  private readonly time: HTMLElement;
  private readonly mute: HTMLButtonElement;
  private readonly onToggle = (): void => this.mutePort.toggle();
  private readonly unsubscribe: () => void;
  private model: TopHudSnapshot = { waveText: 'WAVE 1/5', timeText: '00:00', muted: false };
  private renderedWaveText: string | null = null;
  private renderedTimeText: string | null = null;
  private renderedMuted: boolean | null = null;
  private destroyed = false;

  constructor(
    parent: HTMLElement,
    documentRef: Document,
    private readonly mutePort: MutePort,
  ) {
    this.element = documentRef.createElement('div');
    this.element.className = 'top-hud';
    this.wave = documentRef.createElement('span');
    this.wave.className = 'top-hud__wave';
    this.time = documentRef.createElement('time');
    this.time.className = 'top-hud__time';
    this.mute = documentRef.createElement('button');
    this.mute.className = 'top-hud__mute';
    this.mute.setAttribute('type', 'button');
    this.mute.addEventListener('click', this.onToggle);
    this.element.append(this.wave, this.time, this.mute);
    parent.appendChild(this.element);
    this.unsubscribe = mutePort.subscribe((muted) => this.renderMute(muted));
    this.renderMute(mutePort.muted());
  }

  render(input: TopHudModel): void {
    if (this.destroyed) return;
    if (!Number.isSafeInteger(input.wave) || input.wave < 1 || input.wave > 5) {
      throw new RangeError('HUD wave must be an integer from 1 to 5');
    }
    const waveText = `WAVE ${input.wave}/5`;
    const timeText = formatElapsedTime(input.simulationMs);
    this.model = { waveText, timeText, muted: this.model.muted };
    if (this.renderedWaveText !== waveText) {
      this.renderedWaveText = waveText;
      this.wave.textContent = waveText;
    }
    if (this.renderedTimeText !== timeText) {
      this.renderedTimeText = timeText;
      this.time.textContent = timeText;
    }
    this.renderMute(this.mutePort.muted());
  }

  snapshot(): TopHudSnapshot {
    return { ...this.model };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.mute.removeEventListener('click', this.onToggle);
    this.unsubscribe();
    this.element.remove();
  }

  private renderMute(muted: boolean): void {
    this.model = { ...this.model, muted };
    if (this.renderedMuted === muted) return;
    this.renderedMuted = muted;
    this.mute.textContent = muted ? '소리 켜기' : '음소거';
    this.mute.setAttribute('aria-pressed', String(muted));
  }
}
