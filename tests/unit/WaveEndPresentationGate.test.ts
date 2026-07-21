import { describe, expect, it } from 'vitest';
import { WaveEndPresentationGate } from '../../src/game/presentation/WaveEndPresentationGate';

describe('WaveEndPresentationGate', () => {
  it('연출이 남아 있으면 countdown을 보관하고 정리된 순간 정확히 한 번 반환한다', () => {
    const gate = new WaveEndPresentationGate();
    const intent = { kind: 'countdown' } as const;

    gate.defer(intent);

    expect(gate.blocking).toBe(true);
    expect(gate.releaseIf(false)).toBeNull();
    expect(gate.releaseIf(true)).toEqual(intent);
    expect(gate.blocking).toBe(false);
    expect(gate.releaseIf(true)).toBeNull();
  });

  it('동일 의도 중복은 무시하고 서로 다른 의도 충돌은 거부한다', () => {
    const gate = new WaveEndPresentationGate();
    gate.defer({ kind: 'result', outcome: 'won' });

    expect(() => gate.defer({ kind: 'result', outcome: 'won' })).not.toThrow();
    expect(() => gate.defer({ kind: 'countdown' })).toThrow('Conflicting wave-end intent');
  });

  it('reset은 대기 중인 의도를 제거한다', () => {
    const gate = new WaveEndPresentationGate();
    gate.defer({ kind: 'countdown' });

    gate.reset();

    expect(gate.blocking).toBe(false);
    expect(gate.releaseIf(true)).toBeNull();
  });
});
