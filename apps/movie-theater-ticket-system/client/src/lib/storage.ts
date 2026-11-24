// Browser storage can be unavailable (private windows, blocked site data). Every access is
// wrapped so the app keeps working, just without remembering things between visits.

type Area = 'local' | 'session';

function area(kind: Area): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readJson<T>(key: string, kind: Area = 'local'): T | null {
  try {
    const raw = area(kind)?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown, kind: Area = 'local'): void {
  try {
    area(kind)?.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota or privacy errors.
  }
}

export function removeKey(key: string, kind: Area = 'local'): void {
  try {
    area(kind)?.removeItem(key);
  } catch {
    // Ignore.
  }
}

export const StorageKeys = {
  cart: 'mtts.cart',
  lastOrder: 'mtts.lastOrder',
} as const;
