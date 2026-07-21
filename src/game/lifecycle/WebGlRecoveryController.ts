import type { VisibilitySessionPort } from './VisibilityController';
import { LifecyclePauseCoordinator } from './LifecyclePauseCoordinator';

interface WebGlRecoveryState {
  phase: 'lost' | 'restoredAwaitingConfirmation' | 'confirmed';
  recoveryGeneration: number;
  confirmationToken: number;
}

const recoveryStates = new WeakMap<EventTarget, WebGlRecoveryState>();

function recoveryStateFor(target: EventTarget, initialAvailable: boolean): WebGlRecoveryState {
  const existing = recoveryStates.get(target);
  if (existing !== undefined) {
    if (!initialAvailable && existing.phase !== 'lost') {
      existing.phase = 'lost';
      existing.recoveryGeneration += 1;
      existing.confirmationToken += 1;
    }
    return existing;
  }
  const state: WebGlRecoveryState = {
    phase: initialAvailable ? 'confirmed' : 'lost',
    recoveryGeneration: initialAvailable ? 0 : 1,
    confirmationToken: 0,
  };
  recoveryStates.set(target, state);
  return state;
}

export interface WebGlRuntimePort {
  setWorldPaused(paused: boolean): void;
  setRestorePromptVisible(visible: boolean): void;
  setContextLostVisible?(visible: boolean): void;
  setCanvasInputEnabled?(enabled: boolean): void;
  resyncView(): void;
}

export class WebGlRecoveryController {
  private attached = false;
  private promptGeneration: number | undefined;
  private readonly coordinator: LifecyclePauseCoordinator;
  private readonly recoveryState: WebGlRecoveryState;
  needsConfirmation = false;

  constructor(
    private readonly target: EventTarget,
    private readonly session: VisibilitySessionPort,
    private readonly runtime: WebGlRuntimePort,
    coordinator?: LifecyclePauseCoordinator,
    initialAvailable = true,
  ) {
    this.coordinator = coordinator ?? new LifecyclePauseCoordinator(session, runtime);
    this.recoveryState = recoveryStateFor(target, initialAvailable);
  }

  get contextAvailable(): boolean {
    return this.recoveryState.phase !== 'lost';
  }

  get confirmationGeneration(): number | undefined {
    return this.promptGeneration;
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.target.addEventListener('webglcontextlost', this.onLost);
    this.target.addEventListener('webglcontextrestored', this.onRestored);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.target.removeEventListener('webglcontextlost', this.onLost);
    this.target.removeEventListener('webglcontextrestored', this.onRestored);
  }

  confirmRestore(generation = this.promptGeneration): void {
    if (
      this.recoveryState.phase !== 'restoredAwaitingConfirmation'
      || !this.needsConfirmation
      || generation !== this.recoveryState.confirmationToken
      || this.promptGeneration !== this.recoveryState.confirmationToken
      || !this.coordinator.has('webgl')
    ) return;
    this.restoreMode();
  }

  beginSession(): void {
    if (this.recoveryState.phase === 'confirmed') return;
    this.needsConfirmation = false;
    this.promptGeneration = undefined;
    this.runtime.setCanvasInputEnabled?.(false);
    if (!this.coordinator.acquire('webgl')) return;
    if (this.recoveryState.phase === 'lost') {
      this.runtime.setRestorePromptVisible(false);
      this.runtime.setContextLostVisible?.(true);
      return;
    }
    this.runtime.setContextLostVisible?.(false);
    this.showRestorePrompt();
  }

  reset(): void {
    this.coordinator.abandon('webgl');
    this.promptGeneration = undefined;
    this.needsConfirmation = false;
    this.runtime.setRestorePromptVisible(false);
    this.runtime.setContextLostVisible?.(false);
    this.runtime.setCanvasInputEnabled?.(this.recoveryState.phase === 'confirmed');
  }

  private readonly onLost = (event: Event): void => {
    event.preventDefault();
    this.recoveryState.phase = 'lost';
    this.recoveryState.recoveryGeneration += 1;
    this.recoveryState.confirmationToken += 1;
    this.promptGeneration = undefined;
    this.needsConfirmation = false;
    this.runtime.setCanvasInputEnabled?.(false);
    this.runtime.setRestorePromptVisible(false);
    this.runtime.setContextLostVisible?.(true);
    const alreadyOwned = this.coordinator.has('webgl');
    if (!this.coordinator.acquire('webgl')) return;
    if (alreadyOwned) return;
  };

  private readonly onRestored = (): void => {
    this.recoveryState.phase = 'restoredAwaitingConfirmation';
    this.runtime.setContextLostVisible?.(false);
    if (!this.coordinator.has('webgl')) return;
    this.showRestorePrompt();
  };

  private showRestorePrompt(): void {
    this.recoveryState.confirmationToken += 1;
    this.promptGeneration = this.recoveryState.confirmationToken;
    this.needsConfirmation = true;
    this.runtime.setRestorePromptVisible(true);
  }

  private restoreMode(): void {
    this.recoveryState.phase = 'confirmed';
    this.needsConfirmation = false;
    this.promptGeneration = undefined;
    this.runtime.setRestorePromptVisible(false);
    this.coordinator.release('webgl', () => this.runtime.resyncView());
  }
}
