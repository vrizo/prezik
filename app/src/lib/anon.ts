// Anonymous session id: kept in both localStorage and a cookie so it
// survives whichever the browser lets through (private-mode etc. can block
// one or the other).
const KEY = "prezik_anon_id";

export function getOrCreateAnonId(): string {
  const existing = readLocalStorage() ?? readCookie();
  const anonId = existing ?? crypto.randomUUID();
  writeLocalStorage(anonId);
  writeCookie(anonId);
  return anonId;
}

function readLocalStorage(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function writeLocalStorage(value: string): void {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // localStorage unavailable (private mode, disabled storage) — the
    // cookie below still carries the id.
  }
}

function readCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${KEY}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(value: string): void {
  const oneYearSeconds = 60 * 60 * 24 * 365;
  document.cookie = `${KEY}=${encodeURIComponent(value)}; path=/; max-age=${oneYearSeconds}; SameSite=Lax`;
}
