/**
 * Pure wall-clock formatting helpers. A "wall ms" is a plain number encoding a
 * wall-clock reading as if it were UTC (via Date.UTC). It is NOT an instant; it
 * is only a convenient integer we read back with getUTC* accessors. No public
 * contract ever exposes a JavaScript Date (handoff §4).
 */

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

/** Normalize "HH:mm" or "HH:mm:ss" to "HH:mm:ss". */
export function normalizeTimeString(time: string): string {
  return time.length === 5 ? `${time}:00` : time;
}

/** Parse a wall date + time into a wall-ms integer (interpreted as if UTC). */
export function parseWallToMs(dateIso: string, timeIso: string): number {
  const [y, mo, d] = dateIso.split('-').map((s) => Number.parseInt(s, 10));
  const norm = normalizeTimeString(timeIso);
  const [h, mi, s] = norm.split(':').map((s) => Number.parseInt(s, 10));
  return Date.UTC(y!, mo! - 1, d!, h!, mi!, s!);
}

interface WallComponents {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Read wall components from a wall-ms value, rounded to the nearest second. */
export function wallComponents(ms: number): WallComponents {
  const rounded = Math.round(ms / 1000) * 1000;
  const date = new Date(rounded);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  };
}

/** Format an east-positive minute offset as "+HH:MM" / "-HH:MM". */
export function formatOffsetEast(offsetEastMin: number): string {
  const sign = offsetEastMin < 0 ? '-' : '+';
  const abs = Math.abs(offsetEastMin);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  return `${sign}${pad2(hh)}:${pad2(mm)}`;
}

/** "YYYY-MM-DDTHH:mm:ss" with no zone suffix (used for solar wall clocks). */
export function formatWallDateTime(ms: number): string {
  const c = wallComponents(ms);
  return `${pad4(c.year)}-${pad2(c.month)}-${pad2(c.day)}T${pad2(c.hour)}:${pad2(c.minute)}:${pad2(c.second)}`;
}

/** "YYYY-MM-DDTHH:mm:ss±HH:MM" — a civil datetime with explicit offset. */
export function formatLocalCivil(wallMs: number, offsetEastMin: number): string {
  return `${formatWallDateTime(wallMs)}${formatOffsetEast(offsetEastMin)}`;
}

/** "YYYY-MM-DDTHH:mm:ssZ" from a true UTC instant in ms (milliseconds dropped). */
export function formatUtcInstant(utcMs: number): string {
  return `${new Date(Math.round(utcMs / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')}`;
}

/** Day of year (1-366) from a true UTC instant. */
export function utcDayOfYear(utcMs: number): number {
  const d = new Date(utcMs);
  const startOfYear = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((utcMs - startOfYear) / 86400000) + 1;
}
