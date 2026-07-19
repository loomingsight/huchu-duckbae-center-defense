export const GAME_CONFIG_SPEC = {
  width: 540, height: 960, renderer: 'WEBGL', scaleMode: 'FIT', autoCenter: 'CENTER_BOTH', maxDpr: 2,
} as const;

export const resolveDpr = (value: number) => Math.min(Math.max(value, 1), GAME_CONFIG_SPEC.maxDpr);
