import Phaser from 'phaser';

type ResultData = { outcome?: 'won' | 'lost' };

export class ResultScene extends Phaser.Scene {
  private outcome: 'won' | 'lost' = 'lost';

  constructor() {
    super('Result');
  }

  init(data: ResultData): void {
    this.outcome = data.outcome ?? 'lost';
  }

  create(): void {
    document.querySelector('#game-root')?.setAttribute('data-scene', 'Result');
    const restart = this.add.dom(270, 570).createFromHTML(
      `<button type="button" class="primary-game-button">${this.outcome === 'won' ? '다시 지키기' : '다시 시도'}</button>`,
    );
    restart.addListener('click').on('click', () => this.scene.start('Title'));
  }
}
