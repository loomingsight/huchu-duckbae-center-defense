import type { SkillPurchaseResult } from '../progression/ProgressionTypes';
import { skillPurchaseCost } from '../progression/ProgressionSystem';
import type { PurchasableSkillId, SkillCost } from '../types/GameTypes';
import { SKILL_COPY, skillIconSvg } from './SkillIconSvg';

export interface SkillDockState {
  readonly snacks: number;
  readonly nextSkillCost: SkillCost | null;
  readonly learnedSkills: Readonly<Record<PurchasableSkillId, boolean>>;
}

export interface DockButtonModel {
  readonly id: PurchasableSkillId;
  readonly skillId: PurchasableSkillId;
  readonly name: string;
  readonly cost: SkillCost | null;
  readonly learned: boolean;
  readonly affordable: boolean;
  readonly queued: boolean;
  readonly snacks: number;
}

export function dockButtons(
  state: SkillDockState,
  queuedSkillId: PurchasableSkillId | null = null,
): readonly DockButtonModel[] {
  return (['tailSwipe', 'aquaBeam', 'safetyReport'] as const).map((id) => {
    const learned = state.learnedSkills[id];
    const cost = skillPurchaseCost(id, state.nextSkillCost);
    return {
      id,
      skillId: id,
      name: SKILL_COPY[id].name,
      cost,
      learned,
      affordable: !learned && cost !== null && state.snacks >= cost,
      queued: queuedSkillId === id,
      snacks: state.snacks,
    };
  });
}

export class SkillDock {
  private readonly element: HTMLElement;
  private readonly snack: HTMLElement;
  private readonly views: readonly ButtonView[];
  private state: SkillDockState | null = null;
  private models: readonly DockButtonModel[] = [];
  private readonly rendered = new Map<PurchasableSkillId, RenderedButtonState>();
  private queuedSkillId: PurchasableSkillId | null = null;
  private snackCount: number | null = null;
  private destroyed = false;

  constructor(
    parent: HTMLElement,
    documentRef: Document,
    private readonly queuePurchase: (skillId: PurchasableSkillId) => SkillPurchaseResult,
  ) {
    this.element = documentRef.createElement('div');
    this.element.className = 'skill-dock';
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', '간식 기술 습득');
    this.snack = documentRef.createElement('div');
    this.snack.className = 'skill-dock__snacks';
    this.renderSnackCount(0);
    this.views = (['tailSwipe', 'aquaBeam', 'safetyReport'] as const).map((skillId) => {
      const button = documentRef.createElement('button');
      button.setAttribute('type', 'button');
      button.setAttribute('aria-label', SKILL_COPY[skillId].name);
      button.dataset.skill = skillId;
      const icon = documentRef.createElement('span');
      icon.className = 'skill-dock__icon';
      icon.innerHTML = skillIconSvg(SKILL_COPY[skillId].icon);
      const name = documentRef.createElement('span');
      name.textContent = SKILL_COPY[skillId].name;
      const status = documentRef.createElement('small');
      button.append(icon, name, status);
      const onClick = (): void => this.activate(skillId);
      button.addEventListener('click', onClick);
      return { skillId, button, status, onClick };
    });
    this.element.append(this.snack, ...this.views.map(({ button }) => button));
    parent.appendChild(this.element);
  }

  render(state: SkillDockState): void {
    if (this.destroyed) return;
    this.state = state;
    if (this.queuedSkillId !== null && state.learnedSkills[this.queuedSkillId]) {
      this.queuedSkillId = null;
    }
    this.models = dockButtons(state, this.queuedSkillId);
    this.renderSnackCount(state.snacks);
    this.views.forEach((view, index) => {
      const model = this.models[index]!;
      this.renderButton(view, {
        disabled: model.learned || model.queued || !model.affordable,
        affordable: model.affordable,
        queued: model.queued,
        learned: model.learned,
        accessibleName: accessibleName(model),
        status: model.learned ? '배움'
          : model.queued ? '처리 중' : `${model.cost ?? '-'}개`,
      });
    });
  }

  resolve(skillId: PurchasableSkillId): void {
    if (this.queuedSkillId === skillId) this.queuedSkillId = null;
  }

  snapshot(): readonly DockButtonModel[] {
    return this.models.map((model) => ({ ...model }));
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
    this.views.forEach((view) => {
      this.renderButton(view, {
        disabled: true,
        affordable: false,
        queued: false,
        learned: false,
        accessibleName: `${SKILL_COPY[view.skillId].name}, 비용 미정, 잠김`,
        status: '-',
      });
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.views.forEach(({ button, onClick }) => {
      button.removeEventListener('click', onClick);
    });
    this.element.remove();
    this.models = [];
    this.state = null;
    this.queuedSkillId = null;
    this.snackCount = null;
    this.rendered.clear();
  }

  private renderSnackCount(snacks: number): void {
    if (this.snackCount === snacks) return;
    this.snackCount = snacks;
    this.snack.textContent = `간식\n${snacks}`;
    this.snack.setAttribute('aria-label', `보유 간식 ${snacks}개`);
  }

  private renderButton(view: ButtonView, next: RenderedButtonState): void {
    const previous = this.rendered.get(view.skillId);
    if (previous?.disabled !== next.disabled) view.button.disabled = next.disabled;
    if (previous?.affordable !== next.affordable) {
      view.button.dataset.affordable = String(next.affordable);
    }
    if (previous?.queued !== next.queued) {
      view.button.dataset.queued = String(next.queued);
    }
    if (previous?.learned !== next.learned) {
      view.button.dataset.learned = String(next.learned);
    }
    if (previous?.accessibleName !== next.accessibleName) {
      view.button.setAttribute('aria-label', next.accessibleName);
    }
    if (previous?.status !== next.status) view.status.textContent = next.status;
    this.rendered.set(view.skillId, next);
  }

  private activate(skillId: PurchasableSkillId): void {
    if (this.destroyed || this.state === null || this.queuedSkillId !== null) return;
    const model = this.models.find(({ id }) => id === skillId);
    if (model === undefined || model.learned || !model.affordable || model.queued) return;
    const result = this.queuePurchase(skillId);
    if (result.status !== 'queued') return;
    this.queuedSkillId = skillId;
    this.render(this.state);
  }
}

interface ButtonView {
  readonly skillId: PurchasableSkillId;
  readonly button: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly onClick: () => void;
}

interface RenderedButtonState {
  readonly disabled: boolean;
  readonly affordable: boolean;
  readonly queued: boolean;
  readonly learned: boolean;
  readonly accessibleName: string;
  readonly status: string;
}

function accessibleName(model: DockButtonModel): string {
  if (model.learned) return `${model.name}, 배움, 자동 시전`;
  if (model.queued) return `${model.name}, 처리 중`;
  if (model.cost === null) return `${model.name}, 비용 미정, 잠김`;
  return `${model.name}, 간식 ${model.cost}개, ${model.affordable ? '배울 수 있음' : '잠김'}`;
}
