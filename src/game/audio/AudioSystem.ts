import type { GameEvent } from '../events/GameEvents';
import { BgmSystem, WebAudioBgmVoiceSink } from './BgmSystem';
import { SfxSystem } from './SfxSystem';
import type {
  AudioSnapshot,
  AudioSystemOptions,
  SfxId,
  SfxPlayInput,
  SfxPort,
  StoragePort,
} from './AudioTypes';

const MUTE_STORAGE_KEY = 'huchu-defense:muted';
const SFX_GAIN = 0.65;
const BGM_GAIN = 0.28;
const SAFETY_CAST_LIMIT = 256;

export class AudioSystem {
  private readonly listeners = new Set<(muted: boolean) => void>();
  private readonly safetyCasts = new Set<string>();
  private context: AudioContext | null = null;
  private muteGain: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private bgmBus: GainNode | null = null;
  private sfx: SfxPort | null = null;
  private bgm: BgmSystem | null = null;
  private unlockPromise: Promise<boolean> | null = null;
  private destroyPromise: Promise<void> | null = null;
  private closePromise: Promise<void> | null = null;
  private lifecycleTail: Promise<void> | null = null;
  private beginRunPending = false;
  private isSilent = false;
  private destroyed = false;
  private resultFadeActive = false;
  private mutedValue: boolean;

  constructor(
    private readonly createContext: () => AudioContext,
    private readonly storage: StoragePort,
    private readonly options: AudioSystemOptions = {},
  ) {
    this.mutedValue = this.readInitialMute();
  }

  unlock(): Promise<boolean> {
    if (this.destroyed || this.isSilent) return Promise.resolve(false);
    if (this.unlockPromise !== null) return this.unlockPromise;
    const unlock = this.context === null
      ? this.createAndUnlock()
      : this.resumeExistingContext();
    this.unlockPromise = unlock;
    void unlock.then(
      () => { if (this.unlockPromise === unlock) this.unlockPromise = null; },
      () => { if (this.unlockPromise === unlock) this.unlockPromise = null; },
    );
    return unlock;
  }

  beginRun(): void {
    if (this.destroyed || this.isSilent) return;
    if (this.context === null || this.sfx === null || this.bgm === null || this.bgmBus === null) {
      this.beginRunPending = true;
      return;
    }
    this.beginRunPending = false;
    this.beginRunNow();
  }

  private beginRunNow(): void {
    this.safetyCasts.clear();
    this.sfx?.stopAll();
    this.sfx?.resetDedupe();
    this.resultFadeActive = false;
    if (this.bgmBus !== null && this.context !== null) {
      this.bgmBus.gain.cancelScheduledValues(this.context.currentTime);
      this.bgmBus.gain.setValueAtTime(BGM_GAIN, this.context.currentTime);
    }
    this.bgm?.beginRun();
  }

  handle(event: GameEvent): void {
    if (this.destroyed || this.isSilent) return;
    if (event.type === 'bossActiveChanged') {
      this.bgm?.setBossActive(event.active);
      return;
    }
    if (event.type === 'runEnded') {
      this.fadeBgmForResult();
      return;
    }
    switch (event.type) {
      case 'barkImpact':
        this.play('barkHuchu', event);
        break;
      case 'companionAttack':
        this.play('barkDeokbae', event);
        break;
      case 'skillCastStarted':
        if (event.skillId === 'aquaBeam') this.play('aquaCharge', event);
        if (event.skillId === 'safetyReport') this.play('noticePaper', event);
        break;
      case 'skillImpact':
        if (event.skillId === 'tailSwipe') this.play('tailSwipe', event);
        if (event.skillId === 'aquaBeam') this.play('aquaImpact', event);
        if (event.skillId === 'safetyReport') this.scheduleSafetyImpact(event.castId, event.targets.length);
        break;
      case 'skillPurchaseResolved':
        this.play('skillLearned', { castId: `skillLearned:${event.result.skillId}` });
        break;
      case 'attackStarted':
        if (event.kind === 'illegalBreeder') this.play('electricCharge', event);
        break;
      case 'projectileHit':
        if (event.projectileKind === 'electric') this.play('electricImpact', event);
        break;
      case 'damageApplied':
        if (event.effectiveAmount <= 0) break;
        this.play(event.strength === 'heavy' ? 'hitHeavy' : 'hitLight', event);
        break;
      case 'shelterDamaged':
        this.play('shelterWood', event);
        break;
      default:
        break;
    }
  }

  play(id: SfxId, input: SfxPlayInput): boolean {
    if (this.destroyed || this.isSilent || this.sfx === null) return false;
    try {
      return this.sfx.play(id, input);
    } catch {
      return false;
    }
  }

  snapshot(): AudioSnapshot {
    const sfxVoices = this.destroyed || this.isSilent ? 0 : this.sfx?.snapshot().voiceCount ?? 0;
    const bgmSnapshot = this.destroyed || this.isSilent ? null : this.bgm?.snapshot() ?? null;
    const bgmVoices = bgmSnapshot?.voiceCount ?? 0;
    return {
      state: this.resolveState(),
      muted: this.mutedValue,
      sfxVoices,
      bgmVoices,
      totalVoices: sfxVoices + bgmVoices,
      transportPhaseSteps: bgmSnapshot?.transportPhaseSteps ?? 0,
      bossLayerActive: bgmSnapshot?.bossLayerActive ?? false,
    };
  }

  pauseForLifecycle(): Promise<void> {
    return this.enqueueLifecycle(async () => {
      const pendingUnlock = this.unlockPromise;
      if (pendingUnlock !== null) {
        try {
          await pendingUnlock;
        } catch {
          // Lifecycle still applies after a failed unlock attempt.
        }
      }
      if (this.destroyed || this.isSilent || this.context === null) return;
      this.sfx?.stopAll();
      this.bgm?.pause();
      try {
        await this.context.suspend();
      } catch {
        // Suspension failure must not interrupt gameplay lifecycle handling.
      }
    });
  }

  resumeForLifecycle(): Promise<void> {
    return this.enqueueLifecycle(async () => {
      const pendingUnlock = this.unlockPromise;
      if (pendingUnlock !== null) {
        try {
          await pendingUnlock;
        } catch {
          // Lifecycle still applies after a failed unlock attempt.
        }
      }
      if (this.destroyed || this.isSilent || this.context === null) return;
      try {
        if (this.context.state !== 'running') await this.context.resume();
        this.bgm?.resume();
      } catch (error) {
        if (!this.isUserGestureRequired(error)) await this.enterSilentState();
      }
    });
  }

  muted(): boolean {
    return this.mutedValue;
  }

  setMuted(value: boolean): void {
    if (this.mutedValue === value) return;
    this.mutedValue = value;
    if (this.muteGain !== null) this.muteGain.gain.value = value ? 0 : 1;
    try {
      this.storage.setItem(MUTE_STORAGE_KEY, String(value));
    } catch {
      // Storage can be unavailable in privacy modes; mute still works in memory.
    }
    [...this.listeners].forEach((listener) => {
      try {
        listener(value);
      } catch {
        // A UI subscriber cannot break audio state changes for the others.
      }
    });
  }

  subscribeMute(listener: (muted: boolean) => void): () => void {
    if (this.destroyed) return () => undefined;
    this.listeners.add(listener);
    try {
      listener(this.mutedValue);
    } catch {
      // Subscription remains valid even when its initial render fails.
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  tickTransport(): void {
    this.bgm?.tick();
  }

  destroy(): Promise<void> {
    if (this.destroyPromise !== null) return this.destroyPromise;
    this.destroyed = true;
    this.destroyPromise = this.performDestroy();
    return this.destroyPromise;
  }

  private async performDestroy(): Promise<void> {
    this.beginRunPending = false;
    this.safetyCasts.clear();
    this.listeners.clear();
    const sfx = this.sfx;
    const bgm = this.bgm;
    const sfxBus = this.sfxBus;
    const bgmBus = this.bgmBus;
    const muteGain = this.muteGain;
    const context = this.context;
    const pendingClose = this.closePromise;
    this.sfx = null;
    this.bgm = null;
    this.sfxBus = null;
    this.bgmBus = null;
    this.muteGain = null;
    this.context = null;
    runBestEffort([
      () => sfx?.destroy(),
      () => bgm?.destroy(),
      () => sfxBus?.disconnect(),
      () => bgmBus?.disconnect(),
      () => muteGain?.disconnect(),
    ]);
    const closing = context === null ? pendingClose : this.closeOwnedContext(context);
    if (closing !== null) await closing;
  }

  private async createAndUnlock(): Promise<boolean> {
    let context: AudioContext;
    try {
      context = this.createContext();
      this.context = context;
    } catch {
      if (this.destroyed) return false;
      await this.enterSilentState();
      return false;
    }
    if (context.state !== 'running') {
      try {
        await context.resume();
      } catch (error) {
        if (this.destroyed) return false;
        if (this.isUserGestureRequired(error)) return false;
        await this.enterSilentState();
        return false;
      }
    }
    if (this.destroyed || this.isSilent || this.context !== context) return false;
    try {
      this.completeUnlock(context);
      return true;
    } catch {
      if (this.destroyed) return false;
      await this.enterSilentState();
      return false;
    }
  }

  private async resumeExistingContext(): Promise<boolean> {
    const context = this.context;
    if (context === null || this.destroyed || this.isSilent) return false;
    if (context.state !== 'running') {
      try {
        await context.resume();
      } catch (error) {
        if (this.destroyed) return false;
        if (this.isUserGestureRequired(error)) return false;
        await this.enterSilentState();
        return false;
      }
    }
    if (this.destroyed || this.isSilent || this.context !== context) return false;
    try {
      this.completeUnlock(context);
      this.bgm?.resume();
      return true;
    } catch {
      if (this.destroyed) return false;
      await this.enterSilentState();
      return false;
    }
  }

  private completeUnlock(context: AudioContext): void {
    if (this.sfx === null || this.bgm === null || this.bgmBus === null) {
      this.createGraph(context);
    }
    if (!this.beginRunPending) return;
    this.beginRunPending = false;
    this.beginRunNow();
  }

  private createGraph(context: AudioContext): void {
    const muteGain = context.createGain();
    const sfxBus = context.createGain();
    const bgmBus = context.createGain();
    muteGain.gain.value = this.mutedValue ? 0 : 1;
    sfxBus.gain.value = SFX_GAIN;
    bgmBus.gain.value = BGM_GAIN;
    sfxBus.connect(muteGain);
    bgmBus.connect(muteGain);
    muteGain.connect(context.destination);
    this.muteGain = muteGain;
    this.sfxBus = sfxBus;
    this.bgmBus = bgmBus;
    const factory = this.options.sfxFactory;
    this.sfx = typeof factory === 'function'
      ? factory(context, sfxBus)
      : factory?.create(context, sfxBus) ?? new SfxSystem(context, sfxBus);
    const transport = this.options.bgmTransportFactory?.create(context, bgmBus) ?? {
      clock: { nowSeconds: () => context.currentTime },
      sink: new WebAudioBgmVoiceSink(context, bgmBus),
    };
    this.bgm = new BgmSystem(transport.clock, transport.sink);
  }

  private fadeBgmForResult(): void {
    if (this.resultFadeActive || this.bgm === null || this.bgmBus === null || this.context === null) return;
    this.resultFadeActive = true;
    const context = this.context;
    const bus = this.bgmBus;
    this.bgm.fadeOut(600, (durationMs) => {
      const now = context.currentTime;
      bus.gain.setValueAtTime(bus.gain.value, now);
      bus.gain.linearRampToValueAtTime(0, now + durationMs / 1_000);
    });
  }

  private scheduleSafetyImpact(castId: string, targetCount: number): void {
    if (targetCount <= 0 || this.safetyCasts.has(castId) || this.context === null) return;
    this.rememberSafetyCast(castId);
    const stampCount = Math.min(3, targetCount);
    const impactAt = this.context.currentTime;
    this.play('noticeStamp', { castId, scheduledAtSeconds: impactAt });
    this.play('hitHeavy', { castId, scheduledAtSeconds: impactAt });
    for (let index = 1; index < stampCount; index += 1) {
      this.play('noticeStamp', {
        castId,
        scheduledAtSeconds: impactAt + index * 0.045,
      });
    }
  }

  private rememberSafetyCast(castId: string): void {
    if (this.safetyCasts.size >= SAFETY_CAST_LIMIT) {
      const oldest = this.safetyCasts.values().next().value as string | undefined;
      if (oldest !== undefined) this.safetyCasts.delete(oldest);
    }
    this.safetyCasts.add(castId);
  }

  private resolveState(): AudioSnapshot['state'] {
    if (this.destroyed || this.isSilent) return 'silent';
    if (this.context === null) return 'locked';
    return this.context.state === 'running' ? 'running' : 'suspended';
  }

  private readInitialMute(): boolean {
    try {
      return this.storage.getItem(MUTE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private async enterSilentState(): Promise<void> {
    if (this.isSilent) {
      if (this.closePromise !== null) await this.closePromise;
      return;
    }
    this.isSilent = true;
    this.beginRunPending = false;
    const sfx = this.sfx;
    const bgm = this.bgm;
    const sfxBus = this.sfxBus;
    const bgmBus = this.bgmBus;
    const muteGain = this.muteGain;
    const context = this.context;
    this.sfx = null;
    this.bgm = null;
    this.sfxBus = null;
    this.bgmBus = null;
    this.muteGain = null;
    this.context = null;
    runBestEffort([
      () => sfx?.destroy(),
      () => bgm?.destroy(),
      () => sfxBus?.disconnect(),
      () => bgmBus?.disconnect(),
      () => muteGain?.disconnect(),
    ]);
    if (context !== null) await this.closeOwnedContext(context);
  }

  private closeOwnedContext(context: AudioContext): Promise<void> {
    if (this.closePromise !== null) return this.closePromise;
    const closing = this.closeContext(context);
    this.closePromise = closing;
    void closing.then(() => {
      if (this.closePromise === closing) this.closePromise = null;
    });
    return closing;
  }

  private async closeContext(context: AudioContext): Promise<void> {
    try {
      await context.close();
    } catch {
      // Context creation/resume failure permanently degrades to silent no-op.
    }
  }

  private isUserGestureRequired(error: unknown): boolean {
    return typeof error === 'object'
      && error !== null
      && 'name' in error
      && error.name === 'NotAllowedError';
  }

  private enqueueLifecycle(operation: () => Promise<void>): Promise<void> {
    const previous = this.lifecycleTail;
    const result = previous === null ? operation() : previous.then(operation, operation);
    this.lifecycleTail = result;
    void result.then(
      () => { if (this.lifecycleTail === result) this.lifecycleTail = null; },
      () => { if (this.lifecycleTail === result) this.lifecycleTail = null; },
    );
    return result;
  }
}

function runBestEffort(steps: readonly (() => void)[]): void {
  for (const step of steps) {
    try {
      step();
    } catch {
      // Audio teardown must continue through every owned resource.
    }
  }
}
