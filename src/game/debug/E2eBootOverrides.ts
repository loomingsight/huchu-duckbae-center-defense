import type { GameDataInput } from '../data/validateGameData';

export function overrideWebglProbe(supported: boolean): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('forceWebglUnsupported') === '1' ? false : supported;
}

export function overrideGamePaths(paths: GameDataInput['paths']): GameDataInput['paths'] {
  const params = new URLSearchParams(window.location.search);
  if (params.get('invalidPath') !== 'P1') return paths;
  return {
    ...paths,
    P1: paths.P1?.map((point, index) => (
      index === 0 ? [-1, point[1]] as const : [...point] as const
    )) ?? [],
  };
}
