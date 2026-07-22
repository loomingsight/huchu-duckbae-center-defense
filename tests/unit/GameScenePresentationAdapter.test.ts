import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('protected adapter getter는 preallocated damage pool의 같은 identity만 반환한다', () => {
  const source = gameSceneSource();
  expect(source).toContain('protected damageFeedbackPoolForAdapters(): DamageFeedbackPool');
  const getter = source.slice(
    source.indexOf('protected damageFeedbackPoolForAdapters'),
    source.indexOf('protected renderHud'),
  );
  expect(getter).toContain('return this.damageFeedbackPool;');
  expect(getter).not.toContain('new DamageFeedbackPool');
});

it('Scene adapter는 enemy/player damage를 ImpactFeedbackSystem에 전달하고 lethal actor lookup을 먼저 제거한다', () => {
  const source = gameSceneSource();
  const apply = source.slice(
    source.indexOf('protected applySessionEvents'),
    source.indexOf('private showResult'),
  );
  expect(apply).toContain("event.type === 'damageApplied'");
  expect(apply).toContain('this.impactFeedback.handle(event)');
  expect(apply).toContain("event.type === 'playerDamaged'");
});

it('Scene adapter는 active pooled label의 damageAnchor resolver를 impact feedback에 연결한다', () => {
  const source = gameSceneSource();
  const constructor = source.slice(
    source.indexOf('this.impactFeedback = new ImpactFeedbackSystem'),
    source.indexOf('this.presentationTelemetry = new PresentationTelemetry'),
  );
  expect(constructor).toContain(
    'enemyDamageAnchor: (targetId) => this.enemyActors?.damageAnchor(targetId)',
  );
});

it('Scene adapter는 exact event ownership을 공용 CombatEffectPool에 연결한다', () => {
  const source = gameSceneSource();
  for (const call of [
    'startAquaBeam',
    'retargetAquaBeam',
    'showAquaImpact',
    'startSafetyReport',
    'showSafetyImpact',
    'showDoorPush',
    'showBreederWarning',
    'showElectricWave',
    'showSnackFly',
  ]) {
    expect(source).toContain(call);
  }
  expect(source).not.toContain('showTailImpact');
  expect(source).toContain("event.type === 'projectileRequested'");
});

it('보스 actor를 획득한 spawn frame에 reduced-motion 규칙을 거쳐 camera shake를 한 번 요청한다', () => {
  const source = gameSceneSource();
  const spawn = source.slice(
    source.indexOf("event.type === 'enemySpawned'"),
    source.indexOf("event.type === 'companionAttackStarted'"),
  );

  expect(spawn).toContain('bossSpawnFeedback(event.request.kind, this.reducedMotion)');
  expect(spawn).toContain('this.cameras.main.shake(feedback.durationMs, feedback.intensity)');
  expect(spawn.indexOf('this.enemyActors?.acquire(snapshot)')).toBeLessThan(
    spawn.indexOf('this.cameras.main.shake'),
  );
});

it('웨이브 종료 UI는 presentation gate를 거치고 non-world step에서 종료 연출만 진행한다', () => {
  const source = gameSceneSource();
  const nonWorld = source.slice(
    source.indexOf('if (!canStepWorld)'),
    source.indexOf('this.moving = intent.magnitude > 0'),
  );
  const apply = source.slice(
    source.indexOf('protected applySessionEvents'),
    source.indexOf('private showResult'),
  );

  expect(nonWorld).toContain('this.advanceWaveEndPresentation(stepMs)');
  expect(apply).toContain("this.waveEndPresentationGate.defer({ kind: 'countdown' })");
  expect(apply).toContain("this.waveEndPresentationGate.defer({ kind: 'result', outcome: 'won' })");
  expect(apply).toContain('this.flushWaveEndPresentation()');
  expect(apply).not.toContain("if (event.type === 'resultReady') this.showResult(event.outcome)");
});

it('짖기와 아쿠아빔은 후추 입 좌표를 시각 효과 시작점으로 사용한다', () => {
  const source = gameSceneSource();
  const apply = source.slice(
    source.indexOf('protected applySessionEvents'),
    source.indexOf('private showResult'),
  );

  expect(apply.match(/this\.playerView\.attackOrigin/g)).toHaveLength(2);
  expect(apply).toContain('this.playerView.showBarkWave(origin, target)');
  expect(apply).toContain('this.combatEffects.startAquaBeam(event.castId, origin, target)');
});

it('resetSession은 telemetry가 shared effect/damage producer를 한 번만 reset하고 dedupe를 별도로 비운다', () => {
  const source = gameSceneSource();
  const reset = source.slice(source.indexOf('resetSession(seed'), source.indexOf('restartRunFromResult'));
  expect(reset).toContain('this.presentationTelemetry.reset()');
  expect(reset).toContain('this.impactFeedback.resetDedupe()');
  expect(reset).not.toContain('this.playerView.resetCombatVisuals()');
  expect(reset).toContain('this.playerView.resetImpactVisuals()');
  expect(reset).not.toContain('this.projectileActors?.releaseAll()');
  expect(reset).not.toContain('this.combatEffects.releaseAll()');
  expect(reset).not.toContain('this.impactFeedback.reset()');
});

it('zero-effective lethal event는 snack fly를 시작하지 않는다', () => {
  const source = gameSceneSource();
  const damage = source.slice(
    source.indexOf("event.type === 'damageApplied'"),
    source.indexOf("event.type === 'attackStarted'"),
  );
  expect(damage).toContain('event.lethal && event.effectiveAmount > 0');
});

it('Task5 audio adapter는 모든 GameEvent를 한 번 전달하고 dog-trader session dependency를 보존한다', () => {
  const source = gameSceneSource();
  const apply = source.slice(
    source.indexOf('protected applySessionEvents'),
    source.indexOf('private showResult'),
  );
  expect(apply.match(/this\.audio\.handle\(event\)/g)).toHaveLength(1);
  expect(source).toContain('projectileOriginByKind: { dogTrader: dogTraderAttackOrigin }');
});

it('GameScene은 exact MutePort와 lifecycle audio adapter를 쓰고 result restart를 첫 bar에서 시작한다', () => {
  const source = gameSceneSource();
  expect(source).toContain('muted: () => this.audio.muted()');
  expect(source).toContain('toggle: () => this.audio.setMuted(!this.audio.muted())');
  expect(source).toContain('subscribe: (listener) => this.audio.subscribeMute(listener)');
  expect(source).toContain('setAudioLifecyclePaused: (paused) =>');
  const restart = source.slice(
    source.indexOf('restartRunFromResult'),
    source.indexOf('resetPlayer('),
  );
  expect(restart).toContain('this.audio.beginRun()');
});

it('Boot는 context를 만들지 않는 AudioSystem factory를 registry에 한 번만 설치한다', () => {
  const source = readFileSync(new URL('../../src/game/scenes/BootScene.ts', import.meta.url), 'utf8');
  expect(source).toContain('() => new AudioContext(),');
  expect(source.match(/registry\.set\(GAME_AUDIO_REGISTRY_KEY/g)).toHaveLength(1);
  expect(source).toContain("import.meta.env.MODE === 'e2e' ? new E2eAudioTestPort() : undefined");
});

function gameSceneSource(): string {
  return readFileSync(new URL('../../src/game/scenes/GameScene.ts', import.meta.url), 'utf8');
}
