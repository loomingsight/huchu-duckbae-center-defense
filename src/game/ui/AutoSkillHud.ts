import type { CompanionSnapshot } from '../companions/CompanionSystem';
import type { SkillSnapshot } from '../skills/SkillSystem';
import type { PurchasableSkillId } from '../types/GameTypes';
import { SKILL_COPY, skillIconSvg } from './SkillIconSvg';

export interface AutoSkillState {
  readonly learnedSkills: Readonly<Record<PurchasableSkillId, boolean>>;
  readonly skillStates: Readonly<Record<PurchasableSkillId, SkillSnapshot>>;
  readonly companion: CompanionSnapshot;
}

export interface AutoSkillRow {
  readonly id: 'bark' | 'deokbae' | PurchasableSkillId;
  readonly label: string;
  readonly progress: number;
  readonly ready: boolean;
}

const AUTO_SKILL_SHORT_NAME: Readonly<Record<AutoSkillRow['id'], string>> = {
  bark: '짖기',
  deokbae: '덕배',
  tailSwipe: '꼬리',
  aquaBeam: '아쿠아',
  safetyReport: '신고',
};

export function compactAutoRowLabel(row: AutoSkillRow): string {
  const separator = ' · ';
  const separatorIndex = row.label.indexOf(separator);
  const status = separatorIndex === -1
    ? row.label
    : row.label.slice(separatorIndex + separator.length);
  return `${AUTO_SKILL_SHORT_NAME[row.id]}·${status}`;
}

export function autoRows(state: AutoSkillState): readonly AutoSkillRow[] {
  const rows: AutoSkillRow[] = [
    { id: 'bark', label: '짖기 · 자동', progress: 1, ready: true },
    {
      id: 'deokbae',
      label: '덕배 공격 · 자동',
      progress: state.companion.cooldownRemainingMs === 0 ? 1 : 0,
      ready: state.companion.cooldownRemainingMs === 0,
    },
  ];
  for (const skillId of ['tailSwipe', 'aquaBeam', 'safetyReport'] as const) {
    if (!state.learnedSkills[skillId]) continue;
    const skill = state.skillStates[skillId];
    const suffix = skill.ready ? '준비' : `${Math.ceil(skill.cooldownRemainingMs / 1000)}초`;
    rows.push({
      id: skillId,
      label: `${SKILL_COPY[skillId].name} · ${suffix}`,
      progress: skill.progress,
      ready: skill.ready,
    });
  }
  return rows;
}

export class AutoSkillHud {
  private readonly element: HTMLElement;
  private readonly views: readonly AutoSkillRowView[];
  private rows: readonly AutoSkillRow[] = [];
  private readonly rendered = new Map<AutoSkillRow['id'], RenderedAutoSkillRow>();
  private destroyed = false;

  constructor(parent: HTMLElement, documentRef: Document = document) {
    this.element = documentRef.createElement('div');
    this.element.className = 'auto-skill-hud';
    this.element.setAttribute('role', 'list');
    this.element.setAttribute('aria-label', '자동 기술 상태');
    this.views = (['bark', 'deokbae', 'tailSwipe', 'aquaBeam', 'safetyReport'] as const)
      .map((id) => {
        const row = documentRef.createElement('div');
        row.className = 'auto-skill-row';
        row.setAttribute('role', 'listitem');
        const icon = documentRef.createElement('span');
        icon.className = 'auto-skill-row__icon';
        const iconId = id === 'bark' ? 'bark' : id === 'deokbae'
          ? 'deokbae' : SKILL_COPY[id].icon;
        icon.innerHTML = skillIconSvg(iconId);
        const label = documentRef.createElement('span');
        row.append(icon, label);
        row.dataset.visible = 'false';
        this.element.appendChild(row);
        return { id, row, label };
      });
    parent.appendChild(this.element);
  }

  render(state: AutoSkillState): void {
    if (this.destroyed) return;
    this.rows = autoRows(state);
    const byId = new Map(this.rows.map((row) => [row.id, row]));
    this.views.forEach((view) => {
      const model = byId.get(view.id);
      const next: RenderedAutoSkillRow = {
        visible: model !== undefined,
        ready: model?.ready ?? false,
        label: model?.label ?? '',
        compactLabel: model === undefined ? '' : compactAutoRowLabel(model),
      };
      const previous = this.rendered.get(view.id);
      if (previous?.visible !== next.visible) {
        view.row.dataset.visible = String(next.visible);
      }
      if (previous?.ready !== next.ready) {
        view.row.dataset.ready = String(next.ready);
      }
      if (previous?.label !== next.label) {
        view.row.setAttribute('aria-label', next.label);
      }
      if (previous?.compactLabel !== next.compactLabel) {
        view.label.textContent = next.compactLabel;
      }
      this.rendered.set(view.id, next);
    });
  }

  snapshot(): readonly AutoSkillRow[] {
    return this.rows.map((row) => ({ ...row }));
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.rows = [];
    this.rendered.clear();
    this.element.remove();
  }
}

interface AutoSkillRowView {
  readonly id: AutoSkillRow['id'];
  readonly row: HTMLElement;
  readonly label: HTMLElement;
}

interface RenderedAutoSkillRow {
  readonly visible: boolean;
  readonly ready: boolean;
  readonly label: string;
  readonly compactLabel: string;
}
