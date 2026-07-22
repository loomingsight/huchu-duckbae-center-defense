export const HAPTIC_PULSE_MS = 15;

export interface HapticFeedback {
  pulse(): void;
}

interface VibrationNavigator {
  vibrate(durationMs: number): unknown;
}

export function createHapticFeedback(
  navigatorRef: VibrationNavigator | undefined,
): HapticFeedback {
  return {
    pulse: (): void => {
      try {
        navigatorRef?.vibrate(HAPTIC_PULSE_MS);
      } catch {
        // Vibration is optional; visual input feedback remains authoritative.
      }
    },
  };
}

export function createBrowserHapticFeedback(): HapticFeedback {
  return createHapticFeedback(
    typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function'
      ? undefined
      : navigator,
  );
}
