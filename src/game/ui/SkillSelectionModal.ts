import type Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../constants';
import type { SkillCard } from '../skills/SkillTypes';

export class SkillSelectionModal {
  private readonly dimLayer: Phaser.GameObjects.Graphics;
  private readonly elements: Phaser.GameObjects.DOMElement[] = [];
  private accepted = false;
  private destroyed = false;

  constructor(
    scene: Phaser.Scene,
    cards: readonly SkillCard[],
    private readonly onSelect: (cardId: string) => void,
  ) {
    if (new Set(cards.map(({ id }) => id)).size !== cards.length) {
      throw new RangeError('Skill selection cards must have distinct ids');
    }
    this.dimLayer = scene.add
      .graphics()
      .fillStyle(0x1b1714, 0.72)
      .fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
      .setDepth(2000);

    const title = scene.add.dom(270, 300).createFromHTML(
      '<div role="heading" aria-level="2" style="color:#fff;font:800 28px system-ui,sans-serif;text-align:center;white-space:nowrap;text-shadow:0 2px 3px #34291f">간식으로 스킬 배우기</div>',
    ).setDepth(2001);
    this.elements.push(title);

    cards.forEach((card, index) => {
      const element = scene.add.dom(270, 390 + index * 76).createFromHTML(
        `<button type="button" style="min-width:260px;min-height:64px;border:0;border-radius:14px;padding:12px 18px;background:#fff3c4;color:#34291f;font:700 20px system-ui,sans-serif;cursor:pointer;touch-action:manipulation">${escapeHtml(card.title)}</button>`,
      ).setDepth(2001);
      element.addListener('click');
      element.on('click', () => this.accept(card.id));
      this.elements.push(element);
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const element of this.elements) {
      element.removeListener('click');
      element.removeAllListeners();
      element.destroy();
    }
    this.elements.length = 0;
    this.dimLayer.destroy();
  }

  private accept(cardId: string): void {
    if (this.accepted || this.destroyed) return;
    this.accepted = true;
    try {
      this.onSelect(cardId);
    } finally {
      this.destroy();
    }
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
