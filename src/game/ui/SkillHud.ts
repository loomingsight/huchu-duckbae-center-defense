import type Phaser from 'phaser';
import type {
  AutoSkillId,
  SkillSnapshot,
} from '../skills/SkillSystem';
import type { SkillLevels } from '../skills/SkillTypes';
import type { SkillId, SkillLevel } from '../types/GameTypes';
import { AssetKeys } from '../assets/AssetKeys';

export const SKILL_SLOT = {
  x: 12,
  y: 92,
  size: 32,
  iconMax: 28,
  gap: 4,
  fontPx: 9,
} as const;

export const skillSlotY = (index: number): number => (
  SKILL_SLOT.y + index * (SKILL_SLOT.size + SKILL_SLOT.gap)
);

export interface SkillSlotModel {
  readonly id: SkillId;
  readonly level: SkillLevel;
  readonly x: 12;
  readonly y: number;
  readonly width: 32;
  readonly height: 32;
}

export interface SkillHudState {
  readonly levels: SkillLevels;
  readonly learnedOrder: readonly AutoSkillId[];
  readonly cooldowns: Readonly<Record<SkillId, SkillSnapshot>>;
}

export interface SkillSlotDisplaySnapshot extends SkillSlotModel {
  readonly iconWidth: number;
  readonly iconHeight: number;
  readonly fontPx: 9;
  readonly remainingSeconds: number | null;
  readonly cooldownProgress: number;
  readonly textureKey: string;
  readonly interactive: boolean;
}

export function buildSkillSlots(
  learnedOrder: readonly AutoSkillId[],
  levels: SkillLevels,
): readonly SkillSlotModel[] {
  const seen = new Set<AutoSkillId>();
  const learned = learnedOrder.filter((id) => {
    if (seen.has(id) || levels[id] === 0) return false;
    seen.add(id);
    return true;
  });
  const ids: readonly SkillId[] = ['bark', ...learned];
  return ids.map((id, index) => ({
    id,
    level: levels[id],
    x: SKILL_SLOT.x,
    y: skillSlotY(index),
    width: SKILL_SLOT.size,
    height: SKILL_SLOT.size,
  }));
}

export function cooldownMaskAngle(progress: number): number {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
    throw new RangeError('Skill cooldown progress must be between 0 and 1');
  }
  return Math.PI * 2 * (1 - progress);
}

export function cooldownSeconds(remainingMs: number): number | null {
  if (!Number.isFinite(remainingMs) || remainingMs < 0) {
    throw new RangeError('Skill cooldown remainingMs must be finite and non-negative');
  }
  return remainingMs === 0 ? null : Math.ceil(remainingMs / 1000);
}

export function skillIconKey(id: SkillId): string {
  if (id === 'bark') return AssetKeys.skillBark;
  if (id === 'scold') return AssetKeys.skillScold;
  if (id === 'aquaBeam') return AssetKeys.skillAquaBeam;
  if (id === 'deokbaeHowl') return AssetKeys.skillDeokbaeHowl;
  if (id === 'safetyReport') return AssetKeys.skillSafetyReport;
  throw new RangeError(`Unknown skill icon ${String(id)}`);
}

export class SkillHud {
  private readonly views: readonly SkillSlotView[];

  constructor(scene: Phaser.Scene) {
    this.views = Array.from({ length: 5 }, (_, index) => new SkillSlotView(scene, index));
  }

  render(state: SkillHudState): void {
    const models = buildSkillSlots(state.learnedOrder, state.levels);
    this.views.forEach((view, index) => {
      const model = models[index];
      if (model === undefined) view.hide();
      else view.render(model, state.cooldowns[model.id]);
    });
  }

  snapshot(): readonly SkillSlotDisplaySnapshot[] {
    return this.views
      .map((view) => view.snapshot())
      .filter((value): value is SkillSlotDisplaySnapshot => value !== undefined);
  }

  destroy(): void {
    this.views.forEach((view) => view.destroy());
  }
}

class SkillSlotView {
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly mask: Phaser.GameObjects.Graphics;
  private readonly seconds: Phaser.GameObjects.Text;
  private model: SkillSlotModel | undefined;
  private progress = 0;
  private secondsValue: number | null = null;

  constructor(scene: Phaser.Scene, index: number) {
    this.background = scene.add.rectangle(
      0,
      0,
      SKILL_SLOT.size,
      SKILL_SLOT.size,
      0x2d261f,
      0.9,
    ).setDepth(1800).setName(`skill-slot-${index}`);
    this.icon = scene.add.image(0, 0, AssetKeys.skillBark)
      .setDepth(1801)
      .setDisplaySize(SKILL_SLOT.iconMax, SKILL_SLOT.iconMax)
      .setName(`skill-icon-${index}`);
    this.mask = scene.add.graphics().setDepth(1802).setName(`skill-mask-${index}`);
    this.seconds = scene.add.text(0, 0, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: `${SKILL_SLOT.fontPx}px`,
      color: '#ffffff',
      stroke: '#1f1915',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(1803).setName(`skill-seconds-${index}`);
    this.hide();
  }

  render(model: SkillSlotModel, cooldown: SkillSnapshot): void {
    this.model = { ...model };
    this.progress = model.id === 'bark' ? 1 : cooldown.progress;
    this.secondsValue = model.id === 'bark'
      ? null
      : cooldownSeconds(cooldown.cooldownRemainingMs);
    const centerX = model.x + model.width / 2;
    const centerY = model.y + model.height / 2;
    this.background
      .setPosition(centerX, centerY)
      .setSize(model.width, model.height)
      .setDisplaySize(model.width, model.height)
      .setFillStyle(0x2d261f, 0.9)
      .setActive(true)
      .setVisible(true);
    this.icon
      .setTexture(skillIconKey(model.id))
      .setPosition(centerX, centerY)
      .setDisplaySize(SKILL_SLOT.iconMax, SKILL_SLOT.iconMax)
      .setAlpha(1)
      .setActive(true)
      .setVisible(true);
    this.renderMask(centerX, centerY);
    this.seconds
      .setPosition(centerX, centerY)
      .setText(this.secondsValue === null ? '' : String(this.secondsValue))
      .setActive(this.secondsValue !== null)
      .setVisible(this.secondsValue !== null);
  }

  hide(): void {
    this.model = undefined;
    this.progress = 0;
    this.secondsValue = null;
    this.background.setPosition(0, 0).setActive(false).setVisible(false);
    this.icon.setPosition(0, 0).setAlpha(1).setActive(false).setVisible(false);
    this.mask.clear().setActive(false).setVisible(false);
    this.seconds.setPosition(0, 0).setText('').setActive(false).setVisible(false);
  }

  snapshot(): SkillSlotDisplaySnapshot | undefined {
    const model = this.model;
    if (model === undefined) return undefined;
    const bounds = this.background.getBounds();
    return {
      ...model,
      x: bounds.x as 12,
      y: bounds.y,
      width: bounds.width as 32,
      height: bounds.height as 32,
      iconWidth: this.icon.displayWidth,
      iconHeight: this.icon.displayHeight,
      fontPx: SKILL_SLOT.fontPx,
      remainingSeconds: this.secondsValue,
      cooldownProgress: this.progress,
      textureKey: this.icon.texture.key,
      interactive: [this.background, this.icon, this.mask, this.seconds]
        .some((object) => object.input?.enabled === true),
    };
  }

  destroy(): void {
    for (const object of [this.background, this.icon, this.mask, this.seconds]) {
      object.removeAllListeners();
      object.destroy();
    }
  }

  private renderMask(centerX: number, centerY: number): void {
    const angle = cooldownMaskAngle(this.progress);
    this.mask.clear();
    if (angle === 0) {
      this.mask.setActive(false).setVisible(false);
      return;
    }
    this.mask
      .fillStyle(0x111111, 0.68)
      .beginPath()
      .moveTo(centerX, centerY)
      .arc(centerX, centerY, SKILL_SLOT.size / 2, -Math.PI / 2, -Math.PI / 2 + angle)
      .closePath()
      .fillPath()
      .setActive(true)
      .setVisible(true);
  }
}
