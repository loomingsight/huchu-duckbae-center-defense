import './styles.css';
import { createGame } from './game/createGame';

void bootstrap();

async function bootstrap(): Promise<void> {
  let supported = probeWebgl();
  if (import.meta.env.MODE === 'e2e') {
    const { overrideWebglProbe } = await import('./game/debug/E2eBootOverrides');
    supported = overrideWebglProbe(supported);
  }
  if (!supported) {
    renderUnsupportedMessage();
    return;
  }
  createGame();
}

function probeWebgl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null || canvas.getContext('webgl') !== null;
  } catch {
    return false;
  }
}

function renderUnsupportedMessage(): void {
  const root = document.querySelector('#game-root');
  if (root === null) return;
  root.replaceChildren();
  const message = document.createElement('section');
  message.className = 'unsupported-webgl';
  const title = document.createElement('h1');
  title.textContent = '이 브라우저에서는 WebGL을 사용할 수 없어요';
  const detail = document.createElement('p');
  detail.textContent = 'Chrome, Safari, Firefox 최신 버전을 사용해 주세요';
  message.append(title, detail);
  root.append(message);
}
