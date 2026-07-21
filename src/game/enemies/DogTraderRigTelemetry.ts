import type { DogTraderRigSnapshot } from './DogTraderRig';

export interface DogTraderRigTelemetrySnapshot {
  readonly active: DogTraderRigSnapshot | null;
  readonly lastSharedFeedbackParts: 0 | 2;
  readonly lastReleaseParts: 0 | 2;
}

export interface DogTraderRigTelemetryPort {
  snapshot(): DogTraderRigTelemetrySnapshot;
  reset(): void;
}

interface DogTraderRigSnapshotProvider {
  snapshot(): DogTraderRigSnapshot;
}

export class DogTraderRigTelemetry implements DogTraderRigTelemetryPort {
  private activeRig: DogTraderRigSnapshotProvider | null = null;
  private sharedFeedbackParts: 0 | 2 = 0;
  private releaseParts: 0 | 2 = 0;

  register(rig: DogTraderRigSnapshotProvider): void {
    if (this.activeRig !== null && this.activeRig !== rig) {
      throw new Error('Only one dog trader rig can be active');
    }
    this.activeRig = rig;
  }

  recordSharedFeedback(rig: DogTraderRigSnapshotProvider): void {
    if (this.activeRig === rig) this.sharedFeedbackParts = 2;
  }

  recordRelease(rig: DogTraderRigSnapshotProvider): void {
    if (this.activeRig !== rig) return;
    this.activeRig = null;
    this.releaseParts = 2;
  }

  snapshot(): DogTraderRigTelemetrySnapshot {
    const active = this.activeRig?.snapshot() ?? null;
    return {
      active: active === null ? null : copyRigSnapshot(active),
      lastSharedFeedbackParts: this.sharedFeedbackParts,
      lastReleaseParts: this.releaseParts,
    };
  }

  reset(): void {
    this.activeRig = null;
    this.sharedFeedbackParts = 0;
    this.releaseParts = 0;
  }
}

function copyRigSnapshot(snapshot: DogTraderRigSnapshot): DogTraderRigSnapshot {
  return {
    ...snapshot,
    human: { ...snapshot.human },
    truck: { ...snapshot.truck },
  };
}
