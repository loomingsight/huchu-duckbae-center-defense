export interface MutePort {
  muted(): boolean;
  toggle(): void;
  subscribe(listener: (muted: boolean) => void): () => void;
}

export const NOOP_MUTE_PORT: MutePort = Object.freeze({
  muted: () => false,
  toggle: () => undefined,
  subscribe: () => () => undefined,
});
