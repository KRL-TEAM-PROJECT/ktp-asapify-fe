// Kept apart from fixtures.ts so the top bar can read the scenario without loading the mock data.
export const SCENARIOS = ['normal', 'empty', 'cloud', 'one_satellite', 'daytime'] as const;
export type Scenario = (typeof SCENARIOS)[number];

const isScenario = (s: string | null): s is Scenario => !!s && (SCENARIOS as readonly string[]).includes(s);

/** ?scenario=… demos screen states; remembered while the tab is open. */
export function currentScenario(): Scenario {
  const q = new URLSearchParams(location.search).get('scenario');
  try {
    if (isScenario(q)) sessionStorage.setItem('asapify.scenario', q);
    const s = sessionStorage.getItem('asapify.scenario');
    if (isScenario(s)) return s;
  } catch { /* sessionStorage blocked */ }
  return isScenario(q) ? q : 'normal';
}
