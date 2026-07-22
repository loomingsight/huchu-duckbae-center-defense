# 꼬리치기 꼬리 전용 에셋·5배 넉백 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 후추 몸 크기는 유지하면서 꼬리만 2배로 보이는 4프레임 휘두르기 모션을 추가하고, 꼬리치기 실제 넉백을 35px에서 175px로 강화한다.

**Architecture:** 기존 `huchu-tail-swipe`는 꼬리를 제거한 몸 동작 레이어로 유지하고 새 `huchu-tail-overlay` 4프레임 시트를 별도 스프라이트로 겹친다. 꼬리 오버레이의 마지막 프레임 시작 시각을 기존 스킬 impact 250ms와 맞추고 800ms 유지한다. 전투 모델은 `tailEffectFor()`의 거리만 175px로 올리며 `EnemySystem`의 실제 월드 위치 이동과 월드 경계 제한을 그대로 사용한다.

**Tech Stack:** TypeScript 7, Phaser 4, Vitest 4, Sharp, OpenAI built-in image generation, Vite 8

## 전역 제약

- E2E와 시각 스냅샷 갱신은 실행하지 않는다.
- 보호 중인 desktop/mobile `asset-review.png` 두 파일을 수정·스테이징·커밋하지 않는다.
- 꼬리치기 피해량, 범위, 둔화, 쿨타임과 대상 규칙은 변경하지 않는다.
- 동심원·원형 파동·반복 원 테두리 효과를 추가하지 않는다.
- 꼬리 전용 에셋에는 꼬리 외의 몸·머리·다리·다른 캐릭터를 넣지 않는다.

---

### Task 1: 꼬리 오버레이 런타임 계약

**Files:**
- Modify: `tests/unit/AnimationManifest.test.ts`
- Modify: `tests/unit/RequiredAssetStatus.test.ts`
- Modify: `tests/unit/PlayerViewImpactAction.test.ts`
- Modify: `src/game/assets/AssetKeys.ts`
- Modify: `src/game/assets/AnimationManifest.ts`
- Modify: `src/game/assets/character-animations.json`
- Modify: `src/game/player/PlayerView.ts`

**Interfaces:**
- Produces: `AssetKeys.huchuTailOverlay`, 4프레임 `huchu-tail-overlay`, `TAIL_SWIPE_VISUAL_SCALE = 2`
- Produces: 꼬리 마지막 프레임 시작 `250ms`와 종료 `1050ms`

- [x] **Step 1: 실패 테스트 작성**

```ts
expect(animationEntry('huchu-tail-overlay')).toMatchObject({
  action: 'tailOverlay', frameCount: 4, fps: 12, loop: false,
});
expect(TAIL_SWIPE_VISUAL_SCALE).toBe(2);
expect(TAIL_SWIPE_BODY_DURATION_MS).toBe(1050);
expect(tailSprite.last('setFrame')).toEqual([3]);
expect(tailSprite.last('setVisible')).toEqual([true]);
```

- [x] **Step 2: RED 확인**

Run: `npm run test:unit -- --run tests/unit/AnimationManifest.test.ts tests/unit/RequiredAssetStatus.test.ts tests/unit/PlayerViewImpactAction.test.ts`

Expected: `huchu-tail-overlay` key/entry와 두 번째 꼬리 스프라이트가 없어 실패

- [x] **Step 3: 최소 런타임 구현**

```ts
const TAIL_OVERLAY_ENTRY = animationEntry(AssetKeys.huchuTailOverlay);
export const TAIL_SWIPE_VISUAL_SCALE = 2;
export const TAIL_SWIPE_BODY_DURATION_MS =
  (TAIL_OVERLAY_ENTRY.frameCount - 1) * 1000 / TAIL_OVERLAY_ENTRY.fps
  + TAIL_SWIPE_LAST_FRAME_HOLD_MS;
```

`PlayerView`는 몸 스프라이트와 꼬리 스프라이트를 따로 만들고 꼬리치기 중에만 꼬리를 표시한다. 꼬리는 후추 엉덩이 기준점에 붙이고 몸 스케일의 정확히 2배로 표시하며 좌우 반전·피격 recoil을 함께 따른다.

- [x] **Step 4: GREEN 확인**

Run: `npm run test:unit -- --run tests/unit/AnimationManifest.test.ts tests/unit/RequiredAssetStatus.test.ts tests/unit/PlayerViewImpactAction.test.ts`

Expected: 대상 테스트 전체 PASS

### Task 2: 꼬리 전용 시트와 꼬리 없는 몸 시트 생성

**Files:**
- Create: `scripts/assets/prepare-tail-swipe-assets.mjs`
- Create: `tests/assets/tail-swipe-assets.test.ts`
- Create: `assets/source/generated/v2/huchu-tail-overlay.png`
- Modify: `assets/source/generated/v2/huchu-tail-swipe.png`
- Create: `public/assets/characters/huchu/tail-overlay.png`
- Modify: `public/assets/characters/huchu/tail-swipe.png`
- Modify: `scripts/assets/verify-assets.mjs`

**Interfaces:**
- Consumes: built-in image generation의 4칸 크로마키 꼬리 원본
- Produces: 1024×256 RGBA 4프레임 꼬리 오버레이와 1536×256 RGBA 꼬리 없는 몸 시트

- [x] **Step 1: 구조 실패 테스트 작성**

```ts
await expect(verifyTailOverlaySheet({
  file: 'assets/source/generated/v2/huchu-tail-overlay.png',
  frameCount: 4,
})).resolves.toBeUndefined();
```

각 프레임은 비어 있지 않고 가장자리에 닿지 않으며, 꼬리 외 실루엣이 없고 동일한 오른쪽 뿌리 기준점을 사용해야 한다.

- [x] **Step 2: RED 확인**

Run: `npm run test:unit -- --run tests/assets/tail-swipe-assets.test.ts`

Expected: 꼬리 오버레이 원본과 검증 함수가 없어 실패

- [x] **Step 3: imagegen과 정규화 구현**

기존 `huchu-tail-swipe.png`를 참조해 크림색 털·짙은 외곽선을 유지한 꼬리만 4개 생성한다. 프레임은 준비 → 가속 → 타격 → 마무리 순서이며 완전한 단색 `#00ff00` 배경을 사용한다. 내장 imagegen으로 생성한 뒤 공식 크로마키 제거 도구로 알파 PNG를 만들고, 준비 스크립트가 각 프레임을 256×256에 오른쪽 뿌리 기준으로 정렬한다. 같은 스크립트가 기존 후추 공격 시트의 고정 꼬리 영역을 알파 제거해 몸 레이어를 만든다.

- [x] **Step 4: 에셋 빌드와 GREEN 확인**

Run: `npm run assets:build`

Run: `npm run test:unit -- --run tests/assets/tail-swipe-assets.test.ts tests/assets/asset-validation.test.ts`

Expected: 꼬리 구조·런타임 freshness 테스트 PASS

### Task 3: 실제 넉백 175px 강화

**Files:**
- Modify: `tests/unit/SkillSystem.test.ts`
- Modify: `tests/unit/EnemySystem.test.ts`
- Modify: `src/game/skills/SkillSystem.ts`

**Interfaces:**
- Produces: 일반 적·보스 공통 `knockbackPx: 175`
- Preserves: 후추 중심 바깥 방향과 `EnemySystem` 월드 경계 clamp

- [x] **Step 1: 실패 테스트 작성**

```ts
expect(tailEffectFor(false)).toEqual({ knockbackPx: 175, multiplier: 0.6, durationMs: 1500 });
expect(tailEffectFor(true)).toEqual({ knockbackPx: 175, multiplier: 0.8, durationMs: 1000 });
```

열린 공간에서는 실제 위치가 방향 벡터를 따라 정확히 175px 이동하고, 월드 가장자리에서는 `0..WORLD_WIDTH`, `0..WORLD_HEIGHT`로 제한되는 회귀 테스트를 추가한다.

- [x] **Step 2: RED 확인**

Run: `npm run test:unit -- --run tests/unit/SkillSystem.test.ts tests/unit/EnemySystem.test.ts`

Expected: 기존 35px 값 때문에 실패

- [x] **Step 3: 최소 구현**

```ts
export const TAIL_SWIPE_KNOCKBACK_PX = 175;

export function tailEffectFor(isBoss: boolean): TailEffect {
  return isBoss
    ? { knockbackPx: TAIL_SWIPE_KNOCKBACK_PX, multiplier: 0.8, durationMs: 1000 }
    : { knockbackPx: TAIL_SWIPE_KNOCKBACK_PX, multiplier: 0.6, durationMs: 1500 };
}
```

- [x] **Step 4: GREEN 확인**

Run: `npm run test:unit -- --run tests/unit/SkillSystem.test.ts tests/unit/EnemySystem.test.ts`

Expected: 대상 테스트 전체 PASS

### Task 4: 백로그 완료·전체 검증·배포

**Files:**
- Modify: `docs/backlog.md`

- [x] **Step 1: HD-BL-015 완료 근거 기록**

`HD-BL-015`를 완료로 이동하고 꼬리 오버레이, 4프레임/800ms, 175px 월드 넉백과 경계 제한의 구현·검증 근거를 기록한다.

- [x] **Step 2: 전체 검증**

Run: `npm run test:unit`

Run: `npm run typecheck`

Run: `npm run build`

Run: `npm run assets:verify:candidate`

Run: `npm run assets:review`

Run: `git diff --check`

Expected: 모두 exit 0. E2E와 스냅샷 갱신은 실행하지 않는다.

- [x] **Step 3: 의미 단위 커밋**

```bash
git add <꼬리 에셋·렌더링 파일>
git commit -m "feat: 꼬리치기 전용 꼬리 모션 추가"
git add <넉백·백로그 파일>
git commit -m "feat: 꼬리치기 넉백 거리 강화"
```

- [x] **Step 4: Pages 배포와 공개 번들 검증**

원격 `main`이 현재 작업 브랜치의 조상인지 확인한 뒤 `git push origin HEAD:main`으로 fast-forward 배포한다. GitHub Pages workflow 성공, 공개 HTML의 신규 번들 해시와 꼬리 오버레이 파일 HTTP 200을 확인한다.
