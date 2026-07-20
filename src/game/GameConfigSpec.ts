import { HUCHU_PRESENTATION } from './presentation/PresentationConfig';

export const GAME_CONFIG_SPEC = {
  width: HUCHU_PRESENTATION.logicalWidth,
  height: HUCHU_PRESENTATION.logicalHeight,
  renderer: 'WEBGL',
  scaleMode: 'FIT',
  autoCenter: 'CENTER_BOTH',
  render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
} as const;
