import type { EventEnvelope, EventType } from '@donna/core-domain';

export type EventHandler = (event: EventEnvelope) => void | Promise<void>;
export type Unsubscribe = () => void;

/** Subscribe to a specific event type, or `'*'` for every event. */
export type EventSubscription = EventType | '*';

/**
 * The event bus consumed by UI projections, observability and side-effect
 * handlers (Technical Plan §4.2). This interface is transport-agnostic; the
 * production transport (Postgres LISTEN/NOTIFY or Supabase Realtime) is added
 * as an adapter later without changing consumers.
 */
export interface EventBus {
  publish(event: EventEnvelope): Promise<void>;
  subscribe(on: EventSubscription, handler: EventHandler): Unsubscribe;
}

/**
 * In-process event bus for local dev and tests. A handler that throws is
 * isolated (reported to `onError` if provided) so one bad subscriber never
 * stops delivery to the others.
 */
export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<EventSubscription, Set<EventHandler>>();

  constructor(private readonly onError?: (error: unknown, event: EventEnvelope) => void) {}

  subscribe(on: EventSubscription, handler: EventHandler): Unsubscribe {
    const set = this.handlers.get(on) ?? new Set<EventHandler>();
    set.add(handler);
    this.handlers.set(on, set);
    return () => {
      set.delete(handler);
    };
  }

  async publish(event: EventEnvelope): Promise<void> {
    const matched = [...(this.handlers.get(event.type) ?? []), ...(this.handlers.get('*') ?? [])];
    for (const handler of matched) {
      try {
        await handler(event);
      } catch (error) {
        if (this.onError) this.onError(error, event);
      }
    }
  }
}
