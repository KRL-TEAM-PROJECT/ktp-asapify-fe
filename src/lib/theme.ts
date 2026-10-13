import { useEffect, useState } from 'react';
import { load, save } from './storage';

export type ThemePref = 'auto' | 'light' | 'dark';

function apply(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === 'auto') delete root.dataset.theme;
  else root.dataset.theme = pref;
}

const mq = () => window.matchMedia('(prefers-color-scheme: dark)');

/** Theme preference + whether the effective look is dark (for the basemap style). */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(() => {
    const v = load('asapify.theme');
    return v === 'light' || v === 'dark' ? v : 'auto';
  });
  const [systemDark, setSystemDark] = useState(() => mq().matches);

  useEffect(() => {
    const m = mq();
    const on = () => setSystemDark(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);

  useEffect(() => { apply(pref); save('asapify.theme', pref === 'auto' ? null : pref); }, [pref]);

  const dark = pref === 'dark' || (pref === 'auto' && systemDark);
  const cycle = () => setPref((p) => (p === 'auto' ? 'light' : p === 'light' ? 'dark' : 'auto'));
  return { pref, dark, cycle };
}
