import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioSystem } from '../../src/game/audio/AudioSystem';
import type {
  AudioTransportClock,
  AudioSystemOptions,
  BgmTransportFactory,
  BgmVoiceSink,
  SfxId,
  SfxPlayInput,
  SfxPort,
  StoragePort,
} from '../../src/game/audio/AudioTypes';
import type { GameEvent } from '../../src/game/events/GameEvents';

class FakeAudioParam {
  value = 0;
  readonly ramps: Array<{ readonly value: number; readonly at: number }> = [];
  readonly cancellations: number[] = [];
  setValueAtTime(value: number): this {
    this.value = value;
    return this;
  }

  linearRampToValueAtTime(value: number, at: number): this {
    this.value = value;
    this.ramps.push({ value, at });
    return this;
  }

  cancelScheduledValues(at: number): this {
    this.cancellations.push(at);
    return this;
  }
}

class FakeAudioNode {
  readonly connections: FakeAudioNode[] = [];
  disconnectCalls = 0;
  disconnectError: Error | null = null;
  connect(destination: FakeAudioNode): FakeAudioNode {
    this.connections.push(destination);
    return destination;
  }
  disconnect(): void {
    this.disconnectCalls += 1;
    this.connections.length = 0;
    if (this.disconnectError !== null) throw this.disconnectError;
  }
}

class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam();
}

class FakeAudioContext {
  private readonly startedAtMs = Date.now();
  state: AudioContextState = 'suspended';
  resumeError: Error | null = null;
  suspendCalls = 0;
  resumeCalls = 0;
  closeCalls = 0;
  createdNodes = 0;
  readonly destination = new FakeAudioNode();
  readonly gains: FakeGainNode[] = [];
  resumeBarrier: Promise<void> | null = null;
  suspendBarrier: Promise<void> | null = null;
  closeBarrier: Promise<void> | null = null;

  get currentTime(): number {
    return (Date.now() - this.startedAtMs) / 1_000;
  }

  createGain(): GainNode {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    this.createdNodes += 1;
    return gain as unknown as GainNode;
  }

  async resume(): Promise<void> {
    this.resumeCalls += 1;
    if (this.resumeError !== null) throw this.resumeError;
    if (this.resumeBarrier !== null) await this.resumeBarrier;
    this.state = 'running';
  }

  constructor(private readonly lifecycleCalls?: string[]) {}

  async suspend(): Promise<void> {
    this.lifecycleCalls?.push('context-suspend');
    this.suspendCalls += 1;
    if (this.suspendBarrier !== null) await this.suspendBarrier;
    this.state = 'suspended';
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
    if (this.closeBarrier !== null) await this.closeBarrier;
    this.state = 'closed';
  }

  asAudioContext(): AudioContext {
    return this as unknown as AudioContext;
  }
}

class RecordingBgmSink implements BgmVoiceSink {
  readonly base: Array<{ readonly step: number; readonly when: number }> = [];
  readonly boss: Array<{ readonly step: number; readonly when: number }> = [];
  readonly cancelled: Array<{ readonly step: number; readonly when: number }> = [];
  stopAllCalls = 0;
  activeVoiceCount = 0;

  constructor(private readonly lifecycleCalls?: string[]) {}

  scheduleBaseStep(step: number, when: number): void {
    this.base.push({ step, when });
    if (step % 16 === 0) this.activeVoiceCount = 4;
  }

  scheduleBossStep(step: number, when: number): void {
    this.boss.push({ step, when });
    this.activeVoiceCount = Math.min(6, this.activeVoiceCount + 2);
  }

  cancelBossStep(step: number, when: number): void {
    this.cancelled.push({ step, when });
  }

  stopAll(): void {
    this.lifecycleCalls?.push('bgm-stop');
    this.stopAllCalls += 1;
    this.activeVoiceCount = 0;
  }
}

interface PlayedCue {
  readonly id: SfxId;
  readonly castId: string;
  readonly atMs: number;
  readonly scheduledAtSeconds: number | undefined;
}

class RecordingSfxPort implements SfxPort {
  readonly played: PlayedCue[] = [];
  stopAllCalls = 0;
  resetCalls = 0;
  destroyCalls = 0;
  destroyError: Error | null = null;
  private readonly perCast = new Set<string>();

  play(id: SfxId, input: SfxPlayInput): boolean {
    const max = id === 'noticeStamp' ? 3 : 1;
    const keyPrefix = `${input.castId}:${id}:`;
    const count = [...this.perCast].filter((key) => key.startsWith(keyPrefix)).length;
    if (count >= max) return false;
    this.perCast.add(`${keyPrefix}${count}`);
    this.played.push({
      id,
      castId: input.castId,
      atMs: Date.now(),
      scheduledAtSeconds: input.scheduledAtSeconds,
    });
    return true;
  }

  snapshot(): { readonly voiceCount: number; readonly dedupeCastCount: number } {
    return { voiceCount: this.played.length, dedupeCastCount: this.perCast.size };
  }

  stopAll(): void {
    this.stopAllCalls += 1;
  }

  resetDedupe(): void {
    this.resetCalls += 1;
    this.perCast.clear();
  }

  destroy(): void {
    this.destroyCalls += 1;
    if (this.destroyError !== null) throw this.destroyError;
  }
}

const memoryStorage = (initial: Readonly<Record<string, string>> = {}): StoragePort & {
  readonly values: Map<string, string>;
} => {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
};

const optionsFor = (port: RecordingSfxPort): AudioSystemOptions => ({
  sfxFactory: () => port,
});

const bgmFactoryFor = (
  fake: FakeAudioContext,
  sink: RecordingBgmSink,
  onCreate: (context: AudioContext, bus: GainNode) => void = () => undefined,
): BgmTransportFactory => ({
  create: (context, bus) => {
    onCreate(context, bus);
    const clock: AudioTransportClock = { nowSeconds: () => fake.currentTime };
    return { clock, sink };
  },
});

const point = { x: 10, y: 20 } as const;
const baseEvent = { castId: 'cast:1' } as const;

const routeEvents = (): readonly GameEvent[] => [
  { type: 'barkImpact', ...baseEvent, origin: point, direction: { x: 1, y: 0 }, targetIds: [1] },
  { type: 'companionAttack', ...baseEvent, companion: 'deokbae', origin: point, targetId: 1, targetPosition: point },
  { type: 'skillCastStarted', ...baseEvent, skillId: 'aquaBeam', origin: point, targets: [], durationMs: 600 },
  { type: 'skillCastStarted', ...baseEvent, skillId: 'safetyReport', origin: point, targets: [], durationMs: 300 },
  { type: 'skillImpact', ...baseEvent, skillId: 'tailSwipe', origin: point, targets: [] },
  { type: 'skillImpact', ...baseEvent, skillId: 'aquaBeam', origin: point, targets: [] },
  {
    type: 'skillPurchaseResolved',
    result: { status: 'learned', skillId: 'tailSwipe', cost: 15, spent: 15, snacks: 0, nextCost: 25 },
  },
  { type: 'attackStarted', ...baseEvent, enemyId: 1, kind: 'illegalBreeder' },
  {
    type: 'projectileHit', ...baseEvent, projectileId: 1, projectileKind: 'electric',
    sourceEnemyId: 1, sourceEnemyKind: 'illegalBreeder', position: point,
  },
  {
    type: 'damageApplied', ...baseEvent, appliedAtStep: 1, targetId: 1, amount: 1,
    effectiveAmount: 1, position: point, impactDirection: point, source: 'bark', strength: 'medium', lethal: false,
  },
  {
    type: 'playerDamaged', ...baseEvent, appliedAtStep: 1, sourceEnemyId: 1,
    sourceEnemyKind: 'poopGuardian', amount: 1, effectiveAmount: 1, hp: 9, maxHp: 10,
    position: point, impactDirection: point, strength: 'medium', lethal: false,
  },
];

describe('AudioSystem', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('unlock 전에는 context/node가 없고 unlock에서 mute/master/SFX65%/BGM28% graph를 한 번만 만든다', async () => {
    const fake = new FakeAudioContext();
    const port = new RecordingSfxPort();
    const storage = memoryStorage({ 'huchu-defense:muted': 'true' });
    let factoryCalls = 0;
    const audio = new AudioSystem(() => {
      factoryCalls += 1;
      return fake.asAudioContext();
    }, storage, optionsFor(port));

    expect(factoryCalls).toBe(0);
    expect(fake.createdNodes).toBe(0);
    expect(audio.snapshot()).toEqual({
      state: 'locked', muted: true, sfxVoices: 0, bgmVoices: 0, totalVoices: 0,
      transportPhaseSteps: 0, bossLayerActive: false,
    });

    await expect(Promise.all([audio.unlock(), audio.unlock()])).resolves.toEqual([true, true]);
    expect(factoryCalls).toBe(1);
    expect(fake.gains.map(({ gain }) => gain.value)).toEqual([0, 0.65, 0.28]);
    expect(fake.gains[1]?.connections[0]).toBe(fake.gains[0]);
    expect(fake.gains[2]?.connections[0]).toBe(fake.gains[0]);
    expect(fake.gains[0]?.connections[0]).toBe(fake.destination);
    expect(audio.snapshot()).toMatchObject({ state: 'running', muted: true, bgmVoices: 0 });
  });

  it('진행 중인 첫 unlock은 같은 promise로 합쳐 graph 없는 조기 성공과 중복 resume을 막는다', async () => {
    const fake = new FakeAudioContext();
    const audio = new AudioSystem(
      () => fake.asAudioContext(),
      memoryStorage(),
      optionsFor(new RecordingSfxPort()),
    );
    let releaseResume = (): void => undefined;
    fake.resumeBarrier = new Promise<void>((resolve) => {
      releaseResume = resolve;
    });

    const first = audio.unlock();
    const second = audio.unlock();

    expect(second).toBe(first);
    expect(fake.resumeCalls).toBe(1);
    expect(fake.createdNodes).toBe(0);
    releaseResume();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(fake.createdNodes).toBe(3);
  });

  it('unlock pending 중 beginRun 요청을 보존해 graph 생성 직후 첫 run을 정확히 한 번 시작한다', async () => {
    const fake = new FakeAudioContext();
    const sfx = new RecordingSfxPort();
    const sink = new RecordingBgmSink();
    const audio = new AudioSystem(() => fake.asAudioContext(), memoryStorage(), {
      ...optionsFor(sfx),
      bgmTransportFactory: bgmFactoryFor(fake, sink),
    });
    let releaseResume = (): void => undefined;
    fake.resumeBarrier = new Promise<void>((resolve) => {
      releaseResume = resolve;
    });

    const unlocking = audio.unlock();
    audio.beginRun();
    audio.beginRun();

    expect(sfx.resetCalls).toBe(0);
    expect(sink.base).toEqual([]);
    releaseResume();
    await expect(unlocking).resolves.toBe(true);
    expect(sfx.stopAllCalls).toBe(1);
    expect(sfx.resetCalls).toBe(1);
    expect(sink.base.filter(({ step }) => step === 0)).toHaveLength(1);
  });

  it('context 생성 또는 resume 실패 뒤에는 영구 silent no-op이고 어떤 public promise도 reject하지 않는다', async () => {
    let createCalls = 0;
    const createFailure = new AudioSystem(() => {
      createCalls += 1;
      throw new Error('create blocked');
    }, memoryStorage());

    await expect(createFailure.unlock()).resolves.toBe(false);
    await expect(createFailure.unlock()).resolves.toBe(false);
    await expect(createFailure.resumeForLifecycle()).resolves.toBeUndefined();
    expect(createCalls).toBe(1);
    expect(createFailure.play('barkHuchu', { castId: 'silent' })).toBe(false);
    expect(createFailure.snapshot()).toMatchObject({ state: 'silent', sfxVoices: 0, totalVoices: 0 });

    const fake = new FakeAudioContext();
    fake.resumeError = new Error('resume blocked');
    const resumeFailure = new AudioSystem(() => fake.asAudioContext(), memoryStorage());
    await expect(resumeFailure.unlock()).resolves.toBe(false);
    fake.resumeError = null;
    await expect(resumeFailure.unlock()).resolves.toBe(false);
    await expect(resumeFailure.resumeForLifecycle()).resolves.toBeUndefined();
    expect(fake.resumeCalls).toBe(1);
    expect(resumeFailure.snapshot().state).toBe('silent');
  });

  it('canonical event를 exact cue로 route하고 동일 cast damage cue는 SFX cast cap으로 한 번만 난다', async () => {
    const fake = new FakeAudioContext();
    const port = new RecordingSfxPort();
    const audio = new AudioSystem(() => fake.asAudioContext(), memoryStorage(), optionsFor(port));
    await audio.unlock();

    routeEvents().forEach((event) => audio.handle(event));
    audio.handle({
      type: 'damageApplied', castId: 'cast:1', appliedAtStep: 1, targetId: 2, amount: 1,
      effectiveAmount: 1, position: point, impactDirection: point, source: 'bark', strength: 'light', lethal: false,
    });

    expect(port.played.map(({ id }) => id)).toEqual([
      'barkHuchu', 'barkDeokbae', 'aquaCharge', 'noticePaper', 'tailSwipe',
      'aquaImpact', 'skillLearned', 'electricCharge', 'electricImpact', 'hitLight', 'huchuHit',
    ]);
  });

  it('실제 피해가 0인 damageApplied에는 phantom hit SFX를 내지 않는다', async () => {
    const fake = new FakeAudioContext();
    const port = new RecordingSfxPort();
    const audio = new AudioSystem(() => fake.asAudioContext(), memoryStorage(), optionsFor(port));
    await audio.unlock();

    audio.handle({
      type: 'damageApplied', castId: 'already-dead:1', appliedAtStep: 1, targetId: 2, amount: 30,
      effectiveAmount: 0, position: point, impactDirection: { x: 1, y: 0 },
      source: 'aquaBeam', strength: 'heavy', lethal: true,
    });

    expect(port.played).toEqual([]);
  });

  it('안전신문고 impact는 main-thread timer 없이 AudioContext 시각 0/45/90ms에 stamp를 미리 예약한다', async () => {
    const fake = new FakeAudioContext();
    const port = new RecordingSfxPort();
    const audio = new AudioSystem(() => fake.asAudioContext(), memoryStorage(), optionsFor(port));
    await audio.unlock();

    audio.handle({
      type: 'skillImpact', castId: 'safety:4', skillId: 'safetyReport', origin: point,
      targets: [1, 2, 3, 4].map((targetId) => ({ targetId, position: point })),
    });
    audio.handle({
      type: 'damageApplied', castId: 'safety:4', appliedAtStep: 1, targetId: 1, amount: 1,
      effectiveAmount: 1, position: point, impactDirection: point, source: 'safetyReport', strength: 'heavy', lethal: false,
    });
    const stamps = port.played.filter(({ id }) => id === 'noticeStamp');
    expect(stamps.map(({ atMs }) => atMs)).toEqual([0, 0, 0]);
    expect(stamps.map(({ scheduledAtSeconds }) => scheduledAtSeconds)).toEqual([0, 0.045, 0.09]);
    expect(port.played.filter(({ id }) => id === 'hitHeavy')).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);

    vi.setSystemTime(500);
    await vi.advanceTimersByTimeAsync(500);
    expect(port.played.filter(({ id }) => id === 'noticeStamp')).toHaveLength(3);
  });

  it('target 없는 safety impact는 stamp/heavy를 만들지 않고 mute 저장·현재값 구독·lifecycle·destroy를 정리한다', async () => {
    const fake = new FakeAudioContext();
    const port = new RecordingSfxPort();
    const storage = memoryStorage();
    const audio = new AudioSystem(() => fake.asAudioContext(), storage, optionsFor(port));
    const observed: boolean[] = [];
    const unsubscribe = audio.subscribeMute((muted) => observed.push(muted));
    await audio.unlock();

    audio.handle({ type: 'skillImpact', castId: 'empty', skillId: 'safetyReport', origin: point, targets: [] });
    audio.setMuted(true);
    expect(observed).toEqual([false, true]);
    expect(storage.values.get('huchu-defense:muted')).toBe('true');
    expect(fake.gains[0]?.gain.value).toBe(0);

    audio.beginRun();
    expect(port.resetCalls).toBe(1);
    expect(port.stopAllCalls).toBe(1);
    await audio.pauseForLifecycle();
    expect(port.stopAllCalls).toBe(2);
    expect(fake.suspendCalls).toBe(1);
    expect(audio.snapshot().state).toBe('suspended');
    await expect(audio.resumeForLifecycle()).resolves.toBeUndefined();
    expect(fake.resumeCalls).toBe(2);
    expect(audio.snapshot()).toMatchObject({ state: 'running', bgmVoices: 0, transportPhaseSteps: 0, bossLayerActive: false });
    expect(() => audio.tickTransport()).not.toThrow();

    unsubscribe();
    await audio.destroy();
    audio.setMuted(false);
    expect(observed).toEqual([false, true]);
    expect(port.destroyCalls).toBe(1);
    expect(fake.closeCalls).toBe(1);
    expect(fake.gains.every(({ disconnectCalls }) => disconnectCalls === 1)).toBe(true);
    expect(audio.snapshot().state).toBe('silent');
  });

  it('storage 예외는 생성과 mute 변경을 막지 않는다', async () => {
    const fake = new FakeAudioContext();
    const storage: StoragePort = {
      getItem: () => { throw new Error('read denied'); },
      setItem: () => { throw new Error('write denied'); },
    };
    const audio = new AudioSystem(() => fake.asAudioContext(), storage, optionsFor(new RecordingSfxPort()));
    expect(audio.muted()).toBe(false);
    await expect(audio.unlock()).resolves.toBe(true);
    expect(() => audio.setMuted(true)).not.toThrow();
    expect(audio.muted()).toBe(true);
  });

  it('BGM transport factory는 unlock 뒤 정확히 한 번 만들고 beginRun/event/tick을 같은 transport에 연결한다', async () => {
    const fake = new FakeAudioContext();
    const sfx = new RecordingSfxPort();
    const sink = new RecordingBgmSink();
    let factoryCalls = 0;
    const audio = new AudioSystem(() => fake.asAudioContext(), memoryStorage(), {
      ...optionsFor(sfx),
      bgmTransportFactory: bgmFactoryFor(fake, sink, (context, bus) => {
        factoryCalls += 1;
        expect(context).toBe(fake.asAudioContext());
        expect(bus).toBe(fake.gains[2]);
      }),
    });

    expect(factoryCalls).toBe(0);
    expect(fake.createdNodes).toBe(0);
    await audio.unlock();
    await audio.unlock();
    expect(factoryCalls).toBe(1);
    expect(sink.base).toEqual([]);

    audio.beginRun();
    expect(sink.base).toContainEqual({ step: 0, when: 0 });
    vi.setSystemTime(450);
    audio.handle({ type: 'bossActiveChanged', active: true, activeBossCount: 1 });
    audio.handle({ type: 'bossActiveChanged', active: true, activeBossCount: 2 });
    audio.tickTransport();
    expect(sink.boss.filter(({ step }) => step === 4)).toHaveLength(1);
    expect(audio.snapshot()).toMatchObject({ bgmVoices: 6, totalVoices: 6, bossLayerActive: false });
    vi.setSystemTime(600);
    audio.tickTransport();
    expect(audio.snapshot().bossLayerActive).toBe(true);
  });

  it('lifecycle pause는 BGM source/timer를 context suspend 전에 정리하고 resume은 fractional cursor를 유지한다', async () => {
    const lifecycleCalls: string[] = [];
    const fake = new FakeAudioContext(lifecycleCalls);
    const sink = new RecordingBgmSink(lifecycleCalls);
    const audio = new AudioSystem(() => fake.asAudioContext(), memoryStorage(), {
      ...optionsFor(new RecordingSfxPort()),
      bgmTransportFactory: bgmFactoryFor(fake, sink),
    });
    await audio.unlock();
    audio.beginRun();
    vi.setSystemTime(810);

    await audio.pauseForLifecycle();
    expect(lifecycleCalls).toEqual(['bgm-stop', 'context-suspend']);
    expect(audio.snapshot().transportPhaseSteps).toBe(5.4);
    vi.setSystemTime(10_000);
    await audio.resumeForLifecycle();
    expect(audio.snapshot()).toMatchObject({ state: 'running' });
    audio.tickTransport();
    expect(sink.base.at(-1)).toEqual({ step: 6, when: 10.09 });
  });

  it('느린 suspend 중 복귀가 요청돼도 lifecycle 전환을 순서대로 완료해 running으로 끝난다', async () => {
    const fake = new FakeAudioContext();
    const audio = new AudioSystem(
      () => fake.asAudioContext(),
      memoryStorage(),
      optionsFor(new RecordingSfxPort()),
    );
    await audio.unlock();
    audio.beginRun();

    let releaseSuspend = (): void => undefined;
    fake.suspendBarrier = new Promise<void>((resolve) => {
      releaseSuspend = resolve;
    });
    const pausing = audio.pauseForLifecycle();
    const resuming = audio.resumeForLifecycle();
    releaseSuspend();
    await Promise.all([pausing, resuming]);

    expect(fake.suspendCalls).toBe(1);
    expect(fake.resumeCalls).toBe(2);
    expect(audio.snapshot().state).toBe('running');
  });

  it('대기 중 lifecycle이 없으면 resume을 사용자 입력 call stack에서 즉시 시작한다', async () => {
    const fake = new FakeAudioContext();
    const audio = new AudioSystem(
      () => fake.asAudioContext(),
      memoryStorage(),
      optionsFor(new RecordingSfxPort()),
    );
    await audio.unlock();
    fake.state = 'suspended';

    const resuming = audio.resumeForLifecycle();

    expect(fake.resumeCalls).toBe(2);
    await resuming;
    expect(audio.snapshot().state).toBe('running');
  });

  it('비제스처 lifecycle resume 거부는 suspended를 유지하고 다음 사용자 gesture unlock으로 복구한다', async () => {
    const fake = new FakeAudioContext();
    const sink = new RecordingBgmSink();
    const audio = new AudioSystem(() => fake.asAudioContext(), memoryStorage(), {
      ...optionsFor(new RecordingSfxPort()),
      bgmTransportFactory: bgmFactoryFor(fake, sink),
    });
    await audio.unlock();
    audio.beginRun();
    await audio.pauseForLifecycle();
    fake.resumeError = new DOMException('user gesture required', 'NotAllowedError');

    await expect(audio.resumeForLifecycle()).resolves.toBeUndefined();
    expect(audio.snapshot().state).toBe('suspended');

    const scheduledBeforeRecovery = sink.base.length;
    fake.resumeError = null;
    await expect(audio.unlock()).resolves.toBe(true);
    expect(audio.snapshot().state).toBe('running');
    expect(sink.stopAllCalls).toBe(1);
    expect(sink.base.length).toBeGreaterThan(scheduledBeforeRecovery);
  });

  it('최초 user-gesture unlock의 NotAllowedError는 context를 유지하고 다음 gesture에서 graph를 만든다', async () => {
    const fake = new FakeAudioContext();
    const sfx = new RecordingSfxPort();
    fake.resumeError = new DOMException('user gesture required', 'NotAllowedError');
    let factoryCalls = 0;
    const audio = new AudioSystem(() => {
      factoryCalls += 1;
      return fake.asAudioContext();
    }, memoryStorage(), optionsFor(sfx));

    await expect(audio.unlock()).resolves.toBe(false);

    expect(audio.snapshot().state).toBe('suspended');
    expect(factoryCalls).toBe(1);
    expect(fake.createdNodes).toBe(0);
    expect(fake.closeCalls).toBe(0);

    fake.resumeError = null;
    await expect(audio.unlock()).resolves.toBe(true);

    expect(audio.snapshot().state).toBe('running');
    expect(factoryCalls).toBe(1);
    expect(fake.createdNodes).toBe(3);
  });

  it('기존 graph의 user-gesture unlock NotAllowedError도 silent로 닫지 않고 재시도한다', async () => {
    const fake = new FakeAudioContext();
    const audio = new AudioSystem(
      () => fake.asAudioContext(),
      memoryStorage(),
      optionsFor(new RecordingSfxPort()),
    );
    await audio.unlock();
    await audio.pauseForLifecycle();
    fake.resumeError = new DOMException('user gesture required', 'NotAllowedError');

    await expect(audio.unlock()).resolves.toBe(false);

    expect(audio.snapshot().state).toBe('suspended');
    expect(fake.closeCalls).toBe(0);

    fake.resumeError = null;
    await expect(audio.unlock()).resolves.toBe(true);
    expect(audio.snapshot().state).toBe('running');
  });

  it('최초 unlock resume이 pending일 때 pause는 unlock 뒤 실행되어 hidden 최종 상태를 suspended로 고정한다', async () => {
    const fake = new FakeAudioContext();
    const audio = new AudioSystem(
      () => fake.asAudioContext(),
      memoryStorage(),
      optionsFor(new RecordingSfxPort()),
    );
    let releaseResume = (): void => undefined;
    fake.resumeBarrier = new Promise<void>((resolve) => {
      releaseResume = resolve;
    });

    const unlocking = audio.unlock();
    const pausing = audio.pauseForLifecycle();

    expect(fake.suspendCalls).toBe(0);
    releaseResume();
    await Promise.all([unlocking, pausing]);

    expect(fake.resumeCalls).toBe(1);
    expect(fake.suspendCalls).toBe(1);
    expect(audio.snapshot().state).toBe('suspended');
  });

  it('destroy 중 완료된 pending unlock은 false로 합쳐지고 context를 한 번만 닫는다', async () => {
    const fake = new FakeAudioContext();
    const sfx = new RecordingSfxPort();
    const audio = new AudioSystem(() => fake.asAudioContext(), memoryStorage(), optionsFor(sfx));
    let releaseResume = (): void => undefined;
    fake.resumeBarrier = new Promise<void>((resolve) => {
      releaseResume = resolve;
    });

    const unlocking = audio.unlock();
    const coalescedUnlock = audio.unlock();
    expect(coalescedUnlock).toBe(unlocking);
    const destroying = audio.destroy();
    releaseResume();

    await expect(Promise.all([unlocking, coalescedUnlock])).resolves.toEqual([false, false]);
    await expect(destroying).resolves.toBeUndefined();
    expect(fake.closeCalls).toBe(1);
    expect(fake.createdNodes).toBe(0);
    expect(sfx.destroyCalls).toBe(0);
    expect(audio.snapshot().state).toBe('silent');
  });

  it('concurrent destroy 호출은 같은 pending completion을 반환하고 teardown을 한 번만 수행한다', async () => {
    const fake = new FakeAudioContext();
    const sfx = new RecordingSfxPort();
    const audio = new AudioSystem(() => fake.asAudioContext(), memoryStorage(), optionsFor(sfx));
    await audio.unlock();
    let releaseClose = (): void => undefined;
    fake.closeBarrier = new Promise<void>((resolve) => {
      releaseClose = resolve;
    });

    const first = audio.destroy();
    const second = audio.destroy();

    expect(second).toBe(first);
    expect(sfx.destroyCalls).toBe(1);
    expect(fake.closeCalls).toBe(1);
    releaseClose();
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
  });

  it('SFX teardown이 throw해도 BGM/bus/context 전체를 all-attempt 정리하고 destroy는 resolve한다', async () => {
    const fake = new FakeAudioContext();
    const sfx = new RecordingSfxPort();
    const sink = new RecordingBgmSink();
    const audio = new AudioSystem(() => fake.asAudioContext(), memoryStorage(), {
      ...optionsFor(sfx),
      bgmTransportFactory: bgmFactoryFor(fake, sink),
    });
    await audio.unlock();
    audio.beginRun();
    sfx.destroyError = new Error('sfx teardown failed');
    fake.gains[1]!.disconnectError = new Error('sfx bus disconnect failed');

    await expect(audio.destroy()).resolves.toBeUndefined();

    expect(sfx.destroyCalls).toBe(1);
    expect(sink.stopAllCalls).toBe(1);
    expect(fake.gains.every(({ disconnectCalls }) => disconnectCalls === 1)).toBe(true);
    expect(fake.closeCalls).toBe(1);
    expect(audio.snapshot().state).toBe('silent');
  });

  it('silent 전환 teardown이 throw해도 unlock은 false로 resolve하고 context를 닫는다', async () => {
    const fake = new FakeAudioContext();
    const sfx = new RecordingSfxPort();
    const sink = new RecordingBgmSink();
    const audio = new AudioSystem(() => fake.asAudioContext(), memoryStorage(), {
      ...optionsFor(sfx),
      bgmTransportFactory: bgmFactoryFor(fake, sink),
    });
    await audio.unlock();
    await audio.pauseForLifecycle();
    sfx.destroyError = new Error('silent sfx teardown failed');
    fake.resumeError = new Error('resume device failure');

    await expect(audio.unlock()).resolves.toBe(false);

    expect(sfx.destroyCalls).toBe(1);
    expect(sink.stopAllCalls).toBe(1);
    expect(fake.gains.every(({ disconnectCalls }) => disconnectCalls === 1)).toBe(true);
    expect(fake.closeCalls).toBe(1);
    expect(audio.snapshot().state).toBe('silent');
  });

  it('destroy는 앞서 시작된 silent context close가 끝날 때까지 같은 ownership completion을 기다린다', async () => {
    const fake = new FakeAudioContext();
    const audio = new AudioSystem(
      () => fake.asAudioContext(),
      memoryStorage(),
      optionsFor(new RecordingSfxPort()),
    );
    await audio.unlock();
    await audio.pauseForLifecycle();
    fake.resumeError = new Error('resume device failure');
    let releaseClose = (): void => undefined;
    fake.closeBarrier = new Promise<void>((resolve) => {
      releaseClose = resolve;
    });

    const failingUnlock = audio.unlock();
    await vi.waitFor(() => expect(fake.closeCalls).toBe(1));
    let destroySettled = false;
    const destroying = audio.destroy().then(() => { destroySettled = true; });
    await Promise.resolve();

    expect(destroySettled).toBe(false);
    releaseClose();
    await expect(Promise.all([failingUnlock, destroying])).resolves.toEqual([false, undefined]);
    expect(fake.closeCalls).toBe(1);
  });

  it('runEnded에서 BGM bus fade를 즉시 시작하고 1200ms 뒤 resultReady가 중복 fade하지 않는다', async () => {
    const fake = new FakeAudioContext();
    const sink = new RecordingBgmSink();
    const audio = new AudioSystem(() => fake.asAudioContext(), memoryStorage(), {
      ...optionsFor(new RecordingSfxPort()),
      bgmTransportFactory: bgmFactoryFor(fake, sink),
    });
    await audio.unlock();
    audio.beginRun();

    audio.handle({ type: 'runEnded', outcome: 'lost' });
    expect(fake.gains[2]?.gain.ramps).toEqual([{ value: 0, at: 0.6 }]);
    await vi.advanceTimersByTimeAsync(600);
    expect(sink.stopAllCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(600);
    audio.handle({ type: 'resultReady', outcome: 'lost' });
    expect(fake.gains[2]?.gain.ramps).toEqual([{ value: 0, at: 0.6 }]);

    const scheduledBeforeRestart = sink.base.length;
    audio.beginRun();
    expect(fake.gains[2]?.gain.value).toBe(0.28);
    expect(sink.base.slice(scheduledBeforeRestart)).toContainEqual({ step: 0, when: 1.2 });
  });

  it('600ms fade 도중 재시작해도 이전 gain automation을 취소하고 새 첫 bar를 유지한다', async () => {
    const fake = new FakeAudioContext();
    const sink = new RecordingBgmSink();
    const audio = new AudioSystem(() => fake.asAudioContext(), memoryStorage(), {
      ...optionsFor(new RecordingSfxPort()),
      bgmTransportFactory: bgmFactoryFor(fake, sink),
    });
    await audio.unlock();
    audio.beginRun();
    audio.handle({ type: 'runEnded', outcome: 'lost' });
    await vi.advanceTimersByTimeAsync(100);

    const scheduledBeforeRestart = sink.base.length;
    audio.beginRun();
    expect(fake.gains[2]?.gain.cancellations).toContain(0.1);
    expect(fake.gains[2]?.gain.value).toBe(0.28);
    expect(sink.base.slice(scheduledBeforeRestart)).toContainEqual({ step: 0, when: 0.1 });
    await vi.advanceTimersByTimeAsync(500);
    expect(sink.stopAllCalls).toBe(1);
  });
});
