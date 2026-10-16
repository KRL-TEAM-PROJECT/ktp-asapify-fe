import type { Transition, Variants } from 'motion/react';

// Springs are critically damped (no overshoot): things settle, they do not bounce.
/** Default spring: brisk enough for small controls (dropdowns, knobs, sliding indicators). */
export const spring: Transition = { type: 'spring', stiffness: 520, damping: 42, mass: 0.75 };
/** Softer spring for panels and cards entering. */
export const springSoft: Transition = { type: 'spring', stiffness: 300, damping: 34, mass: 0.9 };
/** Bottom sheet spring: no excessive bounce when released from a drag. */
export const springSheet: Transition = { type: 'spring', stiffness: 420, damping: 40, mass: 0.9 };
export const exitFast: Transition = { duration: 0.12, ease: 'easeIn' };

/** Rise in slightly; `custom` = the order used for the stagger delay. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: (i: number = 0) => ({ opacity: 1, y: 0, transition: { ...springSoft, delay: Math.min(i, 8) * 0.055 } }),
};

/** Ready-to-spread props for elements that appear when they enter the screen (once). */
export const reveal = (i = 0) => ({
  variants: rise,
  custom: i,
  initial: 'hidden' as const,
  whileInView: 'show' as const,
  viewport: { once: true, margin: '0px 0px -40px 0px' },
});
