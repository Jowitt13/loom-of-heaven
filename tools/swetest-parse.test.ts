// Fully OFFLINE unit tests for the strict swetest output parser. Every input
// below is a SYNTHETIC string written by hand — no real external tool output
// is referenced, stored or replayed here.
import { describe, expect, it } from 'vitest';
import { parseSwetestAngle, parseSwetestHouses } from './swetest-parse.ts';

describe('parseSwetestAngle', () => {
  it('parses a DMS field to full precision (official -house shape)', () => {
    expect(parseSwetestAngle("93°10'50.7734")).toBeCloseTo(93 + 10 / 60 + 50.7734 / 3600, 9);
  });

  it('parses a DMS field with a space before the seconds', () => {
    expect(parseSwetestAngle("94°45' 1.3614")).toBeCloseTo(94 + 45 / 60 + 1.3614 / 3600, 9);
  });

  it('parses plain decimal degrees', () => {
    expect(parseSwetestAngle('123.4567890')).toBeCloseTo(123.456789, 9);
    expect(parseSwetestAngle('0')).toBe(0);
  });

  it('accepts the top of the valid range but rejects 360 itself', () => {
    expect(parseSwetestAngle("359°59'59.999")).toBeLessThan(360);
    expect(() => parseSwetestAngle("360°00'00.0")).toThrow();
    expect(() => parseSwetestAngle('361.5')).toThrow();
  });

  it('rejects incomplete DMS fields (missing minutes or seconds)', () => {
    expect(() => parseSwetestAngle('93°')).toThrow();
    expect(() => parseSwetestAngle("93°10'")).toThrow();
  });

  it('rejects garbage, signs and empty input', () => {
    expect(() => parseSwetestAngle('abc')).toThrow();
    expect(() => parseSwetestAngle("93°10'5x.3")).toThrow();
    expect(() => parseSwetestAngle('-5.0')).toThrow();
    expect(() => parseSwetestAngle('')).toThrow();
    expect(() => parseSwetestAngle('   ')).toThrow();
  });

  it('rejects out-of-range minutes and seconds components', () => {
    expect(() => parseSwetestAngle("93°61'10.0")).toThrow();
    expect(() => parseSwetestAngle("93°10'75.0")).toThrow();
  });

  it('rejects partial matches — the whole field must be consumed', () => {
    expect(() => parseSwetestAngle("93°10'50.7734 junk")).toThrow();
    expect(() => parseSwetestAngle('123.456 extra')).toThrow();
  });

  it('never echoes the raw field content in error messages', () => {
    for (const bad of ["93°10'50.7734 junk", 'abc', '-5.0', "93°61'10.0"]) {
      let message = '';
      try {
        parseSwetestAngle(bad, 'ctx');
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).not.toBe('');
      expect(message).not.toContain(bad);
    }
  });
});

/**
 * Build a synthetic, fully-populated TWO-COLUMN swetest -house stdout.
 * Column 1 mixes DMS and decimal forms; column 2 is always a valid DMS
 * lexeme (including one with an internal space before the seconds) whose
 * value must never leak into the parsed result.
 */
function syntheticStdout(omit?: 'house7' | 'Ascendant' | 'MC'): string {
  const lines: string[] = [];
  for (let i = 1; i <= 12; i++) {
    if (omit === 'house7' && i === 7) continue;
    // Alternate DMS and decimal forms in column 1 to exercise both branches.
    const base = (i * 30 + 3) % 360;
    const col1 = i % 2 === 0 ? `${base}.5000000` : `${base}°15'30.0000`;
    // One second column with an internal space before the seconds.
    const col2 = i === 3 ? "94°45' 1.3614" : "12°34'56.7890";
    lines.push(`house ${i}  ${col1}  ${col2}`);
  }
  if (omit !== 'Ascendant') lines.push("Ascendant  93°10'50.7734   8°15'20.0000");
  if (omit !== 'MC') lines.push("MC         1.2345678   88°59'59.0000");
  lines.push("ARMC       359°59'59.999   0°01'02.0000");
  lines.push('Vertex     123.0000000'); // recognised-but-unused label
  return `${lines.join('\n')}\n`;
}

describe('parseSwetestHouses', () => {
  it('parses a complete two-column synthetic output (first column only enters the result)', () => {
    const r = parseSwetestHouses(syntheticStdout(), 'synthetic/full');
    expect(r.cusps).toHaveLength(12);
    expect(r.cusps[0]).toBeCloseTo(33 + 15 / 60 + 30 / 3600, 9); // house 1 col1: 33°15'30.0000
    expect(r.cusps[1]).toBeCloseTo(63.5, 9); // house 2 col1: 63.5000000
    expect(r.cusps[2]).toBeCloseTo(93 + 15 / 60 + 30 / 3600, 9); // house 3 col1 (col2 has internal space)
    expect(r.ascendant).toBeCloseTo(93 + 10 / 60 + 50.7734 / 3600, 9);
    expect(r.mc).toBeCloseTo(1.2345678, 9);
    expect(r.armc).toBeCloseTo(359 + 59 / 60 + 59.999 / 3600, 9);
  });

  it('rejects a house line missing its second column', () => {
    const bad = syntheticStdout().replace(
      "house 1  33°15'30.0000  12°34'56.7890",
      "house 1  33°15'30.0000",
    );
    expect(() => parseSwetestHouses(bad, 'synthetic/one-col')).toThrow(/malformed two-column/);
  });

  it('rejects a house line with a third column', () => {
    const bad = syntheticStdout().replace(
      "house 1  33°15'30.0000  12°34'56.7890",
      "house 1  33°15'30.0000  12°34'56.7890  7°08'09.0000",
    );
    expect(() => parseSwetestHouses(bad, 'synthetic/three-col')).toThrow(/malformed two-column/);
  });

  it('rejects a garbled second column', () => {
    const bad = syntheticStdout().replace(
      "house 1  33°15'30.0000  12°34'56.7890",
      "house 1  33°15'30.0000  garbage",
    );
    expect(() => parseSwetestHouses(bad, 'synthetic/garbled-col2')).toThrow(/malformed two-column/);
  });

  it('rejects an incomplete DMS second column', () => {
    const bad = syntheticStdout().replace(
      "house 1  33°15'30.0000  12°34'56.7890",
      "house 1  33°15'30.0000  94°45'",
    );
    expect(() => parseSwetestHouses(bad, 'synthetic/incomplete-col2')).toThrow(
      /malformed two-column/,
    );
  });

  it('rejects output with a missing house cusp', () => {
    expect(() => parseSwetestHouses(syntheticStdout('house7'), 'synthetic/no-h7')).toThrow(
      /missing house cusps 7/,
    );
  });

  it('rejects output with a missing Ascendant or MC', () => {
    expect(() => parseSwetestHouses(syntheticStdout('Ascendant'), 'synthetic/no-asc')).toThrow(
      /missing Ascendant/,
    );
    expect(() => parseSwetestHouses(syntheticStdout('MC'), 'synthetic/no-mc')).toThrow(
      /missing MC/,
    );
  });

  it('rejects a malformed first-column value inside otherwise valid output', () => {
    const bad = syntheticStdout().replace("house 1  33°15'30.0000", 'house 1  33°garbled');
    expect(() => parseSwetestHouses(bad, 'synthetic/garbled')).toThrow();
  });

  it('never embeds raw line content in error messages', () => {
    const sentinel = "33°15'30.0000GARBLEDSENTINEL";
    const bad = syntheticStdout().replace("house 1  33°15'30.0000", `house 1  ${sentinel}`);
    let message = '';
    try {
      parseSwetestHouses(bad, 'synthetic/sentinel');
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toBe('');
    expect(message).not.toContain(sentinel);
    expect(message).not.toContain('GARBLEDSENTINEL');
  });
});
