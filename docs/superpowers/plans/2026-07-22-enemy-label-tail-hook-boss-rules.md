# 적 이름·꼬리치기·보스 규칙 구현 계획

**목표:** HD-BL-021~023을 구현해 일반 적 이름표, 꼬리치기 연출/판정, 보스 이동·넉백 규칙을 확정하고 GitHub Pages에 배포한다.

**구조:** 기존 canonical balance와 이름표 atlas를 함께 갱신한다. 꼬리치기는 `PlayerView`의 뿌리 고정 회전 보간과 24fps manifest, `SkillSystem`의 125ms 판정을 같은 계약으로 묶는다. 넉백 면역은 적 종류를 알고 있는 `EnemySystem`에서 위치 이동만 차단해 피해·피격 피드백·둔화·공격 중단 흐름은 유지한다. 불법번식업자의 이동 수치와 걷기 animation rate만 각각 정확히 2배로 조정한다.

**검증 경계:** E2E는 실행하지 않는다. 사용자 소유 시각 스냅샷 2개는 수정·스테이징하지 않는다. 단위 테스트, 타입 검사, production build, 후보 에셋 검증, asset review, `git diff --check`로 닫는다.

---

## Task 1: HD-BL-021 일반 적 표시 이름

**Files:**
- Modify: `tests/unit/Balance.test.ts`
- Modify: `tests/unit/EnemyLabelAtlas.test.ts`
- Modify: `tests/unit/EnemyLabelView.test.ts`
- Modify: `tests/unit/EnemyLabelPool.test.ts`
- Modify: `src/game/data/balance.ts`
- Modify: `src/game/assets/EnemyLabelAtlas.ts`

1. 네 종류 표시 이름과 전투 수치 불변을 새 기대값으로 먼저 고정한다.
2. 이름표 atlas/view/pool 테스트를 `똥 방치러`, `오프리시 빌런`으로 바꾸고 실패를 확인한다.
3. balance와 atlas 이름을 최소 수정해 테스트를 통과시킨다.
4. 과거 이름이 production/user-facing test에 남지 않았는지 검색한다.

## Task 2: HD-BL-022 꼬리치기 갈고리 궤적·2배속

**Files:**
- Modify: `tests/unit/PlayerViewImpactAction.test.ts`
- Modify: `tests/unit/AnimationManifest.test.ts`
- Modify: `tests/unit/SkillSystem.test.ts`
- Modify: `src/game/player/PlayerView.ts`
- Modify: `src/game/assets/character-animations.json`
- Modify: `src/game/skills/skillDefinitions.ts`
- Modify: `src/game/skills/SkillSystem.ts`

1. 0→62.5→105→125ms의 바깥 sweep·overshoot·안쪽 감김 각도, 좌우 대칭과 뿌리 고정을 테스트한다.
2. tail body/overlay 24fps, 125ms 판정, 400ms hold, 525ms total 기대값으로 RED를 확인한다.
3. root offset은 0으로 유지하고 회전을 `180° → 90° → -24° → 18°`로 보간해 갈고리형 마무리를 만든다. 왼쪽은 각도를 정확히 반전한다.
4. manifest와 skill 판정을 2배속 계약으로 맞추고 focused GREEN을 확인한다.

## Task 3: HD-BL-023 보스 넉백 면역·불법번식업자 속도

**Files:**
- Modify: `tests/unit/EnemySystem.test.ts`
- Modify: `tests/unit/Balance.test.ts`
- Modify: `tests/unit/GameDataValidation.test.ts`
- Modify: `tests/unit/PresentationRules.test.ts`
- Modify: `src/game/enemies/EnemySystem.ts`
- Modify: `src/game/enemies/EnemyActor.ts`
- Modify: `src/game/data/balance.ts`

1. 두 보스는 위치/경로 진행도가 유지되면서 둔화와 windup 중단은 적용되고, 일반 적은 175px 이동하는 테스트를 추가한다.
2. 불법번식업자 speed 64.4와 걷기 animation rate 2.8, 개장수 1.4/일반 적 1.0 불변을 테스트한다.
3. `EnemySystem.applyTailEffect`에서 보스의 위치 넉백만 생략한다.
4. balance와 종류별 animation rate를 최소 수정하고 focused GREEN을 확인한다.

## Task 4: 완료 기록·전체 검증·배포

**Files:**
- Modify: `docs/backlog.md`

1. HD-BL-021~023을 완료 섹션으로 이동하고 구현/검증 근거를 기록한다.
2. 전체 단위 테스트, 타입 검사, production build, 후보 에셋 검증과 asset review를 실행한다.
3. 사용자 소유 스냅샷 해시가 그대로인지 확인하고 `git diff --check` 및 self-review를 수행한다.
4. 논리적 커밋을 만든 뒤 `main`으로 push하고 GitHub Pages workflow와 공개 URL을 확인한다.
