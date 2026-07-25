import { LunarDay } from 'tyme4ts';

/**
 * Lunar → Gregorian conversion via tyme4ts (the calendar authority). A leap month
 * is expressed as a negative month number in tyme4ts (handoff §4 leap-month input).
 */
export function lunarToGregorian(
  year: number,
  month: number,
  day: number,
  isLeapMonth: boolean,
): { year: number; month: number; day: number } {
  const tymeMonth = isLeapMonth ? -Math.abs(month) : month;
  const solarDay = LunarDay.fromYmd(year, tymeMonth, day).getSolarDay();
  return { year: solarDay.getYear(), month: solarDay.getMonth(), day: solarDay.getDay() };
}
