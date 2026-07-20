import Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../constants';
import { joystickVector, type MovementIntent } from './InputVector';

const JOYSTICK_CENTER = { x: 78, y: 862 } as const;
const JOYSTICK_RADIUS = 48;
const KNOB_RADIUS = 22;

type PointerOwner =
  | { readonly source: 'phaser'; readonly id: number }
  | { readonly source: 'native'; readonly id: number };

export class VirtualJoystick {
  private readonly base: Phaser.GameObjects.Arc;
  private readonly knob: Phaser.GameObjects.Arc;
  private readonly canvas: HTMLCanvasElement;
  private activePointer: PointerOwner | null = null;
  private offset = { x: 0, y: 0 };

  constructor(private readonly scene: Phaser.Scene) {
    this.canvas = scene.game.canvas;
    this.base = scene.add
      .circle(JOYSTICK_CENTER.x, JOYSTICK_CENTER.y, JOYSTICK_RADIUS, 0x1f2937, 0.28)
      .setScrollFactor(0)
      .setDepth(2000)
      .setInteractive();
    this.knob = scene.add
      .circle(JOYSTICK_CENTER.x, JOYSTICK_CENTER.y, KNOB_RADIUS, 0xffffff, 0.52)
      .setScrollFactor(0)
      .setDepth(2001);
    this.base.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    scene.input.on(Phaser.Input.Events.GAME_OUT, this.onGameOut);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.relayout, this);
    this.canvas.addEventListener('pointerdown', this.onNativePointerDown);
    this.canvas.addEventListener('pointermove', this.onNativePointerMove);
    this.canvas.addEventListener('pointerup', this.onNativePointerUp);
    this.canvas.addEventListener('pointercancel', this.onNativePointerUp);
    this.canvas.addEventListener('pointerleave', this.onNativePointerUp);
  }

  read(): MovementIntent {
    return joystickVector(this.offset, JOYSTICK_RADIUS);
  }

  relayout(): void {
    this.base.setPosition(JOYSTICK_CENTER.x, JOYSTICK_CENTER.y);
    this.updateOffset(this.offset.x, this.offset.y);
  }

  clearInput(): void {
    this.release();
  }

  destroy(): void {
    this.base.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    this.scene.input.off(Phaser.Input.Events.GAME_OUT, this.onGameOut);
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.relayout, this);
    this.canvas.removeEventListener('pointerdown', this.onNativePointerDown);
    this.canvas.removeEventListener('pointermove', this.onNativePointerMove);
    this.canvas.removeEventListener('pointerup', this.onNativePointerUp);
    this.canvas.removeEventListener('pointercancel', this.onNativePointerUp);
    this.canvas.removeEventListener('pointerleave', this.onNativePointerUp);
    this.base.destroy();
    this.knob.destroy();
  }

  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (this.activePointer !== null) return;
    this.activePointer = { source: 'phaser', id: pointer.id };
    this.updateFromPointer(pointer);
  };

  private readonly onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (this.isOwnedBy('phaser', pointer.id)) this.updateFromPointer(pointer);
  };

  private readonly onPointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (this.isOwnedBy('phaser', pointer.id)) this.release();
  };

  private readonly onGameOut = (): void => {
    if (this.activePointer?.source === 'phaser') this.release();
  };

  private readonly onNativePointerDown = (event: PointerEvent): void => {
    if (this.activePointer !== null) return;
    const point = this.logicalPoint(event);
    if (Math.hypot(point.x - JOYSTICK_CENTER.x, point.y - JOYSTICK_CENTER.y) > JOYSTICK_RADIUS) {
      return;
    }
    this.activePointer = { source: 'native', id: event.pointerId };
    this.updateOffset(point.x - JOYSTICK_CENTER.x, point.y - JOYSTICK_CENTER.y);
  };

  private readonly onNativePointerMove = (event: PointerEvent): void => {
    if (!this.isOwnedBy('native', event.pointerId)) return;
    const point = this.logicalPoint(event);
    this.updateOffset(point.x - JOYSTICK_CENTER.x, point.y - JOYSTICK_CENTER.y);
  };

  private readonly onNativePointerUp = (event: PointerEvent): void => {
    if (this.isOwnedBy('native', event.pointerId)) this.release();
  };

  private updateFromPointer(pointer: Phaser.Input.Pointer): void {
    this.updateOffset(pointer.x - JOYSTICK_CENTER.x, pointer.y - JOYSTICK_CENTER.y);
  }

  private logicalPoint(event: PointerEvent): { x: number; y: number } {
    const bounds = this.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * WORLD_WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * WORLD_HEIGHT,
    };
  }

  private updateOffset(x: number, y: number): void {
    const length = Math.hypot(x, y);
    const scale = length > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / length : 1;
    this.offset = { x: x * scale, y: y * scale };
    this.knob.setPosition(
      JOYSTICK_CENTER.x + this.offset.x,
      JOYSTICK_CENTER.y + this.offset.y,
    );
  }

  private isOwnedBy(source: PointerOwner['source'], id: number): boolean {
    return this.activePointer?.source === source && this.activePointer.id === id;
  }

  private release(): void {
    this.activePointer = null;
    this.updateOffset(0, 0);
  }
}
