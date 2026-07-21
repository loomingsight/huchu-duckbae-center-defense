# Huchu Mouth-Origin Attacks and Selection Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 짖기와 아쿠아빔의 시각 효과를 후추 입에서 시작하게 하고, 모바일·데스크톱 게임 조작 중 텍스트 선택과 iOS 터치 콜아웃을 막은 뒤 GitHub Pages에 배포한다.

**Architecture:** 공격 판정과 자동 조준은 `GameSession`의 기존 이벤트 값을 그대로 유지한다. `PlayerView`가 공격 대상 방향에 맞춰 후추 스프라이트의 좌우 반전을 결정하고, 발 위치 기반 논리 좌표를 입 위치 기반 시각 좌표로 변환한다. `GameScene`은 변환된 좌표를 짖기와 아쿠아빔 렌더러에만 전달한다. 텍스트 선택 방지는 `#game-root` 하위에만 CSS로 적용해 버튼의 클릭·키보드 포커스와 게임 바깥 문서는 보존한다.

**Tech Stack:** TypeScript 7, Phaser 4, Vitest 4, Playwright CLI, Vite 8, GitHub Actions Pages

## Global Constraints

- 짖기·아쿠아빔의 대상 선정, 피해량, 공격 범위, 시전 시점과 쿨다운은 변경하지 않는다.
- 후추 공격 스프라이트의 실제 입 위치에 맞춘 논리 오프셋은 우측 기준 `(32, -45)`이며, 좌측 공격 시 X 오프셋만 반전한다.
- 텍스트 선택 방지 범위는 `#game-root`와 자손에 한정한다.
- 조이스틱 드래그, 기술 버튼 클릭, 키보드 포커스와 접근성 이름은 유지한다.
- 사용자 소유 `tests/visual/**/asset-review.png` 두 파일은 스테이징하거나 수정하지 않는다.
- 검증된 HEAD만 `origin/main`에 fast-forward 푸시해 Pages를 배포한다.

---

### Task 1: 후추 입 좌표 계산 계약

**Files:**
- Modify: `tests/unit/PlayerViewImpactAction.test.ts`
- Modify: `src/game/player/PlayerView.ts`

**Interfaces:**
- Consumes: 논리 발 위치 `origin`, 자동 조준 대상 `target`
- Produces: 시각 효과 시작점 `attackOrigin(origin, target)`과 후추 스프라이트 좌우 반전

- [x] **Step 1: 우측·좌측 입 좌표를 고정하는 실패 테스트 작성**

```ts
const attackOrigin = (view as unknown as {
  attackOrigin?: (origin: Point, target: Point) => Point;
}).attackOrigin;
expect(attackOrigin).toBeTypeOf('function');
if (attackOrigin === undefined) return;

expect(attackOrigin.call(view, { x: 270, y: 650 }, { x: 370, y: 650 }))
  .toEqual({ x: 302, y: 605 });
expect(fake.last('setFlipX')).toEqual([false]);
expect(attackOrigin.call(view, { x: 270, y: 650 }, { x: 170, y: 650 }))
  .toEqual({ x: 238, y: 605 });
expect(fake.last('setFlipX')).toEqual([true]);
```

- [x] **Step 2: 실패 이유 확인**

Run: `npm run test:unit -- --run tests/unit/PlayerViewImpactAction.test.ts -t "공격 시각 효과는 후추 입에서 시작"`

Expected: `PlayerView.attackOrigin`이 없어 assertion FAIL

- [x] **Step 3: 최소 구현 작성**

```ts
const HUCHU_MOUTH_OFFSET_X = 32;
const HUCHU_MOUTH_OFFSET_Y = -45;

attackOrigin(origin: Point, target: Point): Point {
  const flipX = target.x < origin.x;
  this.sprite.setFlipX(flipX);
  return {
    x: origin.x + (flipX ? -HUCHU_MOUTH_OFFSET_X : HUCHU_MOUTH_OFFSET_X),
    y: origin.y + HUCHU_MOUTH_OFFSET_Y,
  };
}
```

- [x] **Step 4: 관련 단위 테스트 통과 확인**

Run: `npm run test:unit -- --run tests/unit/PlayerViewImpactAction.test.ts`

Expected: 전체 PASS

---

### Task 2: 짖기·아쿠아빔 렌더링 배선

**Files:**
- Modify: `tests/unit/GameScenePresentationAdapter.test.ts`
- Modify: `src/game/scenes/GameScene.ts`

**Interfaces:**
- Consumes: `barkImpact.origin/direction`, `skillCastStarted.origin/targets`
- Produces: `PlayerView.attackOrigin()`으로 변환된 `showBarkWave()`와 `startAquaBeam()` 시작점

- [x] **Step 1: 두 공격이 입 좌표 변환을 사용하는 실패 테스트 작성**

```ts
expect(apply.match(/this\.playerView\.attackOrigin/g)).toHaveLength(2);
expect(apply).toContain('this.playerView.showBarkWave(origin, target)');
expect(apply).toContain('this.combatEffects.startAquaBeam(event.castId, origin, target)');
```

- [x] **Step 2: 실패 이유 확인**

Run: `npm run test:unit -- --run tests/unit/GameScenePresentationAdapter.test.ts -t "짖기와 아쿠아빔은 후추 입 좌표"`

Expected: 현재 어댑터가 이벤트의 발 위치 `event.origin`을 직접 전달해 FAIL

- [x] **Step 3: 시각 배선만 최소 변경**

```ts
const aimTarget = {
  x: event.origin.x + event.direction.x * 100,
  y: event.origin.y + event.direction.y * 100,
};
const origin = this.playerView.attackOrigin(event.origin, aimTarget);
const target = {
  x: origin.x + event.direction.x * 100,
  y: origin.y + event.direction.y * 100,
};
this.playerView.showBarkWave(origin, target);
```

이렇게 부채꼴 시작점만 입으로 옮기고 기존 방향 벡터는 그대로 보존한다. 아쿠아빔은 `event.targets[0]`을 `target`으로 두고 `target.position`을 좌우 방향 판단에 사용한다. 논리 이벤트와 판정 코드는 수정하지 않는다.

- [x] **Step 4: 프레젠테이션 관련 테스트 통과 확인**

Run: `npm run test:unit -- --run tests/unit/PlayerViewImpactAction.test.ts tests/unit/GameScenePresentationAdapter.test.ts`

Expected: 전체 PASS

---

### Task 3: 게임 영역 텍스트 선택 방지

**Files:**
- Modify: `tests/unit/HudV2.test.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `#game-root`와 그 하위 Canvas/HUD/버튼
- Produces: `user-select: none`, `-webkit-touch-callout: none`

- [x] **Step 1: CSS 범위를 고정하는 실패 테스트 작성**

```ts
expect(styles).toContain(
  '#game-root, #game-root * { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }',
);
expect(styles).not.toContain('html, body, #game-root, #game-root *');
```

- [x] **Step 2: 실패 이유 확인**

Run: `npm run test:unit -- --run tests/unit/HudV2.test.ts -t "텍스트 선택과 iOS 터치 콜아웃"`

Expected: 선택 방지 규칙이 아직 없어 FAIL

- [x] **Step 3: 게임 루트 범위 CSS 추가**

```css
#game-root, #game-root * { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
```

- [x] **Step 4: HUD 단위 테스트 통과 확인**

Run: `npm run test:unit -- --run tests/unit/HudV2.test.ts`

Expected: 전체 PASS

---

### Task 4: 회귀 검증, 기록, 커밋과 Pages 배포

**Files:**
- Modify: `docs/backlog.md`
- Modify: `docs/superpowers/plans/2026-07-21-mouth-origin-and-selection-implementation.md`
- Verify: `.github/workflows/deploy-pages.yml`
- Verify: `vite.config.ts`

**Interfaces:**
- Consumes: Task 1~3 구현과 기존 사용자 변경
- Produces: 완료 근거, 검증된 커밋, 공개 Pages 배포

- [x] **Step 1: 백로그 HD-BL-005·006을 완료로 이동하고 검증 근거 기록**

두 항목의 상태를 `완료 (2026-07-21)`로 변경하고 입 좌표 단위 테스트, CSS 범위 테스트, 실제 모바일 뷰포트 검증 근거를 적는다.

- [x] **Step 2: 전체 단위 테스트와 프로덕션 빌드 실행**

Run: `npm run test:unit`

Expected: 전체 PASS

Run: `npm run build`

Expected: TypeScript와 Vite 빌드 PASS. 기존 chunk-size 경고만 허용

- [x] **Step 3: Playwright CLI로 모바일 동작 확인**

`npm run dev:e2e`를 실행하고 390x844 뷰포트에서 `skill-dock` 시나리오를 연다. 아쿠아빔이 후추의 입에서 시작하는 프레임을 확인하고, `#game-root`와 기술 버튼의 computed `user-select`가 `none`인지 및 텍스트 드래그 후 선택 문자열이 비어 있는지 확인한다.

- [ ] **Step 4: 기능을 논리적 단위로 커밋**

```bash
git add src/game/player/PlayerView.ts src/game/scenes/GameScene.ts \
  tests/unit/PlayerViewImpactAction.test.ts tests/unit/GameScenePresentationAdapter.test.ts
git commit -m "feat: 후추 입 기준 공격 연출 적용"

git add src/styles.css tests/unit/HudV2.test.ts
git commit -m "fix: 게임 영역 텍스트 선택 방지"

git add docs/backlog.md docs/superpowers/plans/2026-07-21-mouth-origin-and-selection-implementation.md
git commit -m "docs: 공격 연출 백로그 완료 기록"
```

- [ ] **Step 5: 원격 main fast-forward 가능 여부 확인 후 푸시**

```bash
git fetch origin
git merge-base --is-ancestor origin/main HEAD
git push origin codex/huchu-defense-mvp
git push origin HEAD:main
```

Expected: 작업 브랜치와 main 모두 새 HEAD로 fast-forward

- [ ] **Step 6: Pages 워크플로와 공개 URL 확인**

```bash
gh run list --repo loomingsight/huchu-duckbae-center-defense \
  --workflow deploy-pages.yml --branch main --limit 1
gh run watch --repo loomingsight/huchu-duckbae-center-defense <run-id> --exit-status
curl -I https://loomingsight.github.io/huchu-duckbae-center-defense/
```

Expected: 최신 HEAD의 Pages 실행 `success`, 공개 URL HTTP 200
