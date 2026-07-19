import type { GameEvent } from '../events/GameEvents';

type EventType = GameEvent['type'];
type EventFor<T extends EventType> = Extract<GameEvent, { type: T }>;
type EventListener = (event: GameEvent) => void;

export class TypedEventBus {
  private readonly listeners = new Map<EventType, Set<EventListener>>();

  on<T extends EventType>(type: T, listener: (event: EventFor<T>) => void): () => void {
    const subscribers = this.listeners.get(type) ?? new Set<EventListener>();
    subscribers.add(listener as EventListener);
    this.listeners.set(type, subscribers);

    return () => {
      if (this.listeners.get(type) !== subscribers) return;
      subscribers.delete(listener as EventListener);
      if (subscribers.size === 0) this.listeners.delete(type);
    };
  }

  emit<T extends EventType>(event: EventFor<T>): void {
    this.listeners.get(event.type)?.forEach((listener) => listener(event));
  }
}
