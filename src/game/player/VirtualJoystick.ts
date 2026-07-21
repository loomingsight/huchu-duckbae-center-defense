import { joystickVector, type MovementIntent } from './InputVector';

export const JOYSTICK_HIT_SIZE = 112;
export const JOYSTICK_RING_RADIUS = 46;

export class VirtualJoystick {
  private readonly hit: HTMLElement;
  private readonly knob: HTMLElement;
  private activePointerId: number | null = null;
  private offset = { x: 0, y: 0 };
  private enabled = true;
  private destroyed = false;

  constructor(parent: HTMLElement, documentRef: Document = document) {
    this.hit = documentRef.createElement('div');
    this.hit.className = 'virtual-joystick';
    this.hit.setAttribute('role', 'application');
    this.hit.setAttribute('tabindex', '0');
    this.hit.setAttribute('aria-label', '이동 조이스틱');
    this.hit.setAttribute('aria-description', '터치로 드래그하거나 WASD 및 방향키로 이동합니다');
    this.hit.setAttribute('aria-keyshortcuts', 'W A S D ArrowUp ArrowDown ArrowLeft ArrowRight');
    this.hit.setAttribute('aria-disabled', 'false');
    this.hit.dataset.enabled = 'true';
    const ring = documentRef.createElement('div');
    ring.className = 'virtual-joystick__ring';
    this.knob = documentRef.createElement('div');
    this.knob.className = 'virtual-joystick__knob';
    this.hit.append(ring, this.knob);
    parent.appendChild(this.hit);
    this.hit.addEventListener('pointerdown', this.onPointerDown);
    this.hit.addEventListener('pointermove', this.onPointerMove);
    this.hit.addEventListener('pointerup', this.onPointerUp);
    this.hit.addEventListener('pointercancel', this.onPointerUp);
    this.hit.addEventListener('lostpointercapture', this.onLostPointerCapture);
  }

  read(): MovementIntent {
    return this.enabled ? joystickVector(this.offset, JOYSTICK_RING_RADIUS) : zeroIntent();
  }

  setEnabled(enabled: boolean): void {
    if (this.destroyed || this.enabled === enabled) return;
    this.enabled = enabled;
    this.hit.dataset.enabled = String(enabled);
    this.hit.setAttribute('aria-disabled', String(!enabled));
    if (!enabled) this.release();
  }

  clearInput(): void {
    this.release();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.release();
    this.hit.removeEventListener('pointerdown', this.onPointerDown);
    this.hit.removeEventListener('pointermove', this.onPointerMove);
    this.hit.removeEventListener('pointerup', this.onPointerUp);
    this.hit.removeEventListener('pointercancel', this.onPointerUp);
    this.hit.removeEventListener('lostpointercapture', this.onLostPointerCapture);
    this.hit.remove();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.enabled || this.activePointerId !== null) return;
    event.preventDefault();
    this.activePointerId = event.pointerId;
    this.hit.setPointerCapture?.(event.pointerId);
    this.updateFromPointer(event);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.enabled || event.pointerId !== this.activePointerId) return;
    event.preventDefault();
    this.updateFromPointer(event);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    event.preventDefault();
    this.release();
  };

  private readonly onLostPointerCapture = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    this.release(false);
  };

  private updateFromPointer(event: PointerEvent): void {
    const bounds = this.hit.getBoundingClientRect();
    const x = event.clientX - (bounds.left + bounds.width / 2);
    const y = event.clientY - (bounds.top + bounds.height / 2);
    const length = Math.hypot(x, y);
    const scale = length > JOYSTICK_RING_RADIUS ? JOYSTICK_RING_RADIUS / length : 1;
    this.offset = { x: x * scale, y: y * scale };
    this.knob.style.transform = `translate(${this.offset.x}px, ${this.offset.y}px)`;
  }

  private release(releaseCapture = true): void {
    const pointerId = this.activePointerId;
    if (releaseCapture && pointerId !== null && this.hit.hasPointerCapture?.(pointerId)) {
      this.hit.releasePointerCapture(pointerId);
    }
    this.activePointerId = null;
    this.offset = { x: 0, y: 0 };
    this.knob.style.transform = 'translate(0px, 0px)';
  }
}

function zeroIntent(): MovementIntent {
  return { x: 0, y: 0, magnitude: 0 };
}
