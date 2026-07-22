import { MovementTrail } from '../../src/game/world/MovementTrail';

describe('MovementTrail', () => {
  it('현재 위치에서 요청 거리만큼 뒤의 pose를 선형 보간한다', () => {
    const trail = new MovementTrail(140);
    trail.reset({ x: 0, y: 0 }, { x: 1, y: 0 });
    trail.push({ x: 40, y: 0 }, { x: 1, y: 0 });
    trail.push({ x: 80, y: 40 }, { x: 0, y: 1 });

    const pose = trail.sampleBehind(40);

    expect(pose.position.x).toBeCloseTo(51.715_728_75, 8);
    expect(pose.position.y).toBeCloseTo(11.715_728_75, 8);
    expect(Math.hypot(pose.heading.x, pose.heading.y)).toBeCloseTo(1, 10);
  });

  it('reset은 시작점 뒤 140px의 가상 궤적을 만들어 첫 프레임 트럭 간격을 보존한다', () => {
    const trail = new MovementTrail(140);
    trail.reset({ x: 100, y: 200 }, { x: 0, y: 1 });

    expect(trail.sampleBehind(70)).toEqual({
      position: { x: 100, y: 130 },
      heading: { x: 0, y: 1 },
    });
    expect(trail.sampleBehind(1000)).toEqual({
      position: { x: 100, y: 60 },
      heading: { x: 0, y: 1 },
    });
  });

  it('같은 위치 push는 마지막 heading만 갱신한다', () => {
    const trail = new MovementTrail(140);
    trail.reset({ x: 10, y: 20 }, { x: 1, y: 0 });

    trail.push({ x: 10, y: 20 }, { x: 0, y: 1 });

    expect(trail.sampleBehind(0)).toEqual({
      position: { x: 10, y: 20 },
      heading: { x: 0, y: 1 },
    });
  });

  it.each([
    () => new MovementTrail(0),
    () => new MovementTrail(Number.NaN),
    () => new MovementTrail(140).reset({ x: Number.NaN, y: 0 }, { x: 1, y: 0 }),
    () => new MovementTrail(140).reset({ x: 0, y: 0 }, { x: 0, y: 0 }),
    () => new MovementTrail(140).sampleBehind(-1),
  ])('유효하지 않은 입력을 거부한다', (call) => {
    expect(call).toThrow(RangeError);
  });
});
