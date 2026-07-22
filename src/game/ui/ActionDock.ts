import type { PlayerActionQueueResult } from '../player/PlayerActionGate';
import type { SkillPurchaseResult } from '../progression/ProgressionTypes';
import { skillPurchaseCost } from '../progression/ProgressionSystem';
import type { RunSnapshot } from '../session/RunSnapshot';
import type { PlayerActionId, PurchasableSkillId, SkillCost } from '../types/GameTypes';
import { ACTION_COPY, skillIconSvg } from './SkillIconSvg';

const ACTION_IDS = [
  'bark',
  'tailSwipe',
  'aquaBeam',
  'safetyReport',
] as const satisfies readonly PlayerActionId[];
const ACCEPTED_FEEDBACK_MS = 120;

export type ActionButtonMode = 'cast' | 'buy' | 'locked' | 'queued' | 'cooldown';

export interface ActionButtonModel {
  readonly id: PlayerActionId;
  readonly name: string;
  readonly mode: ActionButtonMode;
  readonly disabled: boolean;
  readonly affordable: boolean;
  readonly cost: SkillCost | null;
  readonly cooldownAngleDeg: number;
  readonly remainingSeconds: number;
  readonly accessibleName: string;
}

export interface ActionDockSnapshot {
  readonly snacks: number;
  readonly buttons: readonly ActionButtonModel[];
}

type ActionDockState = Pick<
  RunSnapshot,
  'snacks' | 'nextSkillCost' | 'learnedSkills' | 'actionStates'
>;

export function actionButtons(
  state: ActionDockState,
  queuedSkillId: PurchasableSkillId | null = null,
): readonly ActionButtonModel[] {
  return ACTION_IDS.map((id) => actionButton(state, id, queuedSkillId));
}

export class ActionDock {
  private readonly element: HTMLElement;
  private readonly snack: HTMLElement;
  private readonly views: readonly ActionButtonView[];
  private readonly rendered = new Map<PlayerActionId, RenderedButtonState>();
  private state: ActionDockState | null = null;
  private models: readonly ActionButtonModel[] = [];
  private queuedSkillId: PurchasableSkillId | null = null;
  private snackCount: number | null = null;
  private destroyed = false;

  constructor(
    parent: HTMLElement,
    documentRef: Document,
    private readonly queuePurchase: (skillId: PurchasableSkillId) => SkillPurchaseResult,
    private readonly queueAction: (actionId: PlayerActionId) => PlayerActionQueueResult,
    private readonly onAcceptedInput: (actionId: PlayerActionId) => void = () => undefined,
  ) {
    this.element = documentRef.createElement('div');
    this.element.className = 'action-dock';
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', '후추 기술');
    this.snack = documentRef.createElement('div');
    this.snack.className = 'action-dock__snacks';
    this.renderSnackCount(0);
    this.views = ACTION_IDS.map((actionId) => {
      const copy = ACTION_COPY[actionId];
      const button = documentRef.createElement('button');
      button.className = 'action-button';
      button.setAttribute('type', 'button');
      button.dataset.action = actionId;
      const icon = documentRef.createElement('span');
      icon.className = 'action-button__icon';
      icon.innerHTML = skillIconSvg(copy.icon);
      const name = documentRef.createElement('span');
      name.className = 'action-button__name';
      name.textContent = copy.name;
      const status = documentRef.createElement('small');
      status.className = 'action-button__status';
      const remaining = documentRef.createElement('span');
      remaining.className = 'action-button__remaining';
      const cooldown = documentRef.createElement('span');
      cooldown.className = 'action-button__cooldown';
      button.append(icon, name, status, remaining, cooldown);
      let activePointerId: number | null = null;
      const onPointerDown = (event: PointerEvent): void => {
        if (activePointerId !== null || button.disabled) return;
        event.preventDefault();
        event.stopPropagation();
        activePointerId = event.pointerId;
        button.setPointerCapture?.(event.pointerId);
        this.activate(actionId);
      };
      const releasePointer = (event: PointerEvent, releaseCapture = true): void => {
        if (event.pointerId !== activePointerId) return;
        event.preventDefault();
        event.stopPropagation();
        if (releaseCapture && button.hasPointerCapture?.(event.pointerId)) {
          button.releasePointerCapture(event.pointerId);
        }
        activePointerId = null;
      };
      const onPointerUp = (event: PointerEvent): void => releasePointer(event);
      const onPointerCancel = (event: PointerEvent): void => releasePointer(event);
      const onLostPointerCapture = (event: PointerEvent): void => releasePointer(event, false);
      const onClick = (event: MouseEvent): void => {
        if (event.detail !== 0) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        this.activate(actionId);
      };
      button.addEventListener('pointerdown', onPointerDown);
      button.addEventListener('pointerup', onPointerUp);
      button.addEventListener('pointercancel', onPointerCancel);
      button.addEventListener('lostpointercapture', onLostPointerCapture);
      button.addEventListener('click', onClick);
      return {
        actionId,
        button,
        status,
        remaining,
        onPointerDown,
        onPointerUp,
        onPointerCancel,
        onLostPointerCapture,
        onClick,
        feedbackRemainingMs: 0,
        clearPointer: () => {
          if (activePointerId !== null && button.hasPointerCapture?.(activePointerId)) {
            button.releasePointerCapture(activePointerId);
          }
          activePointerId = null;
        },
      };
    });
    this.element.append(this.snack, ...this.views.map(({ button }) => button));
    parent.appendChild(this.element);
  }

  render(state: ActionDockState): void {
    if (this.destroyed) return;
    this.state = state;
    if (this.queuedSkillId !== null && state.learnedSkills[this.queuedSkillId]) {
      this.queuedSkillId = null;
    }
    this.models = actionButtons(state, this.queuedSkillId);
    this.renderSnackCount(state.snacks);
    this.views.forEach((view, index) => this.renderButton(view, this.models[index]!));
  }

  resolve(skillId: PurchasableSkillId): void {
    if (this.queuedSkillId === skillId) this.queuedSkillId = null;
  }

  snapshot(): ActionDockSnapshot {
    return {
      snacks: this.state?.snacks ?? 0,
      buttons: this.models.map((model) => ({ ...model })),
    };
  }

  hasAffordableSkill(): boolean {
    return this.models.some(({ affordable }) => affordable);
  }

  reset(): void {
    if (this.destroyed) return;
    this.state = null;
    this.models = [];
    this.queuedSkillId = null;
    this.renderSnackCount(0);
    this.rendered.clear();
    this.views.forEach((view) => {
      const model = emptyButtonModel(view.actionId);
      this.renderButton(view, model);
    });
  }

  clearInput(): void {
    if (this.destroyed) return;
    this.views.forEach((view) => {
      view.clearPointer();
      this.clearAcceptedFeedback(view);
    });
  }

  step(stepMs: number): void {
    if (this.destroyed) return;
    this.views.forEach((view) => {
      if (view.feedbackRemainingMs === 0) return;
      view.feedbackRemainingMs = Math.max(0, view.feedbackRemainingMs - stepMs);
      if (view.feedbackRemainingMs === 0) view.button.dataset.accepted = 'false';
    });
  }

  showAcceptedFeedback(actionId: PlayerActionId): void {
    if (this.destroyed) return;
    const view = this.views.find((candidate) => candidate.actionId === actionId);
    if (view === undefined) return;
    view.feedbackRemainingMs = ACCEPTED_FEEDBACK_MS;
    view.button.dataset.accepted = 'true';
  }

  destroy(): void {
    if (this.destroyed) return;
    this.clearInput();
    this.destroyed = true;
    this.views.forEach(({
      button,
      onPointerDown,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture,
      onClick,
    }) => {
      button.removeEventListener('pointerdown', onPointerDown);
      button.removeEventListener('pointerup', onPointerUp);
      button.removeEventListener('pointercancel', onPointerCancel);
      button.removeEventListener('lostpointercapture', onLostPointerCapture);
      button.removeEventListener('click', onClick);
    });
    this.element.remove();
    this.state = null;
    this.models = [];
    this.queuedSkillId = null;
    this.rendered.clear();
  }

  private activate(actionId: PlayerActionId): void {
    if (this.destroyed || this.state === null) return;
    const model = this.models.find(({ id }) => id === actionId);
    if (model === undefined || model.disabled) return;
    if (model.mode === 'buy') {
      const skillId = actionId as PurchasableSkillId;
      const result = this.queuePurchase(skillId);
      if (result.status === 'queued') {
        this.queuedSkillId = skillId;
        this.onAcceptedInput(actionId);
        this.render(this.state);
      }
      return;
    }
    if (model.mode === 'cast') this.queueAction(actionId);
  }

  private clearAcceptedFeedback(view: ActionButtonView): void {
    view.feedbackRemainingMs = 0;
    view.button.dataset.accepted = 'false';
  }

  private renderSnackCount(snacks: number): void {
    if (this.snackCount === snacks) return;
    this.snackCount = snacks;
    this.snack.textContent = `간식 ${snacks}`;
    this.snack.setAttribute('aria-label', `보유 간식 ${snacks}개`);
  }

  private renderButton(view: ActionButtonView, model: ActionButtonModel): void {
    const next: RenderedButtonState = {
      mode: model.mode,
      disabled: model.disabled,
      affordable: model.affordable,
      accessibleName: model.accessibleName,
      cooldownAngle: `${model.cooldownAngleDeg}deg`,
      status: buttonStatus(model),
      remaining: model.remainingSeconds === 0 ? '' : String(model.remainingSeconds),
    };
    const previous = this.rendered.get(view.actionId);
    if (previous?.disabled !== next.disabled) {
      if (next.disabled) view.clearPointer();
      view.button.disabled = next.disabled;
    }
    if (previous?.mode !== next.mode) view.button.dataset.mode = next.mode;
    if (previous?.affordable !== next.affordable) {
      view.button.dataset.affordable = String(next.affordable);
    }
    if (previous?.accessibleName !== next.accessibleName) {
      view.button.setAttribute('aria-label', next.accessibleName);
    }
    if (previous?.cooldownAngle !== next.cooldownAngle) {
      view.button.style.setProperty('--cooldown-angle', next.cooldownAngle);
    }
    if (previous?.status !== next.status) view.status.textContent = next.status;
    if (previous?.remaining !== next.remaining) view.remaining.textContent = next.remaining;
    this.rendered.set(view.actionId, next);
  }
}

interface ActionButtonView {
  readonly actionId: PlayerActionId;
  readonly button: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly remaining: HTMLElement;
  readonly onPointerDown: (event: PointerEvent) => void;
  readonly onPointerUp: (event: PointerEvent) => void;
  readonly onPointerCancel: (event: PointerEvent) => void;
  readonly onLostPointerCapture: (event: PointerEvent) => void;
  readonly onClick: (event: MouseEvent) => void;
  readonly clearPointer: () => void;
  feedbackRemainingMs: number;
}

interface RenderedButtonState {
  readonly mode: ActionButtonMode;
  readonly disabled: boolean;
  readonly affordable: boolean;
  readonly accessibleName: string;
  readonly cooldownAngle: string;
  readonly status: string;
  readonly remaining: string;
}

function actionButton(
  state: ActionDockState,
  id: PlayerActionId,
  queuedSkillId: PurchasableSkillId | null,
): ActionButtonModel {
  const copy = ACTION_COPY[id];
  const action = state.actionStates[id];
  const cost = id === 'bark' ? null : skillPurchaseCost(id, state.nextSkillCost);
  const learned = id === 'bark' || state.learnedSkills[id];
  const queued = id !== 'bark' && queuedSkillId === id;
  const affordable = !learned && !queued && cost !== null && state.snacks >= cost;
  const mode: ActionButtonMode = queued
    ? 'queued'
    : learned
      ? action.ready ? 'cast' : 'cooldown'
      : affordable ? 'buy' : 'locked';
  const remainingSeconds = mode === 'cooldown'
    ? Math.ceil(action.cooldownRemainingMs / 1000)
    : 0;
  const cooldownAngleDeg = mode === 'cooldown'
    ? roundedAngle((1 - action.progress) * 360)
    : 0;
  return {
    id,
    name: copy.name,
    mode,
    disabled: mode !== 'cast' && mode !== 'buy',
    affordable,
    cost,
    cooldownAngleDeg,
    remainingSeconds,
    accessibleName: accessibleName(copy.name, mode, cost, remainingSeconds),
  };
}

function emptyButtonModel(id: PlayerActionId): ActionButtonModel {
  const name = ACTION_COPY[id].name;
  return {
    id,
    name,
    mode: 'locked',
    disabled: true,
    affordable: false,
    cost: null,
    cooldownAngleDeg: 0,
    remainingSeconds: 0,
    accessibleName: `${name}, 잠김`,
  };
}

function accessibleName(
  name: string,
  mode: ActionButtonMode,
  cost: SkillCost | null,
  remainingSeconds: number,
): string {
  if (mode === 'cast') return `${name}, 사용 가능`;
  if (mode === 'buy') return `${name}, 간식 ${cost}개로 배우기`;
  if (mode === 'queued') return `${name}, 배우는 중`;
  if (mode === 'cooldown') return `${name}, 쿨타임 ${remainingSeconds}초`;
  return cost === null ? `${name}, 잠김` : `${name}, 간식 ${cost}개 필요`;
}

function buttonStatus(model: ActionButtonModel): string {
  if (model.mode === 'buy') return `${model.cost}개`;
  if (model.mode === 'queued') return '배우는 중';
  if (model.mode === 'locked') return model.cost === null ? '잠김' : `${model.cost}개`;
  return '';
}

function roundedAngle(value: number): number {
  return Math.round(Math.max(0, Math.min(360, value)) * 1000) / 1000;
}
