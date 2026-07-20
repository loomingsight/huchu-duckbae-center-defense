import { ProgressionSystem } from '../../src/game/progression/ProgressionSystem';

describe('ProgressionSystem', () => {
  it('malformed purchase ID를 queue 상태 변경 전에 거부하고 이후 valid purchase를 허용한다', () => {
    const progression = new ProgressionSystem();
    progression.addSnacks(40);
    const before = progression.snapshot();

    expect(() => progression.queuePurchase('bark' as never)).toThrow(RangeError);
    expect(progression.snapshot()).toEqual(before);

    expect(progression.queuePurchase('tailSwipe')).toMatchObject({
      status: 'queued', skillId: 'tailSwipe', snacks: 40,
    });
    expect(progression.consumeQueuedPurchase()).toMatchObject({
      status: 'learned', skillId: 'tailSwipe', spent: 15, snacks: 25,
    });
  });

  it('첫 command만 queue하고 다음 step에 15를 원자적으로 차감한다', () => {
    const progression = new ProgressionSystem();
    progression.addSnacks(40);

    expect(progression.queuePurchase('tailSwipe')).toEqual({
      status: 'queued',
      skillId: 'tailSwipe',
      cost: 15,
      spent: 0,
      snacks: 40,
      nextCost: 15,
    });
    expect(progression.queuePurchase('aquaBeam')).toEqual({
      status: 'queueBusy',
      skillId: 'aquaBeam',
      cost: 15,
      spent: 0,
      snacks: 40,
      nextCost: 15,
    });
    expect(progression.consumeQueuedPurchase()).toEqual({
      status: 'learned',
      skillId: 'tailSwipe',
      cost: 15,
      spent: 15,
      snacks: 25,
      nextCost: 25,
    });
    expect(progression.snapshot()).toEqual({
      snacks: 25,
      learned: { tailSwipe: true, aquaBeam: false, safetyReport: false },
      queuedSkillId: null,
      nextCost: 25,
    });
  });

  it('습득 순서와 무관하게 비용을 15, 25, 40 순서로 적용하고 모두 배우면 null을 반환한다', () => {
    const progression = new ProgressionSystem();
    progression.addSnacks(80);

    expect(progression.queuePurchase('safetyReport').cost).toBe(15);
    expect(progression.consumeQueuedPurchase()).toMatchObject({
      status: 'learned', skillId: 'safetyReport', spent: 15, nextCost: 25,
    });
    expect(progression.queuePurchase('tailSwipe').cost).toBe(25);
    expect(progression.consumeQueuedPurchase()).toMatchObject({
      status: 'learned', skillId: 'tailSwipe', spent: 25, nextCost: 40,
    });
    expect(progression.queuePurchase('aquaBeam').cost).toBe(40);
    expect(progression.consumeQueuedPurchase()).toMatchObject({
      status: 'learned', skillId: 'aquaBeam', spent: 40, snacks: 0, nextCost: null,
    });
    expect(progression.snapshot()).toEqual({
      snacks: 0,
      learned: { tailSwipe: true, aquaBeam: true, safetyReport: true },
      queuedSkillId: null,
      nextCost: null,
    });
  });

  it('비용 부족과 이미 배운 기술 요청은 상태를 바꾸지 않는다', () => {
    const progression = new ProgressionSystem();
    progression.addSnacks(14);
    const beforeInsufficient = progression.snapshot();

    expect(progression.queuePurchase('aquaBeam')).toEqual({
      status: 'insufficientSnacks',
      skillId: 'aquaBeam',
      cost: 15,
      spent: 0,
      snacks: 14,
      nextCost: 15,
    });
    expect(progression.snapshot()).toEqual(beforeInsufficient);

    progression.addSnacks(1);
    progression.queuePurchase('aquaBeam');
    progression.consumeQueuedPurchase();
    const beforeDuplicate = progression.snapshot();

    expect(progression.queuePurchase('aquaBeam')).toEqual({
      status: 'alreadyLearned',
      skillId: 'aquaBeam',
      cost: 25,
      spent: 0,
      snacks: 0,
      nextCost: 25,
    });
    expect(progression.snapshot()).toEqual(beforeDuplicate);
  });

  it('빈 queue 소비는 undefined이고 reset은 간식, 습득, queue를 초기화한다', () => {
    const progression = new ProgressionSystem();
    expect(progression.consumeQueuedPurchase()).toBeUndefined();

    progression.addSnacks(40);
    progression.queuePurchase('tailSwipe');
    progression.consumeQueuedPurchase();
    progression.queuePurchase('aquaBeam');
    progression.reset();

    expect(progression.snapshot()).toEqual({
      snacks: 0,
      learned: { tailSwipe: false, aquaBeam: false, safetyReport: false },
      queuedSkillId: null,
      nextCost: 15,
    });
    expect(progression.consumeQueuedPurchase()).toBeUndefined();
  });

  it('유효하지 않은 간식과 unsafe 합계는 기존 상태를 바꾸지 않는다', () => {
    const progression = new ProgressionSystem();
    progression.addSnacks(1);

    for (const amount of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => progression.addSnacks(amount)).toThrow(RangeError);
    }

    progression.addSnacks(Number.MAX_SAFE_INTEGER - 1);
    const beforeUnsafeTotal = progression.snapshot();
    expect(() => progression.addSnacks(1)).toThrow(RangeError);
    expect(progression.snapshot()).toEqual(beforeUnsafeTotal);
  });
});
