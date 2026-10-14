import { useId } from 'react';

// The ASAPify identity as inline vectors: the "A" monogram and the wordmark, traced from the master logo
// (brand manual KHG-FIRMS-2026) and redrawn in the official colours. Every fill reads a --brand-* token, so the
// theme picks the colours; the fallbacks below are the official palette. styles.css maps the dark theme to the
// inverted monochrome variant.
//   --brand-ink       Peat Charcoal   #1E293B  wordmark and charcoal strata
//   --brand-leaf      Canopy Emerald  #1B4D3E  legs and emerald strata
//   --brand-flame-hi  Warning Ochre   #D97706  flame ribbon, top stop
//   --brand-flame-lo  Thermal Amber   #EA580C  flame ribbon, bottom stop
//   --brand-dot       Thermal Amber   #EA580C  hotspot dot on the "i"
const LEAF = 'M66.7 339.5L223.1 53.1L247.7 53.8C241.7 70.2 231.5 86 223 101.4C210.1 124.7 197.6 148.3 184.7 171.6C166.5 204.1 149.2 237.2 131 269.8C126.5 277.7 113 306 108.2 310.8C104.2 314.8 97.6 317 92.9 320.2C83.9 326.3 75.3 333.4 66.7 339.5ZM369.4 178.2C358.4 161.6 349.7 142.9 340 125.4C333.8 114.2 321.3 94.3 317.1 83.3C315.8 80.1 313.7 59.2 312.8 54L326.7 53L381 151.9L369.4 178.2ZM134.5 411.9H25.7L37.5 390.6H121.6L145.4 347.5C170 334.1 199.1 329.1 226.4 323.5C262.7 316.1 300.6 306.2 332.4 286.6C358.1 270.8 378.7 249.7 394.4 224.1C399 216.6 402.8 208.1 407.4 201.1L416.7 218.3C409.7 233.6 401.1 248.7 390.4 261.8C343.8 318.7 281.3 335.2 210.9 342.5C197.7 343.9 184.2 343.7 171.1 345.3L134.5 411.9ZM524.2 411.9H415.4L377.4 340.4C388.4 328.7 401.4 318.7 411.8 306C422.9 292.4 431.2 276.5 441.4 262.9L484.7 340.5H458.9L438.2 302.3L428.6 315.5L449.9 354.7H492.6L504.4 376.2H437L413.6 333.5L403 344.1L428.3 390.6H512.5L524.2 411.9Z';
const INK = 'M113 376.2H45.5L57.3 354.8L70.2 354.5C102.2 328.3 132.1 311 172.3 300C226.9 285 287 280.5 333.5 244.7C363.8 221.2 372.9 200 388.6 167L399.2 185.6C371.6 263.4 302.7 292.5 227.7 308.5C190.3 316.5 133.3 327.5 105.2 354.2L124.6 354.7L113 376.2ZM155.6 447.6H6L17.8 426.2H142.9L179.6 358.6C192.9 356.7 206.9 357 220.4 355.5C276.3 349.4 335 335.1 377.2 295.7C390.4 283.4 401.9 269.4 411.4 254.1C415.9 246.9 419.8 238.9 424.4 232.2L433.5 248.5C425.9 267.1 413 284.8 399.5 299.8C357.5 347 298.4 364.8 237.8 373.4C223.3 375.5 208.5 375.9 194 377.5L155.6 447.6ZM394.4 447.6L346.2 358.3L364.8 348L407 426.2H531.9L544 447.6H394.4Z';
const FLAME = 'M133.6 298.5C139.3 281.5 154.7 257.8 164 241C184.6 203.6 205.3 166.3 225.4 128.7C240.4 100.4 259.4 73 266.5 41.3C269.1 29.7 267.4 17.4 267.7 6C275.8 13.1 282.6 23 287.7 32.8C314.7 84.8 297.2 125 271.6 172.4C262.9 188.5 254.4 204.7 245.6 220.8C235.8 238.9 226.7 257.6 216 275.2L186.4 281.8C191.5 268.6 199.7 255.8 206.5 243.2C222.8 213 239.5 183 255.4 152.6C265.8 132.7 281.4 106.9 276 83.9L165.5 287.3L133.6 298.5ZM346 216.1L305.2 140.3L314.7 110.4L361 195.5L346 216.1ZM315.6 241.4L283.5 181.9L297.1 156.7L334.9 227.2L315.6 241.4Z';
const WORD = 'M523 152.7L527.5 143.5C544.1 152.2 550.8 146.8 556.6 130.3L524.7 58.4L523.6 67H502.4V132.3H489.8V67H476.9L477.1 56.6L489.2 56.1C489.8 50.7 489.3 44.1 491.3 38.7C497.1 23 516.1 22.3 528.3 29.4L524.8 38.2C507.4 31.7 501.2 38.4 502.8 55.9L536.9 56.5L563.5 116.5L589.4 56.5L601.3 57.4C593.1 79.2 582.9 100.9 573.2 122.2C568.7 132.1 565.4 144.4 557.7 152.3C548.1 162.2 533.2 159.5 523 152.7ZM125.9 120.6L134.4 102.8C139.5 105.5 144.8 108.6 150.3 110.5C159.2 113.7 182.5 117.6 187.3 106.2C188 104.5 187.5 103.1 187.7 101.4C186.3 99.4 185.7 97.5 183.5 96C168.1 85.5 139.6 92.3 130 70.9C122.7 54.8 132.4 37.3 147.8 30.9C166.2 23.3 191.9 25.6 207.9 37L200 54.8C190 50.7 159.5 39 153.2 54.4C152.3 56.5 153 58.1 152.8 60.2C153.9 61.5 154.3 63 155.8 64.2C170.7 75.6 203.5 67.4 211.6 93.4C213.4 99.2 213 105.4 211.2 111.1C201.1 142.6 145.7 138.2 125.9 120.6ZM120.9 132.3H94.6L85.1 110.8H36.7L27.6 132.3H2L48.6 28.5H73.4L120.9 132.3ZM76.7 91.1L60.8 53.3L45.3 91.1H76.7ZM334.3 132.3H308L298.6 110.8H250.1L241 132.3H215.4L261.9 28.5H286.8L334.3 132.3ZM290.3 91.1L274.3 53.2L258.5 91.1H290.3ZM345 132.3V28.9C364.6 27.7 403.5 25.3 419.9 36C442.6 50.7 439.1 87.6 414.6 98.4C400.2 104.8 384.2 101.4 369.5 103.7V132.3H345ZM370.1 49V82.3C379.6 82.9 393.7 84.8 402.4 79.9C413.6 73.5 412.2 55.7 400.7 50.6C392.1 46.7 379.3 48.4 370.1 49ZM464.1 132.3H451.7V56.5L464.1 56.3V132.3Z';

type P = { size?: number; title?: string };

// useId() output is not guaranteed to be valid inside url(#...), so keep word characters only.
const useSvgId = () => 'bm' + useId().replace(/\W/g, '');

/** The "A" monogram. `size` is its height in px; without `title` it is decorative (aria-hidden). */
export function BrandMark({ size = 36, title }: P) {
  const gid = useSvgId();
  return (
    <svg
      className="brand-mark" width={(size * 551) / 454} height={size} viewBox="0 0 551 454" focusable="false"
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1="267.7" y1="6" x2="133.6" y2="298.5">
          <stop offset="0" style={{ stopColor: 'var(--brand-flame-hi, #D97706)' }} />
          <stop offset="1" style={{ stopColor: 'var(--brand-flame-lo, #EA580C)' }} />
        </linearGradient>
      </defs>
      <path d={LEAF} style={{ fill: 'var(--brand-leaf, #1B4D3E)' }} />
      <path d={INK} style={{ fill: 'var(--brand-ink, #1E293B)' }} />
      <path d={FLAME} fill={`url(#${gid})`} />
    </svg>
  );
}

/** The "ASAPify" wordmark (heavy "ASAP", light "ify", amber hotspot dot). `size` is the height of the box in px. */
export function BrandWordmark({ size = 22, title }: P) {
  return (
    <svg
      className="brand-word" width={(size * 603.3) / 160.8} height={size} viewBox="0 0 603.3 160.8" focusable="false"
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <path d={WORD} style={{ fill: 'var(--brand-ink, #1E293B)' }} />
      <circle cx="457.9" cy="33.8" r="10" style={{ fill: 'var(--brand-dot, #EA580C)' }} />
    </svg>
  );
}

/** Horizontal lockup: the mark `size` px tall plus the wordmark. The name stays available to screen readers. */
export function BrandLockup({ size = 36 }: { size?: number }) {
  return (
    <>
      <BrandMark size={size} />
      <BrandWordmark size={Math.round(size * 0.6)} />
      <span className="sr-only">ASAPify</span>
    </>
  );
}
