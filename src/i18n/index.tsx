import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import en from './en.json';

type Vars = Record<string, string | number>;

const DICT: Record<string, string> = en;

interface I18n {
  t(key: string, vars?: Vars): string;
}

const Ctx = createContext<I18n | null>(null);

/** UI copy lives in en.json so every screen uses the same wording. The product is English only. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const t = useCallback((key: string, vars?: Vars) => {
    const s = DICT[key] ?? key;
    return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
  }, []);

  const value = useMemo(() => ({ t }), [t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n used outside I18nProvider');
  return v;
}
