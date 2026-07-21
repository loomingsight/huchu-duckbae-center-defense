# Center-Outward Tail Knockback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 꼬리치기의 실제 경로 넉백은 유지하면서 순간 리코일을 보호소 중심에서 적 바깥쪽으로 표시하고, 기존 백로그 변경을 안전하게 커밋해 GitHub Pages에 배포한다.

**Architecture:** `EnemySystem.applyTailEffect()`의 경로 진행도 35px 감소는 그대로 둔다. `ImpactFeedbackSystem`이 꼬리치기 피해 이벤트에 한해서 `BALANCE.shelter` 중심과 피격 위치로 바깥 방향을 계산하며, 나머지 피해원은 기존 충격 방향 역벡터를 사용한다.

**Tech Stack:** TypeScript 7, Phaser 4, Vitest 4, Playwright 1.61, Vite 8, GitHub Actions Pages

## Global Constraints

- 보호소 중심은 `BALANCE.shelter.x === 270`, `BALANCE.shelter.y === 480`을 단일 기준으로 사용한다.
- 피격 적이 중심과 같은 좌표이면 넉백 기본 방향은 `(0, -1)`이다.
- 피해량, 35px 경로 넉백, 둔화, 판정 범위, 쿨다운과 다른 공격의 피격 방향은 변경하지 않는다.
- 사용자 소유 `tests/visual/**/asset-review.png` 두 파일은 스테이징하거나 수정하지 않는다.
- Pages 배포는 검증된 HEAD를 `origin/main`에 fast-forward 푸시해 실행한다.

---

### Task 1: 꼬리치기 리코일 방향

**Files:**
- Modify: `tests/unit/ImpactFeedbackSystem.test.ts`
- Modify: `src/game/combat/ImpactFeedbackSystem.ts`

**Interfaces:**
- Consumes: `DamageAppliedEvent.position`, `DamageAppliedEvent.source`, `BALANCE.shelter`
- Produces: `centerOutwardDirection(position: Point): Point`와 꼬리치기 전용 `ImpactFeedbackTarget.recoil().direction`

- [x] **Step 1: 중앙 바깥 방향을 요구하는 실패 테스트 작성**

```ts
it('꼬리치기 적 리코일은 공격자 방향과 무관하게 보호소 중앙에서 바깥쪽을 향한다', () => {
  const east = fakeTarget();
  const centered = fakeTarget();
  const targets = new Map([[7, east], [8, centered]]);
  const feedback = new ImpactFeedbackSystem({
    enemyTarget: (targetId) => targets.get(targetId),
    shelterTarget: fakeTarget(),
  });

  feedback.handle(hit({
    targetId: 7,
    source: 'tailSwipe',
    strength: 'medium',
    position: { x: 300, y: 480 },
    impactDirection: { x: 0, y: -1 },
  }));
  feedback.handle(hit({
    castId: 'tail:center',
    targetId: 8,
    source: 'tailSwipe',
    strength: 'medium',
    position: { x: 270, y: 480 },
    impactDirection: { x: 1, y: 0 },
  }));

  expect(east.lastRecoil?.direction).toEqual({ x: 1, y: 0 });
  expect(centered.lastRecoil?.direction).toEqual({ x: 0, y: -1 });
});
```

- [x] **Step 2: 실패 이유 확인**

Run: `npm run test:unit -- --run tests/unit/ImpactFeedbackSystem.test.ts -t "꼬리치기 적 리코일"`

Expected: 현재 구현이 `inverse(event.impactDirection)`을 사용하므로 동쪽 적은 `{ x: 0, y: 1 }`, 중앙 적은 `{ x: -1, y: 0 }`을 반환해 FAIL

- [x] **Step 3: 최소 구현 작성**

```ts
import { BALANCE } from '../data/balance';

const DEFAULT_CENTER_OUTWARD_DIRECTION: Point = { x: 0, y: -1 };

private applyTargetFeedback(target: ImpactFeedbackTarget, event: ImpactEvent): void {
  const style = IMPACT_STYLE[event.strength];
  const reduced = this.options.reducedMotion?.() ?? false;
  target.flash(style.flashMs);
  target.recoil({
    direction: event.type === 'damageApplied' && event.source === 'tailSwipe'
      ? centerOutwardDirection(event.position)
      : inverse(event.impactDirection),
    distancePx: reduced ? style.recoilPx / 2 : style.recoilPx,
    popScale: reduced ? 1 + (style.popScale - 1) / 2 : style.popScale,
    durationMs: style.flashMs,
  });
}

function centerOutwardDirection(position: Point): Point {
  const dx = position.x - BALANCE.shelter.x;
  const dy = position.y - BALANCE.shelter.y;
  const length = Math.hypot(dx, dy);
  return length === 0
    ? { ...DEFAULT_CENTER_OUTWARD_DIRECTION }
    : { x: dx / length, y: dy / length };
}
```

- [x] **Step 4: 관련 단위 테스트 통과 확인**

Run: `npm run test:unit -- --run tests/unit/ImpactFeedbackSystem.test.ts tests/unit/EnemySystem.test.ts tests/unit/GameSession.test.ts`

Expected: 3개 파일 전체 PASS, 기존 비꼬리 공격의 역방향 리코일 테스트 유지

---

### Task 2: 전체 회귀 검증과 논리적 커밋

**Files:**
- Modify: `src/game/assets/CombatShapeAtlas.ts`
- Modify: `src/game/combat/CombatEffectPool.ts`
- Modify: `src/game/combat/ImpactFeedbackSystem.ts`
- Modify: `src/game/waves/WaveSystem.ts`
- Modify: `tests/unit/CombatEffectPool.test.ts`
- Modify: `tests/unit/CombatShapeAtlas.test.ts`
- Modify: `tests/unit/HudV2.test.ts`
- Modify: `tests/unit/ImpactFeedbackSystem.test.ts`
- Modify: `tests/unit/WaveSystem.test.ts`
- Create: `docs/backlog.md`
- Create: `docs/superpowers/plans/2026-07-21-backlog-implementation.md`
- Create: `docs/superpowers/plans/2026-07-21-center-outward-knockback-implementation.md`

**Interfaces:**
- Consumes: Task 1의 꼬리치기 방향 규칙과 이미 구현된 보스·꼬리치기·안전신문고 백로그 변경
- Produces: 검증된 기능 커밋과 문서 커밋

- [x] **Step 1: 전체 단위 테스트와 빌드를 병렬 실행**

Run: `npm run test:unit`

Expected: 모든 Vitest 파일과 테스트가 PASS

Run: `npm run build`

Expected: TypeScript 검사와 Vite 프로덕션 빌드 PASS. 기존 500kB chunk 경고만 허용

- [x] **Step 2: 모바일 기능 회귀 테스트 실행**

Run: `npx playwright test tests/e2e/skill-dock.spec.ts --project=mobile-chromium --workers=1`

Expected: 기술 구매·HUD·조이스틱 3개 시나리오 PASS

- [x] **Step 3: 기능 파일만 명시적으로 스테이징하고 커밋**

```bash
git add src/game/assets/CombatShapeAtlas.ts \
  src/game/combat/CombatEffectPool.ts \
  src/game/combat/ImpactFeedbackSystem.ts \
  src/game/waves/WaveSystem.ts \
  tests/unit/CombatEffectPool.test.ts \
  tests/unit/CombatShapeAtlas.test.ts \
  tests/unit/HudV2.test.ts \
  tests/unit/ImpactFeedbackSystem.test.ts \
  tests/unit/WaveSystem.test.ts
git commit -m "feat: 전투 백로그 연출 개선"
```

- [x] **Step 4: 문서 파일만 스테이징하고 커밋**

```bash
git add docs/backlog.md \
  docs/superpowers/plans/2026-07-21-backlog-implementation.md \
  docs/superpowers/plans/2026-07-21-center-outward-knockback-implementation.md
git commit -m "docs: 전투 백로그 구현 기록"
```

- [ ] **Step 5: 커밋 범위 확인**

Run: `git log --oneline -5 && git status --short`

Expected: 설계·기능·문서 커밋이 보이고, 남은 변경은 사용자 소유 `asset-review.png` 두 파일뿐

---

### Task 3: GitHub Pages 배포

**Files:**
- Verify: `.github/workflows/deploy-pages.yml`
- Verify: `vite.config.ts`

**Interfaces:**
- Consumes: Task 2의 검증된 HEAD와 `origin/main`
- Produces: GitHub Pages 배포 실행 및 공개 URL 검증 근거

- [ ] **Step 1: 원격 main fast-forward 가능 여부 확인**

```bash
git fetch origin
git merge-base --is-ancestor origin/main HEAD
```

Expected: exit 0

- [ ] **Step 2: 작업 브랜치와 main에 푸시**

```bash
git push origin codex/huchu-defense-mvp
git push origin HEAD:main
```

Expected: 두 ref가 새 HEAD로 fast-forward되고 main push가 `Deploy GitHub Pages`를 실행

- [ ] **Step 3: Pages 워크플로 완료 확인**

```bash
gh run list --workflow deploy-pages.yml --branch main --limit 1
gh run watch <run-id> --exit-status
```

Expected: 최신 main SHA의 workflow conclusion이 `success`

- [ ] **Step 4: 공개 페이지 응답 확인**

Run: `curl -I https://loomingsight.github.io/huchu-duckbae-center-defense/`

Expected: HTTP 200
