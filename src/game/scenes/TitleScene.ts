import Phaser from 'phaser';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    this.add.text(270, 310, '후추 디펜스', {
      fontFamily: 'system-ui, sans-serif', fontSize: '48px', color: '#34291f',
    }).setOrigin(0.5);
    const start = this.add.dom(270, 570).createFromHTML(
      '<button type="button" class="primary-game-button">보호소 지키기</button>',
    );
    start.addListener('click').on('click', () => this.scene.start('Game'));
  }
}
