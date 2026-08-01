const numberFmt = new Intl.NumberFormat('en-US');
const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const currencyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const currencyCompactFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const formatNumber = (value: number, decimals = 0): string =>
  decimals > 0
    ? value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : numberFmt.format(Math.round(value));

export const formatCompact = (value: number): string => compactFmt.format(value);

export const formatCurrency = (value: number): string => currencyFmt.format(value);

export const formatCurrencyCompact = (value: number): string => currencyCompactFmt.format(value);

export const formatPercent = (value: number, decimals = 1): string => `${formatNumber(value, decimals)}%`;

export const formatSigned = (value: number, decimals = 1): string =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatNumber(Math.abs(value), decimals)}`;

export const formatSignedPercent = (value: number, decimals = 1): string =>
  `${formatSigned(value, decimals)}%`;

/** Hours → "4 mo 12 d" / "18 d 4 h" / "6 h 20 m" depending on magnitude. */
export const formatDuration = (hours: number): string => {
  if (!Number.isFinite(hours) || hours < 0) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} m`;
  if (hours < 48) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h} h ${m} m` : `${h} h`;
  }
  const days = Math.floor(hours / 24);
  if (days < 60) {
    const h = Math.round(hours - days * 24);
    return h > 0 ? `${days} d ${h} h` : `${days} d`;
  }
  const months = Math.floor(days / 30);
  const rem = days - months * 30;
  return rem > 0 ? `${months} mo ${rem} d` : `${months} mo`;
};

/** Compact hours label for dense table cells. */
export const formatHours = (hours: number): string =>
  hours >= 1000 ? `${formatNumber(hours / 1000, 1)}k h` : `${formatNumber(hours)} h`;

export const formatMinutes = (minutes: number): string =>
  minutes >= 60 ? formatDuration(minutes / 60) : `${formatNumber(minutes)} m`;

const dateFmt = new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
const timeSecFmt = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export const formatDate = (iso: string | number | Date): string => dateFmt.format(new Date(iso));
export const formatDateTime = (iso: string | number | Date): string => dateTimeFmt.format(new Date(iso));
export const formatTime = (iso: string | number | Date): string => timeFmt.format(new Date(iso));
export const formatClock = (iso: string | number | Date): string => timeSecFmt.format(new Date(iso));

/** "just now" / "14 m ago" / "3 h ago" / "6 d ago" */
export const formatRelative = (iso: string | number | Date, now = Date.now()): string => {
  const delta = now - new Date(iso).getTime();
  const abs = Math.abs(delta);
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;
  const suffix = delta >= 0 ? 'ago' : 'from now';
  if (abs < 45_000) return 'just now';
  if (abs < hour) return `${Math.round(abs / minute)} m ${suffix}`;
  if (abs < day) return `${Math.round(abs / hour)} h ${suffix}`;
  if (abs < day * 30) return `${Math.round(abs / day)} d ${suffix}`;
  return formatDate(iso);
};

export const formatUnit = (value: number, unit: string, decimals = 1): string => {
  switch (unit) {
    case '%':
      return formatPercent(value, decimals);
    case 'USD':
      return formatCurrencyCompact(value);
    case 'h':
      return formatHours(value);
    case 'min':
      return formatMinutes(value);
    case '':
      return formatNumber(value, decimals);
    default:
      return `${formatNumber(value, decimals)} ${unit}`;
  }
};

export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export const titleCase = (input: string): string =>
  input
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const round = (value: number, decimals = 1): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};
