import { describe, expect, it } from 'vitest';
import { parseBirthInput } from '@ming/contracts';
import { normalizeBirthData, parseWallToMs, resolveWallClock } from '@ming/time-location';
import { timeLocationFixtures } from '@ming/test-fixtures';

describe('resolveWallClock', () => {
  it('returns exactly one instant for an ordinary time', () => {
    const wall = parseWallToMs('2000-06-15', '12:00:00');
    expect(resolveWallClock(wall, 'Asia/Shanghai')).toHaveLength(1);
  });

  it('returns zero instants for a spring-forward gap (NY 2021-03-14 02:30)', () => {
    const wall = parseWallToMs('2021-03-14', '02:30:00');
    expect(resolveWallClock(wall, 'America/New_York')).toHaveLength(0);
  });

  it('returns two instants for an autumn fall-back hour (NY 2021-11-07 01:30)', () => {
    const wall = parseWallToMs('2021-11-07', '01:30:00');
    const candidates = resolveWallClock(wall, 'America/New_York');
    expect(candidates).toHaveLength(2);
    // Sorted ascending: earlier is EDT (-240 east), later is EST (-300 east).
    expect(candidates[0]!.offsetEastMin).toBe(-240);
    expect(candidates[1]!.offsetEastMin).toBe(-300);
    expect(candidates[0]!.utcMs).toBeLessThan(candidates[1]!.utcMs);
  });
});

describe('wall <-> UTC round-trip invariant', () => {
  // For any resolved instant, localWall = utc + offsetEast holds exactly.
  it('holds for every unambiguous known-time fixture', () => {
    for (const fx of timeLocationFixtures) {
      if (fx.expect.kind !== 'ok') continue;
      const input = parseBirthInput(fx.input);
      const n = normalizeBirthData(input);
      if (!n.timeKnown) continue;
      const wall = parseWallToMs(n.localDate, n.localTime);
      expect(wall).toBe(n.utcInstantMs + n.timezoneOffsetMinutes * 60_000);
    }
  });
});
