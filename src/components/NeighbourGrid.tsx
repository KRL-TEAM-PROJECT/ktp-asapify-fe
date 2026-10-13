import type { Neighbour, NeighbourDir } from '../types';
import { useI18n } from '../i18n';
import { fmtNum } from '../lib/format';
import { m, spring } from '../motion';
import { IconCloud } from './icons';

// The nine cells appear in reading order when the grid enters the screen.
const pop = (i: number) => ({
  initial: { opacity: 0, scale: 0.6 }, whileInView: { opacity: 1, scale: 1 }, viewport: { once: true },
  transition: { ...spring, delay: 0.05 + i * 0.045 },
});

const LAYOUT: (NeighbourDir | 'c')[] = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se'];

/** 3 × 3 mini grid around the representative pixel. */
export function NeighbourGrid({ neighbours }: { neighbours: Neighbour[] }) {
  const { t } = useI18n();
  const byDir = new Map(neighbours.map((n) => [n.dir, n]));
  const k = neighbours.filter((n) => n.state === 'anomaly').length;
  const label = (n: Neighbour) => t(`nbr.${n.state}`);

  return (
    <div className="nbfig">
      <div className="nbg" role="group" aria-label={t('nbr.title')}>
        {LAYOUT.map((d, i) => {
          if (d === 'c') return <m.span key="c" className="p" aria-label={t('nbr.center')} {...pop(i)}>P</m.span>;
          const n = byDir.get(d);
          if (!n) return <span key={d} className="x" />;
          return (
            <m.span key={d} className={n.state} aria-label={`${d.toUpperCase()}: ${label(n)}`} title={label(n)} {...pop(i)}>
              {n.state === 'cloud' ? <IconCloud size={13} /> : n.state === 'non_peat' ? '—' : n.u0 != null ? fmtNum(n.u0, 1) : ''}
            </m.span>
          );
        })}
      </div>
      <div className="nb-legend">
        <span><i className="anomaly" />{t('nbr.anomaly')}</span>
        <span><i className="normal" />{t('nbr.normal')}</span>
        <span><i className="cloud" />{t('nbr.cloud')}</span>
        <span><i className="non_peat" />{t('nbr.non_peat')}</span>
      </div>
      <code className="nb-formula">{t('nbr.formula', { k, v: fmtNum(k / 8, 3) })}</code>
    </div>
  );
}
