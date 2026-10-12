// localStorage can throw (private mode, blocked site data); every access goes through here.
export function load(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function save(key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* ignore */ }
}
