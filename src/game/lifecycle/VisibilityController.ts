import type { GameMode } from '../core/GameMode';
import { LifecyclePauseCoordinator } from './LifecyclePauseCoordinator';

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
  private awaitingConfirmation = false;
  private readonly coordinator: LifecyclePauseCoordinator;

  constructor(
    private readonly session: VisibilitySessionPort,
    private readonly runtime: VisibilityRuntimePort = NOOP_RUNTIME,
    _resumeAllowed: () => boolean = () => true,
    coordinator?: LifecyclePauseCoordinator,
  ) {
    this.coordinator = coordinator ?? new LifecyclePauseCoordinator(session, runtime);
  }

  get needsConfirmation(): boolean {
    return this.awaitingConfirmation;
  }

  hidden(): void {
    const mode = this.session.currentMode();
    if (mode === 'won' || mode === 'lost') return;
    if (!this.coordinator.acquire('visibility')) return;
    this.awaitingConfirmation = false;
    this.runtime.setResumePromptVisible(false);
  }

  visible(): void {
    if (!this.coordinator.has('visibility')) return;
    this.awaitingConfirmation = true;
    this.runtime.setResumePromptVisible(true);
  }

  confirmResume(): void {
    if (!this.awaitingConfirmation || !this.coordinator.has('visibility')) return;
    this.awaitingConfirmation = false;
    this.runtime.setResumePromptVisible(false);
    this.coordinator.release('visibility');
  }

  reset(): void {
    this.coordinator.abandon('visibility');
    this.awaitingConfirmation = false;
    this.runtime.setResumePromptVisible(false);
  }
}
