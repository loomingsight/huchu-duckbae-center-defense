import type { PlayerActionId } from '../types/GameTypes';

const GLOBAL_ACTION_LOCK_MS = 200;

export type PlayerActionQueueResult =
  | { readonly status: 'queued'; readonly actionId: PlayerActionId }
  | { readonly status: 'queueBusy'; readonly actionId: PlayerActionId };

export class PlayerActionGate {
  private queued: PlayerActionId | null = null;
  private nextStartAtMs = 0;

  queue(actionId: PlayerActionId): PlayerActionQueueResult {
    assertActionId(actionId);
    if (this.queued !== null) return { status: 'queueBusy', actionId };
    this.queued = actionId;
    return { status: 'queued', actionId };
  }

  consume(nowMs: number): PlayerActionId | null {
    assertTimestamp(nowMs);
    if (this.queued === null || nowMs < this.nextStartAtMs) return null;
    const actionId = this.queued;
    this.queued = null;
    return actionId;
  }

  accept(nowMs: number): void {
    assertTimestamp(nowMs);
    this.nextStartAtMs = nowMs + GLOBAL_ACTION_LOCK_MS;
  }

  reset(): void {
    this.queued = null;
    this.nextStartAtMs = 0;
  }
}

function assertActionId(actionId: PlayerActionId): void {
  if (!(['bark', 'tailSwipe', 'aquaBeam', 'safetyReport'] as const).includes(actionId)) {
    throw new RangeError(`Unknown player action ${String(actionId)}`);
  }
}

function assertTimestamp(nowMs: number): void {
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new RangeError('Player action timestamp must be finite and non-negative');
  }
}
