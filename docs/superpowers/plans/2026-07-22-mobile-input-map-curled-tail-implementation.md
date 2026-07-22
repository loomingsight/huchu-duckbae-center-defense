# 모바일 입력·전투 템포·맵·말린 꼬리 구현 계획

> 범위: 승인된 HD-BL-016~020. E2E는 사용자 요청에 따라 실행하지 않고 DOM/단위/에셋 검증으로 닫는다.

## 설계 결정

- 조이스틱과 기술 버튼은 각자 `pointerId`와 pointer capture를 소유한다. 기술은 `pointerdown`에서 한 번 처리하고 합성 `click`은 무시하되 키보드 `click(detail=0)`은 유지한다.
- 게임 루트에 `touch-action:none`과 멀티터치/gesture 기본 동작 차단을 적용하고, `visibilitychange`, `blur`, `pagehide` 때 양쪽 입력을 함께 정리한다.
- 짖기 cadence는 시전 성공 시점 기준 500ms로 바꾸며 windup 250ms와 기존 판정은 유지한다.
- 햅틱은 표준 `navigator.vibrate(15)`만 best-effort로 사용한다. 구매 큐 성공 또는 실제 전투 시전 시작 이벤트에서만 한 번 울리고, 미지원·false·예외는 시각 피드백으로 폴백한다.
- 맵은 기존 단일 SVG/WebP 파이프라인을 유지한다. 황토색 길만 제거하고 고정된 저대비 풀 12개를 SVG 안에 배치하며 런타임 경로 데이터는 변경하지 않는다.
- 꼬리는 imagegen으로 만든 말린 꼬리 4프레임을 투명화·정규화한다. 런타임에서 엉덩이 뿌리를 고정한 채 0~250ms 동안 우→상→좌 각도와 위치를 보간하고, 반대 방향은 정확히 대칭한다. 250ms 이후 최종 자세는 기존대로 800ms 유지한다.

## TDD 작업 순서

### 1. HD-BL-016 멀티터치

1. `tests/unit/ActionDock.test.ts`, `tests/unit/HudV2.test.ts`에 조이스틱 포인터 유지, 기술 단일 활성화, 포인터별 cancel/lost capture, lifecycle 정리, 확대 제스처 차단 테스트를 먼저 추가해 RED를 확인한다.
2. `ActionDock`, `VirtualJoystick`, 새 입력 lifecycle guard, `styles.css`, `index.html`을 최소 수정해 GREEN으로 만든다.

### 2. HD-BL-017~018 쿨타임·햅틱

1. `BarkSystem.test.ts`에 499/500ms 경계와 HUD 진행률 테스트를 먼저 추가한다.
2. 브라우저 비의존 햅틱 어댑터 테스트에 지원/미지원/false/예외를 추가한다.
3. `BarkSystem`, `HudSystem`, `ActionDock`, `GameScene`을 수정해 실제 시작·구매 성공에만 햅틱과 버튼 피드백을 연결한다.

### 3. HD-BL-019 정적 맵

1. 새 맵 에셋 테스트로 길 색상 부재, 풀 12개, 정적 SVG/WebP 크기와 기존 경로 데이터 계약을 RED로 고정한다.
2. `assets/source/map/map-v2-simple.svg`만 단순 녹색 바탕과 풀 12개로 변경하고 `npm run assets:build`로 공개 WebP를 갱신한다.

### 4. HD-BL-020 말린 꼬리

1. 에셋 및 `PlayerView` 테스트에 4프레임, 좌우 대칭 sweep transform, 뿌리 고정, 250ms/800ms 계약을 먼저 추가한다.
2. imagegen 결과를 공식 chroma-key 제거 도구로 투명화한 뒤 기존 prepare 스크립트로 1024×256 시트를 만든다.
3. `PlayerView`에 연속 sweep transform을 적용하되 피해·넉백·둔화·쿨타임 로직은 수정하지 않는다.

## 검증과 배포

- `npm run test:unit`
- `npm run typecheck`
- `npm run build`
- `npm run assets:verify:candidate`
- `npm run assets:review`
- `git diff --check`
- 보호 중인 desktop/mobile visual snapshot SHA-256 불변 확인
- 논리적 단위 커밋 후 `HEAD:main` 푸시, GitHub Pages workflow와 공개 번들·에셋 확인
