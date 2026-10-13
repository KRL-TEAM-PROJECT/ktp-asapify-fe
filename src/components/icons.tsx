import type { Status } from '../types';

// 16px line icons using currentColor. Status is never told apart by colour alone.
type P = { size?: number };
const base = (size = 14) => ({
  width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
});

export const IconCheck = ({ size }: P) => <svg {...base(size)}><path d="M3 8.5l3.2 3L13 4.5" /></svg>;
export const IconCloud = ({ size }: P) => (
  <svg {...base(size)}><path d="M4.5 12.5h7a3 3 0 0 0 .4-6 4 4 0 0 0-7.6 1A2.5 2.5 0 0 0 4.5 12.5z" /></svg>
);
export const IconEye = ({ size }: P) => (
  <svg {...base(size)}><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" /></svg>
);
export const IconAlert = ({ size }: P) => (
  <svg {...base(size)}><path d="M8 2l6.5 11.5h-13z" /><path d="M8 6.5v3M8 11.6v.1" /></svg>
);
export const IconSat = ({ size }: P) => (
  <svg {...base(size)}><rect x="6" y="6" width="4" height="4" transform="rotate(45 8 8)" /><path d="M2 2l3 3M11 11l3 3M14 2l-3 3M5 11l-3 3" /></svg>
);
export const IconSpark = ({ size }: P) => (
  <svg {...base(size)}><path d="M8 1.8l1.4 4.8 4.8 1.4-4.8 1.4L8 14.2l-1.4-4.8L1.8 8l4.8-1.4z" /></svg>
);
export const IconHelp = ({ size }: P) => (
  <svg {...base(size)}><circle cx="8" cy="8" r="6.2" /><path d="M6.3 6.2a1.8 1.8 0 1 1 2.5 1.7c-.5.2-.8.6-.8 1.1v.4M8 11.5v.1" /></svg>
);
export const IconSend = ({ size }: P) => <svg {...base(size)}><path d="M14 2L7 9M14 2l-4.5 12L7 9 2 6.5z" /></svg>;
export const IconX = ({ size }: P) => <svg {...base(size)}><path d="M4 4l8 8M12 4l-8 8" /></svg>;
export const IconCalendar = ({ size }: P) => (
  <svg {...base(size)}><rect x="2.2" y="3.2" width="11.6" height="10.6" rx="1.6" /><path d="M2.2 6.6h11.6M5.3 1.8v2.6M10.7 1.8v2.6" /></svg>
);
export const IconClock = ({ size }: P) => <svg {...base(size)}><circle cx="8" cy="8" r="6.2" /><path d="M8 4.5V8l2.3 1.5" /></svg>;
export const IconThermo = ({ size }: P) => (
  <svg {...base(size)}><path d="M6.4 9.6V3.4a1.6 1.6 0 0 1 3.2 0v6.2a3 3 0 1 1-3.2 0z" /><path d="M8 7v4.4" /></svg>
);
export const IconCrosshair = ({ size }: P) => (
  <svg {...base(size)}><circle cx="8" cy="8" r="4.2" /><path d="M8 1.6v3.2M8 11.2v3.2M1.6 8h3.2M11.2 8h3.2" /></svg>
);
export const IconArrowLeft = ({ size }: P) => <svg {...base(size)}><path d="M13 8H3M7 4L3 8l4 4" /></svg>;

export function StatusIcon({ status, size }: { status: Status; size?: number }) {
  switch (status) {
    case 'SAFE': return <IconCheck size={size} />;
    case 'NO_OBSERVATION': return <IconCloud size={size} />;
    case 'WATCH': return <IconEye size={size} />;
    case 'WARNING': return <IconAlert size={size} />;
  }
}
