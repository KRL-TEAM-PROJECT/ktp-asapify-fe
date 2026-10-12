import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence } from 'motion/react';
import { exitFast, m, spring } from '../motion';
import { IconCheck } from './icons';

export interface SelectOption { value: string; label: string; disabled?: boolean }
export interface SelectGroup { label: string; options: SelectOption[] }
type Item = SelectOption | SelectGroup;
const isGroup = (x: Item): x is SelectGroup => 'options' in x;

interface Props {
  value: string;
  items: Item[];
  onChange(value: string): void;
  label?: string; // accessible name when there is no visible label
  labelledBy?: string; // id of the visible label
  size?: 'md' | 'sm';
  align?: 'start' | 'end'; // the side the option list sticks to
  className?: string;
}

const MAX_H = 300;

/**
 * Custom dropdown (ARIA listbox pattern) replacing the native <select>, so it looks the same in every
 * browser. Keyboard: arrows, Home/End, Enter/Space, Escape, and typing letters to jump to an option.
 */
export function Select({ value, items, onChange, label, labelledBy, size = 'md', align = 'start', className = '' }: Props) {
  const id = useId();
  const btnId = `${id}-btn`;
  const listId = `${id}-list`;
  const flat = useMemo(() => items.flatMap((x) => (isGroup(x) ? x.options : [x])), [items]);
  const indexOf = useMemo(() => new Map(flat.map((o, i) => [o.value, i])), [flat]);
  const selected = flat.find((o) => o.value === value);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [place, setPlace] = useState<{ up: boolean; maxH: number }>({ up: false, maxH: MAX_H });
  const [hl, setHl] = useState<{ top: number; h: number } | null>(null); // sliding highlight of the active option
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });

  /** Index of the next enabled option from `from` in direction `step`; -1 when none is left. */
  const nextEnabled = (from: number, step: 1 | -1) => {
    for (let i = from; i >= 0 && i < flat.length; i += step) if (!flat[i].disabled) return i;
    return -1;
  };

  const show = () => {
    const cur = indexOf.get(value) ?? -1;
    setActive(cur >= 0 && !flat[cur].disabled ? cur : nextEnabled(0, 1));
    setHl(null); // the highlight is reset at the active option without sliding from the previous opening
    setOpen(true);
  };
  const hide = (refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };
  const pick = (i: number) => {
    const o = flat[i];
    if (!o || o.disabled) return;
    hide();
    if (o.value !== value) onChange(o.value);
  };

  // Open upwards when there is not enough room below the button, then move focus to the list. Room is measured
  // against the nearest clipping container (e.g. a scrollable panel), not just the window.
  useLayoutEffect(() => {
    if (!open || !btn.current || !list.current) return;
    const r = btn.current.getBoundingClientRect();
    let top = 0, bottom = window.innerHeight;
    for (let el = root.current?.parentElement; el; el = el.parentElement) {
      if (getComputedStyle(el).overflowY === 'visible') continue;
      const c = el.getBoundingClientRect();
      top = Math.max(top, c.top);
      bottom = Math.min(bottom, c.bottom);
      break;
    }
    const need = Math.min(list.current.scrollHeight, MAX_H);
    const below = bottom - r.bottom - 8;
    const above = r.top - top - 8;
    const up = below < need && above > below;
    setPlace({ up, maxH: Math.max(120, Math.min(MAX_H, up ? above : below)) });
    list.current.focus({ preventScroll: true });
  }, [open]);

  // Scroll inside the list only (scrollIntoView would also scroll the parent panel) and measure the highlight.
  // The list is absolutely positioned, so an option's offsetTop = its position in the scrolled list content.
  useLayoutEffect(() => {
    const ul = list.current;
    const el = open && active >= 0 ? ul?.querySelector<HTMLElement>(`[data-i="${active}"]`) : null;
    if (!ul || !el) return;
    const top = el.offsetTop, bottom = top + el.offsetHeight;
    if (top < ul.scrollTop) ul.scrollTop = top - 4;
    else if (bottom > ul.scrollTop + ul.clientHeight) ul.scrollTop = bottom - ul.clientHeight + 4;
    setHl({ top, h: el.offsetHeight });
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', down);
    return () => document.removeEventListener('pointerdown', down);
  }, [open]);

  const onButtonKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      show();
    }
  };

  const onListKey = (e: KeyboardEvent) => {
    const move = (i: number) => { if (i >= 0) setActive(i); };
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(nextEnabled(active + 1, 1)); break;
      case 'ArrowUp': e.preventDefault(); move(nextEnabled(active - 1, -1)); break;
      case 'Home': e.preventDefault(); move(nextEnabled(0, 1)); break;
      case 'End': e.preventDefault(); move(nextEnabled(flat.length - 1, -1)); break;
      case 'Enter': case ' ': e.preventDefault(); pick(active); break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); hide(); break; // do not also close the parent calendar
      case 'Tab': hide(false); break;
      default: {
        if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
        const now = Date.now();
        const t = typed.current;
        t.text = (now - t.at > 600 ? '' : t.text) + e.key.toLowerCase();
        t.at = now;
        move(flat.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(t.text)));
      }
    }
  };

  const option = (o: SelectOption) => {
    const i = indexOf.get(o.value)!;
    const isSel = o.value === value;
    return (
      <li
        key={o.value} id={`${id}-o${i}`} data-i={i} role="option" aria-selected={isSel} aria-disabled={o.disabled || undefined}
        className={`sel-opt${i === active ? ' active' : ''}${isSel ? ' chosen' : ''}`}
        onPointerMove={() => { if (!o.disabled) setActive(i); }}
        onClick={() => pick(i)}
      >
        <span>{o.label}</span>
        {isSel && <IconCheck size={14} />}
      </li>
    );
  };

  return (
    <div ref={root} className={`sel ${size}${align === 'end' ? ' end' : ''} ${className}`}>
      <button
        ref={btn} id={btnId} type="button" className="sel-btn" aria-haspopup="listbox" aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={labelledBy ? `${labelledBy} ${btnId}` : undefined}
        aria-label={labelledBy ? undefined : `${label ?? ''}: ${selected?.label ?? ''}`}
        onClick={() => (open ? hide() : show())} onKeyDown={onButtonKey}
      >
        <span className="sel-value">{selected?.label ?? ''}</span>
        <m.svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" initial={false} animate={{ rotate: open ? 180 : 0 }} transition={spring}>
          <path d="M3 4.5L6 7.5L9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </m.svg>
      </button>
      <AnimatePresence>
        {open && (
          <m.ul
            key="list" ref={list} id={listId} role="listbox" tabIndex={-1} className={`sel-list${place.up ? ' up' : ''}`}
            style={{ maxHeight: place.maxH, transformOrigin: `${align === 'end' ? '100%' : '0%'} ${place.up ? '100%' : '0%'}` }}
            initial={{ opacity: 0, scale: 0.94, y: place.up ? 6 : -6 }} animate={{ opacity: 1, scale: 1, y: 0, transition: spring }}
            exit={{ opacity: 0, scale: 0.97, y: place.up ? 3 : -3, transition: exitFast }}
            aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : label}
            aria-activedescendant={active >= 0 ? `${id}-o${active}` : undefined} onKeyDown={onListKey}
          >
            {hl && <m.div className="sel-hl" aria-hidden="true" initial={false} animate={{ y: hl.top, height: hl.h }} transition={spring} />}
            {items.map((x) => (isGroup(x) ? (
              <li key={`g-${x.label}`} role="group" aria-label={x.label} className="sel-grp">
                <span className="sel-grp-label" aria-hidden="true">{x.label}</span>
                <ul role="none">{x.options.map(option)}</ul>
              </li>
            ) : option(x)))}
          </m.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
