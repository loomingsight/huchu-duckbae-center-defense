import type { VisibilitySessionPort } from './VisibilityController';
import { LifecyclePauseCoordinator } from './LifecyclePauseCoordinator';

export interface WebGlRuntimePort {
  setWorldPaused(paused: boolean): void;
  setRestorePromptVisible(visible: boolean): void;
  setContextLostVisible?(visible: boolean): void;
  setCanvasInputEnabled?(enabled: boolean): void;
  resyncView(): void;
}

export class WebGlRecoveryController {
  private attached = false;
  private available = true;
  private recoveryGeneration = 0;
  private promptGeneration: number | undefined;
  private readonly coordinator: LifecyclePauseCoordinator;
  needsConfirmation = false;

  constructor(
    private readonly target: EventTarget,
    private readonly session: VisibilitySessionPort,
    private readonly runtime: WebGlRuntimePort,
    coordinator?: LifecyclePauseCoordinator,
  ) {
    this.coordinator = coordinator ?? new LifecyclePauseCoordinator(session, runtime);
  }

  get contextAvailable(): boolean {
    return this.available;
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
      !this.available
      || !this.needsConfirmation
      || generation !== this.recoveryGeneration
      || this.promptGeneration !== this.recoveryGeneration
      || !this.coordinator.has('webgl')
    ) return;
    this.restoreMode();
  }

  beginSession(): void {
    if (this.available) return;
    this.needsConfirmation = false;
    this.promptGeneration = undefined;
    this.runtime.setRestorePromptVisible(false);
    this.runtime.setContextLostVisible?.(true);
    this.runtime.setCanvasInputEnabled?.(false);
    this.coordinator.acquire('webgl');
  }

  reset(): void {
    this.coordinator.abandon('webgl');
    this.recoveryGeneration += 1;
    this.promptGeneration = undefined;
    this.needsConfirmation = false;
    this.runtime.setRestorePromptVisible(false);
    this.runtime.setContextLostVisible?.(false);
    this.runtime.setCanvasInputEnabled?.(this.available);
  }

  private readonly onLost = (event: Event): void => {
    event.preventDefault();
    this.available = false;
    this.recoveryGeneration += 1;
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
    this.available = true;
    this.runtime.setCanvasInputEnabled?.(true);
    this.runtime.setContextLostVisible?.(false);
    if (!this.coordinator.has('webgl')) return;
    if (this.coordinator.originalMode === 'skillSelection') {
      this.restoreMode();
      return;
    }
    this.promptGeneration = this.recoveryGeneration;
    this.needsConfirmation = true;
    this.runtime.setRestorePromptVisible(true);
  };

  private restoreMode(): void {
    this.needsConfirmation = false;
    this.promptGeneration = undefined;
    this.runtime.setRestorePromptVisible(false);
    this.coordinator.release('webgl', () => this.runtime.resyncView());
  }
}
