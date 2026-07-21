import Phaser from 'phaser';
import { resolveDogTraderAsset } from '../assets/DogTraderDirectionalAssets';
import { animationFrameAt } from '../assets/AnimationManifest';
import { HUCHU_PRESENTATION } from '../presentation/PresentationConfig';
import type { EnemyState } from '../types/GameTypes';
import type { Direction8 } from '../world/DirectionalFrameResolver';
import type { Point } from '../world/Geometry';
import type {
  DogTraderPartsPort,
  DogTraderTruckRenderInput,
  RecoilInput,
} from './DogTraderRig';

interface VisualPart {
  readonly root: Phaser.GameObjects.Container;
  readonly feedback: Phaser.GameObjects.Container;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly renderState: VisualPartRenderState;
}

interface VisualPartRenderState {
  textureKey: string | undefined;
  frame: number | undefined;
  bottomOriginApplied: boolean;
  depth: number | undefined;
}

const TRUCK_OPAQUE_HEIGHT_LOGICAL = 91;

export class PhaserDogTraderParts implements DogTraderPartsPort {
  private readonly human: VisualPart;
  private readonly truck: VisualPart;
  private truckFrame = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.human = createPart(scene);
    this.truck = createPart(scene);
    this.resetHuman();
    this.resetTruck();
  }

  renderHuman(
    position: Point,
    direction: Direction8,
    state: EnemyState,
    elapsedMs: number,
  ): void {
    const action = state === 'moving' ? 'walk' : 'attack';
    const resolved = resolveDogTraderAsset(action, direction);
    const frame = state === 'dead'
      ? resolved.entry.frameCount - 1
      : animationFrameAt(resolved.entry, elapsedMs);
    const scale = HUCHU_PRESENTATION.bossOpaqueHeightLogical /
      resolved.entry.opaqueHeightPx;
    syncPartIdentity(this.human, resolved.entry.key, frame);
    this.human.sprite
      .setPosition(0, 0)
      .setScale(scale)
      .setFlip(resolved.flipX, false)
      .setActive(true)
      .setVisible(true);
    this.human.root.setPosition(position.x, position.y);
    syncPartDepth(this.human, position.y);
    this.human.root
      .setActive(true)
      .setVisible(true);
  }

  renderTruck(
    position: Point,
    direction: Direction8,
    input: DogTraderTruckRenderInput,
  ): void {
    const resolved = resolveDogTraderAsset('truckRoll', direction);
    if (input.rolling) this.truckFrame = animationFrameAt(resolved.entry, input.elapsedMs);
    const bodyIdleY = input.rolling ? 0 : Math.sin(input.elapsedMs / 180);
    const scale = TRUCK_OPAQUE_HEIGHT_LOGICAL / resolved.entry.opaqueHeightPx;
    syncPartIdentity(this.truck, resolved.entry.key, this.truckFrame);
    this.truck.sprite
      .setPosition(0, bodyIdleY)
      .setScale(scale)
      .setFlip(resolved.flipX, false)
      .setActive(true)
      .setVisible(true);
    this.truck.root.setPosition(position.x, position.y);
    syncPartDepth(this.truck, position.y);
    this.truck.root
      .setActive(true)
      .setVisible(true);
  }

  flashHuman(durationMs: number): void { this.flash(this.human, durationMs); }
  flashTruck(durationMs: number): void { this.flash(this.truck, durationMs); }
  recoilHuman(input: RecoilInput): void { this.recoil(this.human, input); }
  recoilTruck(input: RecoilInput): void { this.recoil(this.truck, input); }
  beginHumanDeath(durationMs: 160): void { this.beginDeath(this.human, durationMs); }
  beginTruckDeath(durationMs: 160): void { this.beginDeath(this.truck, durationMs); }

  resetHuman(): void {
    this.resetPart(this.human);
  }

  resetTruck(): void {
    this.truckFrame = 0;
    this.resetPart(this.truck);
  }

  private flash(part: VisualPart, durationMs: number): void {
    part.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.scene.tweens.killTweensOf(part.sprite);
    this.scene.tweens.add({
      targets: part.sprite,
      alpha: { from: 0.72, to: 1 },
      duration: durationMs,
      onComplete: () => part.sprite.clearTint(),
    });
  }

  private recoil(part: VisualPart, input: RecoilInput): void {
    this.scene.tweens.killTweensOf(part.feedback);
    part.feedback
      .setPosition(
        input.direction.x * input.distancePx,
        input.direction.y * input.distancePx,
      )
      .setScale(input.popScale);
    this.scene.tweens.add({
      targets: part.feedback,
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      duration: input.durationMs,
    });
  }

  private beginDeath(part: VisualPart, durationMs: 160): void {
    this.scene.tweens.killTweensOf(part.feedback);
    this.scene.tweens.add({
      targets: part.feedback,
      alpha: 0,
      scaleX: 0,
      scaleY: 0,
      duration: durationMs,
    });
  }

  private resetPart(part: VisualPart): void {
    this.scene.tweens.killTweensOf(part.sprite);
    this.scene.tweens.killTweensOf(part.feedback);
    part.sprite
      .setPosition(0, 0)
      .setAlpha(1)
      .setScale(1)
      .setFlip(false, false)
      .clearTint()
      .setActive(false)
      .setVisible(false);
    part.feedback
      .setPosition(0, 0)
      .setScale(1)
      .setAlpha(1)
      .setActive(true)
      .setVisible(true);
    part.root.setPosition(0, 0);
    syncPartDepth(part, 0);
    part.root
      .setActive(false)
      .setVisible(false);
  }
}

function createPart(scene: Phaser.Scene): VisualPart {
  const sprite = scene.add.sprite(0, 0, '__DEFAULT');
  const feedback = scene.add.container(0, 0, [sprite]);
  const root = scene.add.container(0, 0, [feedback]);
  return {
    root,
    feedback,
    sprite,
    renderState: {
      textureKey: undefined,
      frame: undefined,
      bottomOriginApplied: false,
      depth: undefined,
    },
  };
}

function syncPartIdentity(part: VisualPart, textureKey: string, frame: number): void {
  if (part.renderState.textureKey !== textureKey) {
    part.sprite.setTexture(textureKey);
    part.renderState.textureKey = textureKey;
    part.renderState.frame = undefined;
  }
  if (part.renderState.frame !== frame) {
    part.sprite.setFrame(frame);
    part.renderState.frame = frame;
  }
  if (!part.renderState.bottomOriginApplied) {
    part.sprite.setOrigin(0.5, 1);
    part.renderState.bottomOriginApplied = true;
  }
}

function syncPartDepth(part: VisualPart, depth: number): void {
  if (part.renderState.depth === depth) return;
  part.root.setDepth(depth);
  part.renderState.depth = depth;
}
