import type Phaser from 'phaser';

export interface RuntimeErrorAction {
  readonly label: string;
  readonly onSelect: () => void;
}

export class RuntimeErrorOverlay {
  private element: Phaser.GameObjects.DOMElement | undefined;
  private actionButton: Element | undefined;
  private actionHandler: (() => void) | undefined;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth = 2400,
  ) {}

  show(message: string, detail?: string, action?: RuntimeErrorAction): void {
    this.hide();
    const button = action === undefined
      ? ''
      : `<button type="button" class="primary-game-button">${escapeHtml(action.label)}</button>`;
    const detailMarkup = detail === undefined
      ? ''
      : `<p class="runtime-error-detail">${escapeHtml(detail)}</p>`;
    const element = this.scene.add.dom(270, 480).createFromHTML(
      `<section class="runtime-error-overlay" role="alert"><div class="runtime-error-message">${escapeHtml(message)}</div>${detailMarkup}${button}</section>`,
    ).setDepth(this.depth);
    this.element = element;
    if (action === undefined) return;
    const actionButton = element.node.querySelector('button');
    if (actionButton === null) return;
    const actionHandler = (): void => {
      if (this.element !== element) return;
      action.onSelect();
    };
    this.actionButton = actionButton;
    this.actionHandler = actionHandler;
    actionButton.addEventListener('click', actionHandler, { once: true });
  }

  hide(): void {
    const element = this.element;
    if (element === undefined) return;
    this.element = undefined;
    if (this.actionButton !== undefined && this.actionHandler !== undefined) {
      this.actionButton.removeEventListener('click', this.actionHandler);
    }
    this.actionButton = undefined;
    this.actionHandler = undefined;
    element.removeAllListeners();
    element.destroy();
  }

  destroy(): void {
    this.hide();
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
