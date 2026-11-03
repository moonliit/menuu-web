type Entry = { value?: unknown; expiresAt: number; pending?: Promise<unknown> };
const entries = new Map<string, Entry>();

export function cachedValue<T>(key: string): T | undefined {
  return entries.get(key)?.value as T | undefined;
}

export function invalidateCache(prefix?: string) {
  for (const key of entries.keys())
    if (!prefix || key.startsWith(prefix)) entries.delete(key);
}

export async function cachedRequest<T>(
  key: string,
  load: () => Promise<T>,
  ttlMs: number,
  force = false,
): Promise<T> {
  const entry = entries.get(key);
  if (entry?.pending) return entry.pending as Promise<T>;
  if (!force && entry?.value !== undefined && entry.expiresAt > Date.now())
    return entry.value as T;
  const pending = load();
  entries.set(key, { ...entry, expiresAt: entry?.expiresAt ?? 0, pending });
  try {
    const value = await pending;
    if (entries.get(key)?.pending === pending)
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  } catch (error) {
    if (entries.get(key)?.pending === pending)
      entries.set(key, { value: entry?.value, expiresAt: 0 });
    throw error;
  }
}
