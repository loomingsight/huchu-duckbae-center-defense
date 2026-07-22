import type { CompanionSnapshot } from '../companions/CompanionSystem';
import { skillIconSvg } from './SkillIconSvg';

export interface CompanionStatusSnapshot {
  readonly label: '덕배 · 자동';
  readonly ready: boolean;
}

export function companionStatus(companion: CompanionSnapshot): CompanionStatusSnapshot {
  return {
    label: '덕배 · 자동',
    ready: companion.active && companion.cooldownRemainingMs === 0,
  };
}

export class CompanionStatusHud {
  private readonly element: HTMLElement;
  private readonly label: HTMLElement;
  private model: CompanionStatusSnapshot = { label: '덕배 · 자동', ready: true };
  private renderedReady: boolean | null = null;
  private destroyed = false;

  constructor(parent: HTMLElement, documentRef: Document = document) {
    this.element = documentRef.createElement('div');
    this.element.className = 'companion-status';
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-label', this.model.label);
    const icon = documentRef.createElement('span');
    icon.className = 'companion-status__icon';
    icon.innerHTML = skillIconSvg('deokbae');
    this.label = documentRef.createElement('span');
    this.label.textContent = this.model.label;
    this.element.append(icon, this.label);
    parent.appendChild(this.element);
  }

  render(companion: CompanionSnapshot): void {
    if (this.destroyed) return;
    this.model = companionStatus(companion);
    if (this.renderedReady !== this.model.ready) {
      this.renderedReady = this.model.ready;
      this.element.dataset.ready = String(this.model.ready);
    }
  }

  snapshot(): CompanionStatusSnapshot {
    return { ...this.model };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.element.remove();
  }
}
