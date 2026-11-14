type Bytes = (array: Uint8Array) => Uint8Array;

/**
 * A random v4 UUID. Used for install ids, event ids and idempotency keys. None of them is a
 * secret, so where the runtime has no crypto source (older Hermes) Math.random is enough.
 */
export function uuid(): string {
  const bytes = new Uint8Array(16);
  const source = (globalThis as { crypto?: { getRandomValues?: Bytes } }).crypto;
  if (typeof source?.getRandomValues === 'function') {
    source.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

/** A short, stable, non-reversible name for a string. Keeps one key's stored data apart from another's. */
export function shortHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}
