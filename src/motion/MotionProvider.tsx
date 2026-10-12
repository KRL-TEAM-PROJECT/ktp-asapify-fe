import type { ReactNode } from 'react';
import { LazyMotion, MotionConfig } from 'motion/react';

// Elements with `initial={{ opacity: 0 }}` only appear once the motion features load. If that chunk fails
// (network down, or an old tab after a new deploy), mark <html> so CSS shows everything without motion.
const loadFeatures = () =>
  import('./features').then(
    (m) => m.default,
    (err) => {
      document.documentElement.classList.add('no-motion');
      throw err;
    },
  );

/**
 * One wrapper for the whole app. Only `m` components (not `motion`) are used: the core ships in the
 * initial bundle (±17 KB gzip); motion features (animation, gestures, layout, drag; ±20 KB gzip) load later.
 * `reducedMotion="user"` turns off transform and layout motion when the system asks (opacity stays).
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

/** Lite mode (weak phone / data saver) turns off transform motion like reduced-motion. */
export function LiteMotion({ lite, children }: { lite: boolean; children: ReactNode }) {
  return <MotionConfig reducedMotion={lite ? 'always' : 'user'}>{children}</MotionConfig>;
}
