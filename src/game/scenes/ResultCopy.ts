export type RunResult = 'won' | 'lost';

export function resultMessage(outcome: RunResult): string {
  return outcome === 'won'
    ? '후추와 덕배가 끝까지 살아남았어요!'
    : '후추가 쓰러졌어요';
}

export function resultButtonLabel(): '다시 도전하기' {
  return '다시 도전하기';
}
