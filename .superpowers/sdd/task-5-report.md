# Task 5 구현 보고서

## 결과

- WASD·방향키 대각선을 정규화하고 키보드가 터치 조이스틱보다 우선하는 이동 입력을 추가했다
- 15% dead zone, 최대 반지름 48, 44px knob, source-tagged 단일 pointer, release·gameout, logical resize 계약의 좌하단 조이스틱을 추가했다
- 후추는 `150px/s`로 이동하며 `540×960` 논리 경계에 clamp된다
- `192×256` 스프라이트를 표시 높이 72로 맞추고, 발 y좌표를 depth로 쓰며 fixed-step 애니메이션 시간으로 frame을 직접 결정한다
- `MODE=e2e`, `e2e=1`, `clock=manual` 세 조건이 모두 맞을 때만 수동 시계 브릿지를 설치하고, integer tick으로 `simulationMs`를 계산한다
- Task 5 `empty-run` 시나리오에서는 `advanceWithoutFlush`를 거부하고, `advance`는 다음 Phaser post-render flush를 기다린다
- production bundle은 TestBridge dynamic branch를 제거하며 브릿지·시나리오 문자열과 debug chunk를 포함하지 않는다

## TDD RED / GREEN

### Step 1 input/controller RED

- 명령: `npm run test:unit -- tests/unit/InputVector.test.ts tests/unit/PlayerController.test.ts`
- 결과: exit 1, 2 suites failed
- exact failure: `Cannot find module '../../src/game/player/InputVector'`
- exact failure: `Cannot find module '../../src/game/player/PlayerController'`
- 의미: 아직 없는 입력 벡터와 이동 controller 계약으로 실패함을 확인했다

### input/controller GREEN

- 같은 명령에서 2 files / 3 tests 통과
- pure 모듈에 Phaser와 wall-clock 의존성을 넣지 않았다

### animation resolver RED / GREEN

- RED: `npm run test:unit -- tests/unit/AnimationFrameResolver.test.ts` exit 1
- exact failure: `Cannot find module '../../src/game/world/AnimationFrameResolver'`
- GREEN: 1 file / 2 tests 통과
- 6fps loop, 8fps one-shot, 60Hz 15 tick 누적 정확성을 확인했다

### manual scheduler RED / GREEN

- RED: `npm run test:unit -- tests/unit/ManualStepScheduler.test.ts` exit 1
- exact failure: `Cannot find module '../../src/game/debug/ManualStepScheduler'`
- GREEN: 1 file / 1 test 통과
- 5000ms 단일 호출과 `1+249+950+1800+2000ms` 분할 호출의 tick 결과를 확인했다

### browser bridge RED / GREEN

- sandbox 최초 실행은 `Error: listen EPERM: operation not permitted 127.0.0.1:5174`로 Vite bind가 차단됐다
- 승인된 로컬 Playwright 재실행 RED: `page.waitForFunction: Test timeout of 5000ms exceeded`
- 실패 지점: `tests/e2e/helpers.ts:10`, `window.__HUCHU_TEST__` 미설치
- bridge·GameScene 수동 시계를 구현한 뒤 desktop/mobile 수동 시계와 키보드 계약이 통과했다

### mobile pointer 회귀 RED / GREEN

- 첫 desktop/mobile focused E2E: 8 passed / 1 skipped / 1 failed
- exact failure: mobile touch 이동량 `Expected: >= 145`, `Received: 0`
- 원인: Phaser 4 input manager는 DOM `mousedown`/`touchstart`를 구독하지만 Playwright의 합성 `PointerEvent`를 Phaser pointer로 변환하지 않았다
- 수정: canvas native pointer를 같은 단일-pointer 상태와 logical coordinate 변환에 연결했다
- GREEN: mobile touch 단독 1 passed

### 독립 리뷰 부분 tick·pointer source RED / GREEN

- RED 1: pause에서 `advance(8)`, resume 후 `advance(9)`하면 expected `simulationMs=0`, received `16.666666666666668`
- 원인 1: paused duration이 `ManualStepScheduler` requested remainder에 누적되어 resume duration과 합쳐졌다
- GREEN 1: playing mode에서만 scheduler가 duration을 받고, invalid duration 검증은 pause에서도 유지했다
- RED 2: native owner가 우측을 가리킨 뒤 같은 숫자 Phaser pointer가 좌측으로 move하면 expected `x=345`, received `195.00000067851673`
- 원인 2: native `pointerId`와 Phaser `Pointer.id`를 같은 number 공간으로 비교했다
- GREEN 2: owner를 `{ source: 'native' | 'phaser', id }`로 구분하고 source와 id가 모두 맞을 때만 move·release하도록 바꿘다
- 추가 GREEN: 두 번째 pointer 무시, pointerup/pointercancel 후 정지, 조이스틱과 키보드 동시 입력의 키보드 우선을 브라우저에서 확인했다
- 최종 focused E2E: 19 passed / 3 expected skipped / 0 failed

### 최종 리뷰 lifecycle·bounds RED / GREEN

- RED 명령: `npm run test:unit -- tests/unit/ManualStepScheduler.test.ts tests/unit/InputVector.test.ts tests/unit/PlayerController.test.ts tests/unit/AnimationFrameResolver.test.ts tests/unit/KeyboardInput.test.ts tests/unit/TestBridgeLifecycle.test.ts`
- 최초 결과: 6 files failed, 7 failed / 6 passed
- scheduler max·overflow RED exact failure: `expected function to throw an error, but it didn't`
- epsilon RED assertion: expected `0`, received `1`
- joystick·controller·animation validation RED exact failure: `expected function to throw an error, but it didn't`
- Phaser module을 직접 import한 lifecycle·keyboard 테스트는 Node 환경에서 `ReferenceError: window is not defined`로 실패해, Phaser와 분리한 순수 lifecycle port 계약으로 테스트 경계를 바로잡았다
- 순수 경계 RED exact failure: `Cannot find module '../../src/game/player/KeyboardInputLifecycle'`
- 순수 경계 RED exact failure: `Cannot find module '../../src/game/scenes/SceneRuntimeLifecycle'`
- GREEN: TestBridge disposer가 설치한 bridge identity가 일치할 때만 전역을 삭제하고, Scene generation이 shutdown 전·후 dynamic import를 모두 무효화한다
- GREEN: scheduler는 `120000ms = 7200 ticks`를 허용하고 호출당 10000 tick 초과 및 unsafe target을 상태 변경 전에 `RangeError`로 거부한다
- GREEN: 키보드는 방향키·WASD 8개만 소유하고 `removeKey(code, true, true)`로 key와 capture를 대칭 해제한다
- GREEN: epsilon을 tick 변환 전에 ms 단위로 적용하고, joystick·controller·animation public API의 non-finite·range 경계를 `RangeError`로 고정했다
- 최종 focused unit: 6 files / 16 tests 통과

## 변경 파일

- `src/game/player/*`
- `src/game/player/KeyboardInputLifecycle.ts`
- `src/game/world/MapView.ts`
- `src/game/world/DebugPathOverlay.ts`
- `src/game/world/AnimationFrameResolver.ts`
- `src/game/debug/*`
- `src/game/scenes/GameScene.ts`
- `src/game/scenes/SceneRuntimeLifecycle.ts`
- `tests/unit/InputVector.test.ts`
- `tests/unit/PlayerController.test.ts`
- `tests/unit/AnimationFrameResolver.test.ts`
- `tests/unit/ManualStepScheduler.test.ts`
- `tests/unit/KeyboardInput.test.ts`
- `tests/unit/TestBridgeLifecycle.test.ts`
- `tests/e2e/helpers.ts`
- `tests/e2e/title-and-input.spec.ts`
- `.superpowers/sdd/task-5-report.md`

## 검증

- focused unit: 6 files / 16 tests 통과
- focused E2E: desktop/mobile 19 passed / 3 expected skipped / 0 failed
- 전체 unit: 17 files / 95 tests 통과
- `npm run build`: typecheck·production build exit 0
- `git diff --check`: exit 0
- production dist: `index.html`, CSS, 단일 `index-*.js`만 생성; debug chunk 없음
- dist static scan: `__HUCHU_TEST__|empty-run|advanceWithoutFlush|ScenarioFactory|TestBridge` match 0
- source static scan: pure 모듈의 `phaser|Date.|performance.|requestAnimationFrame|setTimeout` match 0

## 우려 및 후속

- 기능상 미해결 우려는 없다
- production JS chunk가 500kB를 넘는 기존 Vite 경고는 계속 출력되지만 build는 성공했다
