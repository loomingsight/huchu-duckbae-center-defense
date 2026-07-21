import { describe, expect, it } from 'vitest';
import { bossSpawnFeedback } from '../../src/game/presentation/BossSpawnFeedback';

describe('bossSpawnFeedback', () => {
  it.each(['dogTrader', 'illegalBreeder'] as const)('%s는 짧고 분명한 등장 진동을 반환한다', (kind) => {
    expect(bossSpawnFeedback(kind, false)).toEqual({ durationMs: 140, intensity: 0.005 });
  });

  it.each(['poopGuardian', 'offLeashGuardian'] as const)('%s 일반 적은 진동하지 않는다', (kind) => {
    expect(bossSpawnFeedback(kind, false)).toBeNull();
  });

  it('reduced-motion에서는 보스도 화면을 흔들지 않는다', () => {
    expect(bossSpawnFeedback('dogTrader', true)).toBeNull();
  });
});
