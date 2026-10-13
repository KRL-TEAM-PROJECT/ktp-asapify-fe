import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, useReducedMotionConfig, useSpring } from 'motion/react';
import { exitFast, m } from '../motion';

interface Props {
  open: boolean;
  id: string;
  /** Box (window coordinates) the tooltip points at; called again whenever the position must be recomputed. */
  anchor: () => DOMRect | null;
  /** Change this value whenever the anchor moves, so the position is recomputed. */
  anchorKey: string | number;
  children: ReactNode;
}

const GAP = 10; // distance to the anchor
const PAD = 8; // minimum distance to the screen edge
const SPRING = { stiffness: 520, damping: 38, mass: 0.75 };

/**
 * Floating tooltip: rendered in <body> (never clipped by a parent's overflow), shown above the anchor or
 * below it when it does not fit, clamped inside the screen, and sliding on a spring when the anchor moves.
 * It ignores the pointer, so it never blocks what it points at.
 */
export function FloatingTip({ open, id, anchor, anchorKey, children }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  const [arrow, setArrow] = useState<{ x: number; below: boolean }>({ x: 0, below: false });
  const x = useSpring(0, SPRING);
  const y = useSpring(0, SPRING);
  const instant = useReducedMotionConfig();
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor; // place stays stable even if the anchor is recreated on every render

  const place = useCallback(() => {
    const node = el.current, a = anchorRef.current();
    if (!node || !a) return;
    const w = node.offsetWidth, h = node.offsetHeight;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const cx = a.left + a.width / 2;
    const left = Math.min(Math.max(cx - w / 2, PAD), Math.max(PAD, vw - w - PAD));
    // never cover the sticky top bar
    const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar')) || 0;
    const minTop = bar + PAD;
    const roomAbove = a.top - minTop, roomBelow = vh - a.bottom - PAD;
    const below = roomAbove < h + GAP && roomBelow > roomAbove;
    const top = Math.min(Math.max(below ? a.bottom + GAP : a.top - h - GAP, minTop), Math.max(minTop, vh - h - PAD));
    if (document.documentElement.classList.contains('no-motion')) {
      // motion features failed to load: spring values are not rendered, so set the position directly
      node.style.left = `${left}px`; node.style.top = `${top}px`; node.style.transform = 'none';
    } else if (!placed.current || instant) {
      // first time: in place immediately (no flight from the corner); afterwards it slides
      x.jump(left); y.jump(top);
    } else { x.set(left); y.set(top); }
    placed.current = true;
    setArrow((p) => (p.x === Math.round(cx - left) && p.below === below ? p : { x: Math.round(cx - left), below }));
  }, [instant, x, y]);

  useLayoutEffect(() => {
    if (!open) { placed.current = false; return; }
    place();
    const node = el.current;
    const ro = node ? new ResizeObserver(place) : null; // the content changes size
    if (node) ro?.observe(node);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => { ro?.disconnect(); window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [open, anchorKey, place]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <m.div
          key="tip" ref={el} id={id} role="tooltip" className={`tip${arrow.below ? ' below' : ''}`}
          style={{ x, y, transformOrigin: `${arrow.x}px ${arrow.below ? '0%' : '100%'}` }}
          initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1, transition: { type: 'spring', ...SPRING } }}
          exit={{ opacity: 0, scale: 0.96, transition: exitFast }}
        >
          {children}
          <i className="tip-arrow" style={{ left: arrow.x }} aria-hidden="true" />
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
