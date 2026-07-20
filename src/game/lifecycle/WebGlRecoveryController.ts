import type { GameMode } from '../core/GameMode';
import type { VisibilitySessionPort } from './VisibilityController';

export interface WebGlRuntimePort {
  setWorldPaused(paused: boolean): void;
  setRestorePromptVisible(visible: boolean): void;
  setContextLostVisible?(visible: boolean): void;
  setCanvasInputEnabled?(enabled: boolean): void;
  resyncView(): void;
}

export class WebGlRecoveryController {
  private returnMode: GameMode | null = null;
  private attached = false;
  private available = true;
  needsConfirmation = false;

  constructor(
    private readonly target: EventTarget,
    private readonly session: VisibilitySessionPort,
    private readonly runtime: WebGlRuntimePort,
  ) {}

  get contextAvailable(): boolean {
    return this.available;
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

  confirmRestore(): void {
    if (!this.needsConfirmation || this.returnMode === null) return;
    this.restoreMode(this.returnMode);
  }

  reset(): void {
    this.returnMode = null;
    this.needsConfirmation = false;
    this.runtime.setRestorePromptVisible(false);
    this.runtime.setContextLostVisible?.(false);
    this.runtime.setCanvasInputEnabled?.(this.available);
  }

  private readonly onLost = (event: Event): void => {
    event.preventDefault();
    this.available = false;
    this.runtime.setCanvasInputEnabled?.(false);
    const mode = this.session.currentMode();
    if (mode === 'visibilityPause' || mode === 'won' || mode === 'lost') return;
    this.returnMode = mode;
    this.needsConfirmation = false;
    this.runtime.setRestorePromptVisible(false);
    this.runtime.setContextLostVisible?.(true);
    this.runtime.setWorldPaused(true);
    this.session.requestVisibilityPause();
  };

  private readonly onRestored = (): void => {
    this.available = true;
    this.runtime.setCanvasInputEnabled?.(true);
    this.runtime.setContextLostVisible?.(false);
    if (this.returnMode === null) return;
    if (this.returnMode === 'skillSelection') {
      this.restoreMode('skillSelection');
      return;
    }
    this.needsConfirmation = true;
    this.runtime.setRestorePromptVisible(true);
  };

  private restoreMode(expectedMode: GameMode): void {
    this.returnMode = null;
    this.needsConfirmation = false;
    this.runtime.setRestorePromptVisible(false);
    this.runtime.resyncView();
    this.session.requestVisibilityResume();
    const restoredMode = this.session.currentMode();
    if (restoredMode !== expectedMode) {
      throw new Error(`Expected to restore ${expectedMode}, got ${restoredMode}`);
    }
    this.runtime.setWorldPaused(expectedMode !== 'playing');
  }
}
