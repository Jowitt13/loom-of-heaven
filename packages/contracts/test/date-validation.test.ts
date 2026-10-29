import { describe, expect, it } from 'vitest';
import { isRealGregorianDate, parseBirthInput } from '@loom/contracts';

// Synthetic fixture — fictional data only; not a real person.
const base = {
  calendar: 'gregorian',
  localDate: '1990-06-15',
  localTime: '08:30',
  timeAccuracy: 'exact',
  timezone: 'Asia/Shanghai',
  location: { latitude: 31.23, longitude: 121.47, source: 'user' },
} as const;

function input(localDate: string, overrides: Record<string, unknown> = {}) {
  return { ...base, localDate, ...overrides };
}

function rejection(localDate: string): unknown {
  try {
    parseBirthInput(input(localDate));
  } catch (err) {
    return err;
  }
  throw new Error(`expected ${localDate} to be rejected`);
}

describe('Gregorian localDate integrity', () => {
  it.each([
    '2023-02-29',
    '2024-02-30',
    '2023-02-30',
    '2023-04-31',
    '2023-00-10',
    '2023-01-00',
    '2023-13-01',
    '2100-02-29',
  ])('rejects nonexistent Gregorian date %s without echoing it', (localDate) => {
    const err = rejection(localDate) as { issues?: unknown };
    const issues = JSON.stringify(err.issues ?? '');
    expect(issues).toContain('localDate must be a real Gregorian calendar date');
    expect(issues).not.toContain(localDate);
  });

  it.each(['2000-02-29', '1990-06-15', '2100-02-28'])(
    'accepts real Gregorian date %s and preserves it',
    (localDate) => {
      expect(parseBirthInput(input(localDate)).localDate).toBe(localDate);
    },
  );

  it('does not apply Gregorian date rules to lunar input', () => {
    const parsed = parseBirthInput(
      input('2023-02-30', { calendar: 'lunar', lunarLeapMonth: false }),
    );
    expect(parsed.calendar).toBe('lunar');
    expect(parsed.localDate).toBe('2023-02-30');
  });

  it('keeps real but out-of-range dates for the existing range gate', () => {
    for (const localDate of ['1850-01-01', '2200-01-01']) {
      expect(parseBirthInput(input(localDate)).localDate).toBe(localDate);
    }
  });

  it('exposes the same pure predicate used by validation', () => {
    expect(isRealGregorianDate('2000-02-29')).toBe(true);
    expect(isRealGregorianDate('2100-02-29')).toBe(false);
    expect(isRealGregorianDate('2023-02-29')).toBe(false);
    expect(isRealGregorianDate('2023-04-31')).toBe(false);
    expect(isRealGregorianDate('2023-13-01')).toBe(false);
    expect(isRealGregorianDate('2023-00-10')).toBe(false);
    expect(isRealGregorianDate('2023-01-00')).toBe(false);
  });
});
