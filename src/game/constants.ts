export const WORLD_WIDTH = 540;
export const WORLD_HEIGHT = 960;
export const SIMULATION_HZ = 60;
export const FIXED_STEP_MS = 1000 / SIMULATION_HZ;
export const TIME_EPSILON_MS = 1e-7;
export const simulationMsFromTicks = (ticks: number) => ticks * 1000 / SIMULATION_HZ;
export const reachedDuration = (elapsedMs: number, targetMs: number) => elapsedMs + TIME_EPSILON_MS >= targetMs;
export const subtractDuration = (remainingMs: number, stepMs: number) => {
  const next = remainingMs - stepMs;
  return next <= TIME_EPSILON_MS ? 0 : next;
};
