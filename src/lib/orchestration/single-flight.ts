export interface SingleFlight<K, V> {
  run(key: K, factory: () => Promise<V>): Promise<V>;
  size(): number;
  clear(): void;
}

/** Deduplicates concurrent work and always removes entries after settle. */
export function createSingleFlight<K, V>(keyFor: (key: K) => string = String): SingleFlight<K, V> {
  const pending = new Map<string, Promise<V>>();

  return {
    run(key, factory) {
      const normalized = keyFor(key);
      const existing = pending.get(normalized);
      if (existing) return existing;

      const request = Promise.resolve().then(factory);
      pending.set(normalized, request);
      void request.then(
        () => {
          if (pending.get(normalized) === request) pending.delete(normalized);
        },
        () => {
          if (pending.get(normalized) === request) pending.delete(normalized);
        }
      );
      return request;
    },
    size: () => pending.size,
    clear: () => pending.clear()
  };
}
