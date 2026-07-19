import type Phaser from 'phaser';

export interface TopHudModel {
  readonly shelterHp: number;
  readonly wave: number;
  readonly snacks: number;
}

export interface TopHudSnapshot {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly text: string;
  readonly interactive: boolean;
}

export function formatTopHud(model: TopHudModel): string {
  if (
    !Number.isFinite(model.shelterHp)
    || !Number.isSafeInteger(model.wave)
    || !Number.isSafeInteger(model.snacks)
  ) {
    throw new RangeError('Invalid top HUD model');
  }
  return `보호소 HP ${model.shelterHp}/100   WAVE ${model.wave}/5   간식 ${model.snacks}`;
}

export class TopHud {
  private readonly text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.text = scene.add.text(12, 12, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#34291f',
      strokeThickness: 3,
    }).setDepth(1800).setName('top-hud');
  }

  render(model: TopHudModel): void {
    this.text.setText(formatTopHud(model));
  }

  snapshot(): TopHudSnapshot {
    const bounds = this.text.getBounds();
    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      text: this.text.text,
      interactive: this.text.input?.enabled === true,
    };
  }

  destroy(): void {
    this.text.removeAllListeners();
    this.text.destroy();
  }
}
