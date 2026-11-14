/** Where the SDK keeps its small amount of state. AsyncStorage fits this shape as it is. */
export interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Keeps everything in memory. The default when no persistent storage is available. */
export function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => Promise.resolve(values.get(key) ?? null),
    setItem: (key, value) => {
      values.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key) => {
      values.delete(key);
      return Promise.resolve();
    },
  };
}

/**
 * JSON values under one prefix. Storage problems never break the app: a failed read is
 * "nothing stored", a failed write is dropped.
 */
export class Store {
  constructor(
    private readonly storage: Storage,
    private readonly prefix: string,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.storage.getItem(this.prefix + key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    try {
      await this.storage.setItem(this.prefix + key, JSON.stringify(value));
    } catch {
      // Out of space or unavailable: carry on without it.
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.storage.removeItem(this.prefix + key);
    } catch {
      // Nothing to do.
    }
  }
}
