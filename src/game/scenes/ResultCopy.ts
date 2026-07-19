export type RunResult = 'won' | 'lost';

export function resultMessage(outcome: RunResult): string {
  return outcome === 'won' ? '보호소를 지켰어요!' : '다시 지켜볼까요?';
}

export function resultButtonLabel(): '다시 시작' {
  return '다시 시작';
}
