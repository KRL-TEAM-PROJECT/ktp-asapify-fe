import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useAnimationControls, useDragControls, type PanInfo } from 'motion/react';
import { m, springSheet } from '../motion';

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  enabled: boolean; // false (wide screen): a plain side panel, no dragging
  label: string;
  peek?: ReactNode; // shown in the handle, so a closed sheet still says what is in it
  onPeekHeight?(px: number): void; // height that stays visible when closed (for overlays above it)
  children: ReactNode;
}

const FLICK = 450; // px/s: faster than this counts as a flick, not a plain release

/**
 * Side panel on wide screens; on narrow screens it becomes a bottom sheet dragged by its handle
 * (the panel content still scrolls). On release, a flick decides by its direction; a slow release by
 * whether it passed halfway. The closed position is measured from the panel and handle heights, so it follows
 * content changes.
 */
export function Sheet({ open, onOpenChange, enabled, label, peek, onPeekHeight, children }: Props) {
  const ref = useRef<HTMLElement>(null);
  const grab = useRef<HTMLButtonElement>(null);
  const [closedY, setClosedY] = useState(0);
  const controls = useAnimationControls();
  const dragControls = useDragControls();
  const dragged = useRef(false);
  const mounted = useRef(false);
  const onPeek = useRef(onPeekHeight);
  onPeek.current = onPeekHeight;

  useLayoutEffect(() => {
    const el = ref.current, handle = grab.current;
    if (!enabled || !el || !handle) { setClosedY(0); return; }
    const measure = () => {
      setClosedY(Math.max(0, el.offsetHeight - handle.offsetHeight));
      onPeek.current?.(handle.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(handle);
    return () => ro.disconnect();
  }, [enabled]);

  const target = enabled && !open ? closedY : 0;
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; controls.set({ y: target }); return; }
    controls.start({ y: target, transition: springSheet });
  }, [controls, target]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const y = (open ? 0 : closedY) + info.offset.y;
    const next = Math.abs(info.velocity.y) > FLICK ? info.velocity.y < 0 : y < closedY / 2;
    controls.start({ y: next ? 0 : closedY, transition: springSheet }); // return to position when the state does not change
    if (next !== open) onOpenChange(next);
  };

  return (
    <m.aside
      ref={ref} className="panel" aria-label={label} layoutScroll
      animate={controls} drag={enabled ? 'y' : false} dragListener={false} dragControls={dragControls}
      dragConstraints={{ top: 0, bottom: closedY }} dragElastic={{ top: 0.05, bottom: 0.15 }} dragMomentum={false}
      onDragStart={() => { dragged.current = true; }} onDragEnd={onDragEnd}
    >
      <button
        ref={grab} className="grab" aria-expanded={open} aria-label={label}
        onPointerDown={(e) => { dragged.current = false; if (enabled) dragControls.start(e); }}
        onClick={() => { if (!dragged.current) onOpenChange(!open); }}
      >
        <span />
        {peek && <span className="peek">{peek}</span>}
      </button>
      {children}
    </m.aside>
  );
}
