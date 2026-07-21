# 백로그 구현 계획

> 승인 기준: 사용자가 `docs/backlog.md`의 세 항목을 바로 구현하도록 요청함

## 목표

- 모든 보스가 12시 방향에서 출현한다.
- 꼬리치기 효과를 2.5배로 키우고 0.5배속으로 표시한다.
- 안전신문고 종이 효과를 대상별 굵은 주황색 `신고!` 표시로 교체한다.
- 일반 적 경로, 전투 판정과 피해량, 사용자 소유 비주얼 스냅샷은 변경하지 않는다.

## 구현 순서

1. 보스 12시 출현
   - 테스트: `tests/unit/WaveSystem.test.ts`
   - 구현: `src/game/waves/WaveSystem.ts`
   - 검증: 개장수와 불법번식장 운영자는 `P3`, 일반 적 경로 규칙은 기존 동작 유지

2. 꼬리치기 효과
   - 테스트: `tests/unit/CombatEffectPool.test.ts`
   - 구현: `src/game/combat/CombatEffectPool.ts`
   - 검증: 표시 배율 2.5, 지속시간 500ms, 전투 수치는 그대로 유지

3. 안전신문고 표시
   - 테스트: `tests/unit/CombatShapeAtlas.test.ts`, `tests/unit/CombatEffectPool.test.ts`
   - 구현: `src/game/assets/CombatShapeAtlas.ts`, `src/game/combat/CombatEffectPool.ts`
   - 검증: 종이/도장 대신 공유 아틀라스의 굵은 주황색 `신고!` 글리프를 각 대상 라벨 위에 표시

4. 완료 확인
   - `docs/backlog.md` 상태와 구현 근거 갱신
   - 관련 단위 테스트, 전체 단위 테스트, 타입 검사 및 프로덕션 빌드 실행
   - 로컬 브라우저에서 핵심 연출을 확인하되 기존 스냅샷은 갱신하지 않음

## 범위 기록

- 아이폰 무음 원인은 기기 무음모드로 확인되어 오디오 코드는 변경하지 않는다.
- 커밋과 원격 푸시는 후속 사용자 요청에 따라 중앙 바깥 넉백 변경과 함께 진행한다.
