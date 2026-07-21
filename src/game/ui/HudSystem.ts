import { VirtualJoystick } from '../player/VirtualJoystick';
import type { SkillPurchaseResult } from '../progression/ProgressionTypes';
import type { RunSnapshot, WaveNumber } from '../session/RunSnapshot';
import type { ShelterVisualState } from '../shelter/ShelterTypes';
import type { PurchasableSkillId } from '../types/GameTypes';
import { AutoSkillHud, type AutoSkillRow } from './AutoSkillHud';
import { NOOP_MUTE_PORT, type MutePort } from './MutePort';
import { SkillDock, type DockButtonModel } from './SkillDock';
import { SKILL_COPY } from './SkillIconSvg';
import { shelterVisualState } from './ShelterHpView';
import { TopHud } from './TopHud';

const AFFORDABLE_TOAST_MS = 1200;
const LEARNED_TOAST_MS = 1000;

export interface HudSnapshot {
  readonly wave: WaveNumber;
  readonly timeText: string;
  readonly snacks: number;
  readonly shelter: {
    readonly current: number;
    readonly maximum: 1000;
    readonly visual: ShelterVisualState;
  };
  readonly autoSkills: readonly AutoSkillRow[];
  readonly dock: readonly DockButtonModel[];
  readonly muted: boolean;
  readonly toast: string | null;
}

export interface HudSystemOptions {
  readonly root: HTMLElement;
  readonly queueSkillPurchase: (skillId: PurchasableSkillId) => SkillPurchaseResult;
  readonly mutePort?: MutePort;
  readonly document?: Document;
}

export class HudSystem {
  readonly joystick: VirtualJoystick;
  private readonly overlay: HTMLElement;
  private readonly top: TopHud;
  private readonly autoSkills: AutoSkillHud;
  private readonly dock: SkillDock;
  private readonly toast: HTMLElement;
  private toastText: string | null = null;
  private toastRemainingMs = 0;
  private hadAffordable = false;
  private lastRun: RunSnapshot | null = null;
  private destroyed = false;

  constructor(options: HudSystemOptions) {
    const documentRef = options.document ?? document;
    this.overlay = documentRef.createElement('div');
    this.overlay.className = 'hud-overlay';
    this.overlay.dataset.active = 'true';
    options.root.appendChild(this.overlay);
    this.top = new TopHud(this.overlay, documentRef, options.mutePort ?? NOOP_MUTE_PORT);
    this.autoSkills = new AutoSkillHud(this.overlay, documentRef);
    this.dock = new SkillDock(this.overlay, documentRef, options.queueSkillPurchase);
    this.joystick = new VirtualJoystick(this.overlay, documentRef);
    this.toast = documentRef.createElement('div');
    this.toast.className = 'hud-toast';
    this.toast.setAttribute('role', 'status');
    this.toast.setAttribute('aria-live', 'polite');
    this.overlay.appendChild(this.toast);
  }

  render(run: RunSnapshot): void {
    if (this.destroyed) return;
    this.lastRun = run;
    this.top.render({ wave: run.wave, simulationMs: run.simulationMs });
    this.autoSkills.render(run);
    this.dock.render(run);
    const affordable = this.dock.hasAffordableSkill();
    if (affordable && !this.hadAffordable) this.showToast('배울 수 있어요', AFFORDABLE_TOAST_MS);
    this.hadAffordable = affordable;
  }

  step(stepMs: number): void {
    if (!Number.isFinite(stepMs) || stepMs < 0) {
      throw new RangeError('HUD step must be finite and non-negative');
    }
    if (this.destroyed || this.toastRemainingMs === 0) return;
    this.toastRemainingMs = Math.max(0, this.toastRemainingMs - stepMs);
    if (this.toastRemainingMs === 0) this.showToast(null, 0);
  }

  showLearned(skillId: PurchasableSkillId, run: RunSnapshot): void {
    if (this.destroyed) return;
    this.dock.resolve(skillId);
    this.render(run);
    this.showToast(`${SKILL_COPY[skillId].name} 습득!`, LEARNED_TOAST_MS);
  }

  reset(): void {
    if (this.destroyed) return;
    this.hadAffordable = false;
    this.dock.reset();
    this.showToast(null, 0);
  }

  setActive(active: boolean): void {
    if (this.destroyed) return;
    this.overlay.dataset.active = String(active);
    this.joystick.setEnabled(active);
  }

  snapshot(): HudSnapshot {
    const run = this.lastRun;
    if (run === null) throw new Error('HUD snapshot requires an initial render');
    const top = this.top.snapshot();
    return {
      wave: run.wave,
      timeText: top.timeText,
      snacks: run.snacks,
      shelter: {
        current: run.shelterHp,
        maximum: run.shelterMaxHp,
        visual: shelterVisualState(run.shelterHp, run.shelterMaxHp),
      },
      autoSkills: this.autoSkills.snapshot(),
      dock: this.dock.snapshot(),
      muted: top.muted,
      toast: this.toastText,
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.top.destroy();
    this.autoSkills.destroy();
    this.dock.destroy();
    this.joystick.destroy();
    this.toast.remove();
    this.overlay.remove();
    this.toastText = null;
    this.toastRemainingMs = 0;
    this.lastRun = null;
  }

  private showToast(text: string | null, durationMs: number): void {
    this.toastText = text;
    this.toastRemainingMs = durationMs;
    this.toast.textContent = text ?? '';
    this.toast.dataset.visible = String(text !== null);
  }
}
