import { describe, expect, it } from 'vitest';
import {
  parseSwetestGrahas,
  parseSwetestLongitudes,
  parseSwetestPoint,
} from './swetest-vedic-parse.ts';

const GRAHAS = `Sun              256.5157014
Moon             199.4706024
Mercury          248.0360589
Venus            217.7125808
Mars             304.1100940
Jupiter           1.3998080
Saturn           16.5424164
`;

describe('swetest Vedic parser', () => {
  it('parses the pinned seven-graha -head -fPl output exactly', () => {
    expect(parseSwetestGrahas(GRAHAS, 'synthetic')).toEqual({
      Sun: 256.5157014,
      Moon: 199.4706024,
      Mercury: 248.0360589,
      Venus: 217.7125808,
      Mars: 304.110094,
      Jupiter: 1.399808,
      Saturn: 16.5424164,
    });
  });

  it('parses an individually named node point', () => {
    expect(parseSwetestPoint('mean Node        101.1874234\n', 'mean Node', 'mean')).toBe(
      101.1874234,
    );
  });

  it('rejects missing labels', () => {
    expect(() =>
      parseSwetestGrahas(GRAHAS.replace('Saturn           16.5424164\n', ''), 'x'),
    ).toThrow(/missing swetest labels Saturn/);
  });

  it('rejects unexpected output rather than silently ignoring it', () => {
    expect(() => parseSwetestGrahas(`${GRAHAS}Pluto            10.0000000\n`, 'x')).toThrow(
      /unexpected swetest label/,
    );
  });

  it('rejects duplicate labels', () => {
    expect(() => parseSwetestGrahas(`${GRAHAS}Sun              256.5157014\n`, 'x')).toThrow(
      /duplicate swetest label/,
    );
  });

  it('rejects malformed and out-of-range numbers', () => {
    expect(() => parseSwetestPoint('mean Node        -1.0\n', 'mean Node', 'x')).toThrow(
      /malformed swetest longitude line/,
    );
    expect(() => parseSwetestPoint('mean Node        360.0\n', 'mean Node', 'x')).toThrow(
      /longitude out of \[0,360\)/,
    );
  });

  it('returns only explicitly requested labels', () => {
    expect(parseSwetestLongitudes('true Node        100.0996727\n', ['true Node'], 'x')).toEqual({
      'true Node': 100.0996727,
    });
  });
});
