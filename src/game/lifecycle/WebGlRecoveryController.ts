import type { VisibilitySessionPort } from './VisibilityController';
import { LifecyclePauseCoordinator } from './LifecyclePauseCoordinator';

interface WebGlRecoveryState {
  available: boolean;
  generation: number;
}

const recoveryStates = new WeakMap<EventTarget, WebGlRecoveryState>();

function recoveryStateFor(target: EventTarget, initialAvailable: boolean): WebGlRecoveryState {
  const existing = recoveryStates.get(target);
  if (existing !== undefined) {
    if (!initialAvailable) existing.available = false;
    return existing;
  }
  const state = { available: initialAvailable, generation: 0 };
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
    return this.recoveryState.available;
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
      !this.recoveryState.available
      || !this.needsConfirmation
      || generation !== this.recoveryState.generation
      || this.promptGeneration !== this.recoveryState.generation
      || !this.coordinator.has('webgl')
    ) return;
    this.restoreMode();
  }

  beginSession(): void {
    if (this.recoveryState.available) return;
    this.needsConfirmation = false;
    this.promptGeneration = undefined;
    this.runtime.setRestorePromptVisible(false);
    this.runtime.setContextLostVisible?.(true);
    this.runtime.setCanvasInputEnabled?.(false);
    this.coordinator.acquire('webgl');
  }

  reset(): void {
    this.coordinator.abandon('webgl');
    this.recoveryState.generation += 1;
    this.promptGeneration = undefined;
    this.needsConfirmation = false;
    this.runtime.setRestorePromptVisible(false);
    this.runtime.setContextLostVisible?.(false);
    this.runtime.setCanvasInputEnabled?.(this.recoveryState.available);
  }

  private readonly onLost = (event: Event): void => {
    event.preventDefault();
    this.recoveryState.available = false;
    this.recoveryState.generation += 1;
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
    this.recoveryState.available = true;
    this.runtime.setContextLostVisible?.(false);
    if (!this.coordinator.has('webgl')) return;
    if (this.coordinator.originalMode === 'skillSelection') {
      this.restoreMode();
      return;
    }
    this.promptGeneration = this.recoveryState.generation;
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
