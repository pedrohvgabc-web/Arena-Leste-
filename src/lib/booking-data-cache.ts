export const BOOKING_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CACHE_PREFIX = "arena-leste-booking-cache-v1:";
const MAX_CACHE_ENTRIES = 48;

export type BookingCacheSnapshot<T> = {
  data: T;
  updatedAt: number;
};

type StoredEntry = {
  version: 1;
  updatedAt: number;
  data: unknown;
};

function getStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function cacheKey(key: string) {
  return `${CACHE_PREFIX}${key}`;
}

export function readBookingCache<T>(
  key: string,
  isValid: (value: unknown) => value is T,
  now = Date.now(),
): BookingCacheSnapshot<T> | undefined {
  const storage = getStorage();
  if (!storage) return undefined;

  const fullKey = cacheKey(key);
  try {
    const raw = storage.getItem(fullKey);
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as Partial<StoredEntry>;
    if (
      entry.version !== 1 ||
      typeof entry.updatedAt !== "number" ||
      !Number.isFinite(entry.updatedAt) ||
      entry.updatedAt > now ||
      now - entry.updatedAt > BOOKING_CACHE_MAX_AGE_MS ||
      !isValid(entry.data)
    ) {
      storage.removeItem(fullKey);
      return undefined;
    }
    return { data: entry.data, updatedAt: entry.updatedAt };
  } catch {
    try {
      storage.removeItem(fullKey);
    } catch {
      // Storage may be unavailable in private browsing or under restrictive policies.
    }
    return undefined;
  }
}

export function writeBookingCache<T>(key: string, data: T, now = Date.now()): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(
      cacheKey(key),
      JSON.stringify({ version: 1, updatedAt: now, data } satisfies StoredEntry),
    );
    const entries: Array<{ key: string; updatedAt: number }> = [];
    for (let index = 0; index < storage.length; index += 1) {
      const existingKey = storage.key(index);
      if (!existingKey?.startsWith(CACHE_PREFIX)) continue;
      try {
        const existing = JSON.parse(
          storage.getItem(existingKey) ?? "null",
        ) as Partial<StoredEntry> | null;
        entries.push({
          key: existingKey,
          updatedAt: typeof existing?.updatedAt === "number" ? existing.updatedAt : 0,
        });
      } catch {
        entries.push({ key: existingKey, updatedAt: 0 });
      }
    }
    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    for (const entry of entries.slice(MAX_CACHE_ENTRIES)) storage.removeItem(entry.key);
  } catch {
    // Cache is an optimization; never prevent live reservation data from loading.
  }
}
