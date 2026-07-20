import type { GameMode } from '../core/GameMode';

export interface VisibilitySessionPort {
  currentMode(): GameMode;
  requestVisibilityPause(): void;
  requestVisibilityResume(): void;
}

export interface VisibilityRuntimePort {
  setWorldPaused(paused: boolean): void;
  setResumePromptVisible(visible: boolean): void;
}

const NOOP_RUNTIME: VisibilityRuntimePort = {
  setWorldPaused: () => undefined,
  setResumePromptVisible: () => undefined,
};

export class VisibilityController {
  private returnMode: GameMode | null = null;
  private awaitingConfirmation = false;

  constructor(
    private readonly session: VisibilitySessionPort,
    private readonly runtime: VisibilityRuntimePort = NOOP_RUNTIME,
    private readonly resumeAllowed: () => boolean = () => true,
  ) {}

  get needsConfirmation(): boolean {
    return this.awaitingConfirmation;
  }

  hidden(): void {
    const mode = this.session.currentMode();
    if (mode === 'visibilityPause' || mode === 'won' || mode === 'lost') return;
    this.returnMode = mode;
    this.awaitingConfirmation = false;
    this.runtime.setResumePromptVisible(false);
    this.runtime.setWorldPaused(true);
    this.session.requestVisibilityPause();
  }

  visible(): void {
    if (this.session.currentMode() !== 'visibilityPause' || this.returnMode === null) return;
    if (this.returnMode === 'skillSelection') {
      this.restoreMode('skillSelection');
      return;
    }
    this.awaitingConfirmation = true;
    this.runtime.setResumePromptVisible(true);
  }

  confirmResume(): void {
    if (!this.awaitingConfirmation || this.returnMode === null) return;
    if (!this.resumeAllowed()) return;
    this.restoreMode(this.returnMode);
  }

  reset(): void {
    this.returnMode = null;
    this.awaitingConfirmation = false;
    this.runtime.setResumePromptVisible(false);
  }

  private restoreMode(expectedMode: GameMode): void {
    this.returnMode = null;
    this.awaitingConfirmation = false;
    this.runtime.setResumePromptVisible(false);
    this.session.requestVisibilityResume();
    const resumedMode = this.session.currentMode();
    if (resumedMode !== expectedMode) {
      throw new Error(`Expected to resume ${expectedMode}, got ${resumedMode}`);
    }
    this.runtime.setWorldPaused(expectedMode !== 'playing');
  }
}
