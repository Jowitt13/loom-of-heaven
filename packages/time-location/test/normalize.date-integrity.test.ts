import { describe, expect, it } from 'vitest';
import { EngineError, ERROR_CODES } from '@loom/contracts';
import type { BirthInput } from '@loom/contracts';
import { normalizeBirthData } from '@loom/time-location';

// Synthetic fixture — fictional data only; not a real person.
const base = {
  calendar: 'gregorian',
  localDate: '1990-06-15',
  localTime: '08:30:00',
  timeAccuracy: 'exact',
  timezone: 'Asia/Shanghai',
  location: { latitude: 31.23, longitude: 121.47, source: 'user' },
} as const;

/** Bypass the public parser to exercise the normalization boundary itself. */
function forged(localDate: string): BirthInput {
  return { ...base, localDate } as unknown as BirthInput;
}

function thrownBy(fn: () => unknown): EngineError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(EngineError);
    return err as EngineError;
  }
  throw new Error('expected an EngineError');
}

describe('normalization date defense', () => {
  it('rejects a nonexistent Gregorian date without echoing it', () => {
    const err = thrownBy(() => normalizeBirthData(forged('2023-02-29')));
    expect(err.code).toBe(ERROR_CODES.INPUT_VALIDATION_FAILED);
    expect(err.message).not.toContain('2023-02-29');
    expect(JSON.stringify(err.detail)).not.toContain('2023-02-29');
  });

  it('keeps the existing DATE_OUT_OF_RANGE semantic for real out-of-range dates', () => {
    const err = thrownBy(() => normalizeBirthData(forged('1850-01-01')));
    expect(err.code).toBe(ERROR_CODES.DATE_OUT_OF_RANGE);
  });

  it('normalizes a leap day with consistent local and UTC semantics', () => {
    const n = normalizeBirthData(forged('2000-02-29'));
    expect(n.localDate).toBe('2000-02-29');
    expect(n.localCivilIso).toBe('2000-02-29T08:30:00+08:00');
    expect(n.utcInstant).toBe('2000-02-29T00:30:00Z');
    expect(Date.parse(n.localCivilIso)).toBe(Date.parse(n.utcInstant));
  });

  it.each(['1990-06-15', '2100-02-28'])(
    'keeps date, civil time, and UTC semantics aligned for %s',
    (localDate) => {
      const n = normalizeBirthData(forged(localDate));
      expect(n.localDate).toBe(localDate);
      expect(n.localCivilIso.startsWith(`${localDate}T08:30:00`)).toBe(true);
      expect(Date.parse(n.localCivilIso)).toBe(Date.parse(n.utcInstant));
    },
  );
});
