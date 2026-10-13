import { ApiError } from '../types';

/**
 * Error text for the UI: from `code` when known, otherwise the server `message`.
 * Network errors (failed fetch) use a generic text so the browser's built-in message never shows.
 */
export function errorText(e: unknown, t: (key: string) => string): string {
  if (e instanceof ApiError) {
    const key = `err.${e.code}`;
    const s = t(key);
    return s === key ? e.message : s;
  }
  return t('err.network');
}
