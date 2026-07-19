# Task 9 구현 보고서

- 작업일: 2026-07-20
- 브랜치: `codex/huchu-defense-mvp`
- 기준 커밋: `10e65d71d62632105d36f139328052b3e0652dbf`
- 커밋 제목: `feat: add shelter and enemy attacks`
- 저장소 지침: `/Users/jadon/Documents/huchu-defense` 아래에 `AGENTS.md`가 존재하지 않음을 `find`로 확인했다. 대화에 주입된 한글 응답 및 모호한 사항 확인 지침을 적용했다.

## 구현 결과

- 보호소를 `(270, 480, r=38)`의 canonical 원으로 연결하고 HP 100 및 `healthy → damaged → critical → failed` 4단계를 구현했다.
- `ShelterView`는 `shelter-states` frame 0~3, 77px 높이, origin `(0.5, 224/256)`, 120ms 좌우 shake를 유지한다.
- 적 발 위치에서 보호소 원 경계까지의 거리로 공격 범위를 판정한다.
- 종류별 persistent `EnemyAttackSystem` 4개가 `moving → windup → holding`과 250ms release, 시작 시각 기준 interval, cancel, stun/knockback interrupt를 소유한다.
- 최초 moving 진입은 같은 fixed step의 elapsed를 windup에 반영하고, holding cadence에서 다시 열린 windup은 0ms부터 시작한다.
- 큰 step은 cadence 경계를 반복 소비하여 분할 step과 같은 event 및 snapshot을 만든다.
- off-leash만 release 때 즉시 damage command를 만들고, poop/net/electric은 각각 speed 220/240/260, life 1200ms의 pooled projectile command를 만든다.
- `GameSession` 한 곳에서만 attack/projectile의 `shelterDamageRequested`를 모아 `ShelterSystem.damage()`로 소비한다. frame 6, `projectileHit`, Phaser view는 damage를 직접 만들지 않는다.
- projectile model pool과 Phaser actor pool은 각각 80개를 한 번만 선할당한다. hit와 1200ms expiry 모두 snapshot reconciliation으로 actor를 반환한다.
- projectile 이동은 lifetime 안의 유효 segment만 사용한다. 수명 이후 경로의 늦은 충돌은 무시하고 정확한 수명 경계 접촉은 한 번 hit한다.
- poop은 world collision 위치와 분리된 포물선 offset/회전을 사용하고, poop/net/electric hit effect는 simulation fixed-step 기반 4 frame으로 종료한다.
- off-leash release simulation event에만 목줄 arc view를 연결했다.
- reset/death/remove에서 attack track, projectile model, projectile actor, shelter HP/view shake/frame, projectile id sequence를 정리한다.
- `poop-attack`과 `boss` scenario는 기본 W1 spawn을 억제하고 각각 in-range poop guardian 1명, dog trader 1명만 만든다.
- 후추 `PlayerSnapshot`에는 HP 필드가 없으며 projectile/player physics overlap 또는 collider를 등록하지 않았다.
- `EnemySystem.ts`는 Task 7에서 이미 feet snapshot, attack-boundary clamp, `setState` elapsed 보존, stun/knockback API를 제공하므로 Task 9에서 중복 변경하지 않고 `GameSession`의 양쪽-owner 동기화로 재사용했다.

## RED → GREEN 기록

1. Step 1 RED
   - `Cannot find module '../../src/game/shelter/ShelterSystem'`
   - `Cannot find module '../../src/game/combat/EnemyAttackSystem'`
   - 최소 resolver 구현 뒤 2 files / 8 tests GREEN
2. 보호소 RED
   - `TypeError: ShelterSystem is not a constructor`
   - `Cannot find module '../../src/game/shelter/ShelterView'`
   - HP clamp, damage 1회, 4 frame view, reset을 구현해 GREEN
3. 적 공격 RED
   - 8 tests가 `TypeError: EnemyAttackSystem is not a constructor`로 실패
   - windup/cancel/release/holding/stun 및 종류별 command 구현 뒤 GREEN
4. large-step RED
   - 3450ms 한 번은 4 events, 69×50ms는 9 events를 만들어 불일치
   - transition boundary 반복 소비로 같은 9 events와 snapshot을 만들어 GREEN
5. projectile RED
   - `Cannot find module '../../src/game/combat/ProjectileSystem'`
   - hit 1회, expiry, cap drop, model pool을 구현해 GREEN
6. Session 통합 RED
   - `TypeError: run.suppressWaveSpawnsForScenario is not a function`
   - persistent kind별 attack, projectile, shelter single-damage path, scenario wave isolation을 연결해 GREEN
7. actor/view lifecycle RED
   - `Cannot find module '../../src/game/combat/ProjectileActorPool'`
   - `TypeError: view.reset is not a function`
   - actor 80개 선할당, hit/expiry reconciliation, shelter shake/frame reset을 구현해 GREEN
8. 브라우저 RED
   - sandbox: `Error: listen EPERM: operation not permitted 127.0.0.1:5174`
   - 승인된 sandbox 외부 실행에서 `RangeError: Unknown test scenario: poop-attack`, `RangeError: Unknown test scenario: boss`
   - scenario/bridge/session/view 연결 뒤 desktop targeted 2/2 GREEN
9. lifetime RED
   - lifetime 100ms projectile을 1000ms step했을 때 기대 `[]` 대신 `projectileHit`와 `shelterDamageRequested` 발생
   - 이동을 `min(stepMs, remainingLifeMs)`로 clamp해 늦은 hit 0, 정확한 lifetime 경계 hit 1회 GREEN
10. 입력 방어 RED
    - shelter/attack/projectile의 non-finite step, HP, damage, spawn number가 `RangeError`를 내지 않음
    - 상태 변경 전 finite/non-negative 검증을 추가해 GREEN
11. stun/knockback 통합 RED
    - `TypeError: run.stunEnemy is not a function`
    - `TypeError: run.knockBackEnemy is not a function`
    - EnemySystem과 EnemyAttackSystem을 함께 갱신하는 Session API로 freeze/cancel 회귀 GREEN
12. 전체 회귀 RED
    - 288 tests 중 `GameSession` exact snapshot 1개가 신규 `projectiles: []` 때문에 실패
    - 진화한 RunSnapshot expected를 갱신한 뒤 전체 GREEN

## 변경 파일

### 신규

- `src/game/shelter/ShelterTypes.ts`
- `src/game/shelter/ShelterSystem.ts`
- `src/game/shelter/ShelterView.ts`
- `src/game/combat/EnemyAttackSystem.ts`
- `src/game/combat/ProjectileSystem.ts`
- `src/game/combat/ProjectileActorPool.ts`
- `tests/unit/ShelterSystem.test.ts`
- `tests/unit/EnemyAttackSystem.test.ts`
- `tests/unit/ProjectileSystem.test.ts`
- `.superpowers/sdd/task-9-report.md`

### 수정

- `src/game/session/GameSession.ts`
- `src/game/session/RunSnapshot.ts`
- `src/game/events/GameEvents.ts`
- `src/game/scenes/GameScene.ts`
- `src/game/debug/ScenarioFactory.ts`
- `src/game/debug/TestBridge.ts`
- `src/game/debug/TestContract.ts`
- `tests/unit/fixtures.ts`
- `tests/unit/GameSession.test.ts`
- `tests/e2e/combat.spec.ts`

## 최종 검증

| 검증 | 결과 |
| --- | --- |
| `npm run test:unit -- tests/unit/ShelterSystem.test.ts tests/unit/EnemyAttackSystem.test.ts tests/unit/ProjectileSystem.test.ts` | PASS, 3 files / 42 tests |
| `npm run test:unit` | PASS, 28 files / 296 tests |
| `npm run build` | PASS, TypeScript 및 Vite production build |
| `npm run test:e2e -- tests/e2e/combat.spec.ts` | PASS, desktop/mobile 12 tests |
| production `dist`의 `__HUCHU_TEST__`, debug module명, scenario id scan | 0 matches, `rg` exit 1 |
| 순수 `ShelterSystem/EnemyAttackSystem/ProjectileSystem`의 Phaser, wall-clock, random, timer scan | 0 matches, `rg` exit 1 |
| Task 9 production 파일의 `any`, `as unknown`, `as any`, ts-ignore scan | 0 matches, `rg` exit 1 |
| GameScene/projectile/player의 physics overlap/collider scan | 0 matches, `rg` exit 1 |
| player 모듈의 HP 필드 scan | 0 matches, `rg` exit 1 |
| `git diff --check` | PASS |

## 남은 경고

- Vite production build가 Phaser를 포함한 단일 JS chunk 약 1.41MB에 대해 500kB 초과 경고를 출력한다. build exit는 0이며 Task 9 전부터 존재한 번들 분할 항목이다.
- Playwright는 `FORCE_COLOR` 때문에 `NO_COLOR`가 무시된다는 경고를 출력한다. 12 tests는 모두 통과했다.
- 기능상 미해결 경고는 없다.
