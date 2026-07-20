import { analyzePerformanceWindow } from '../performance/PerformanceWindow';

it('29,998ms 샘플도 30개 full bucket과 마지막 4초 저하 streak를 평가한다', () => {
  const samples = Array.from({ length: 30 }, (_, second) => {
    const fps = second >= 26 ? 49 : 60;
    return Array.from({ length: fps }, (_, frame) => ({
      offsetMs: second * 1000 + (frame + 1) * 998 / fps,
      deltaMs: 1000 / fps,
    }));
  }).flat();

  const stats = analyzePerformanceWindow(samples);

  expect(stats.sampledMs).toBe(29_998);
  expect(stats.evaluatedBucketCount).toBe(30);
  expect(stats.oneSecondBuckets.slice(26)).toEqual([49, 49, 49, 49]);
  expect(stats.maxLowStreakSeconds).toBe(4);
});
