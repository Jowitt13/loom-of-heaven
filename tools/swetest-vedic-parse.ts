/**
 * Strict, side-effect-free parsers for the machine-readable subset of
 * `swetest` output used by the one-time Vedic P2 golden capture.
 *
 * These parsers deliberately accept only the exact `-head -fPl` output shape
 * emitted by the pinned external reference workflow. They reject extra lines,
 * duplicate labels, malformed numbers and missing expected labels so a tool
 * format change cannot silently alter a golden fixture.
 */

export const VEDIC_GRAHAS = [
  'Sun',
  'Moon',
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
] as const;
export type VedicGrahaName = (typeof VEDIC_GRAHAS)[number];

const LINE_RE = /^(.*?)\s+(\d{1,3}(?:\.\d+)?)$/;

function parseDecimalLongitude(value: string, context: string): number {
  if (!/^\d{1,3}(?:\.\d+)?$/.test(value)) {
    throw new Error(`malformed decimal longitude (${context})`);
  }
  const longitude = Number(value);
  if (!Number.isFinite(longitude) || longitude < 0 || longitude >= 360) {
    throw new Error(`longitude out of [0,360) range (${context})`);
  }
  return longitude;
}

/**
 * Parse a `-head -fPl` response with exactly one line for every requested
 * label. `expectedLabels` is part of the contract: any unrequested line is a
 * failure, rather than a value that might accidentally become trusted data.
 */
export function parseSwetestLongitudes(
  stdout: string,
  expectedLabels: readonly string[],
  context: string,
): Record<string, number> {
  const expected = new Set(expectedLabels);
  const values: Record<string, number> = {};
  const lines = stdout.split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!.trim();
    if (line === '') continue;
    const where = `${context} line ${index + 1}`;
    const match = LINE_RE.exec(line);
    if (!match) {
      throw new Error(`malformed swetest longitude line (${where})`);
    }
    const label = match[1]!.trim();
    if (!expected.has(label)) {
      throw new Error(`unexpected swetest label (${where})`);
    }
    if (Object.hasOwn(values, label)) {
      throw new Error(`duplicate swetest label (${where})`);
    }
    values[label] = parseDecimalLongitude(match[2]!, where);
  }

  const missing = expectedLabels.filter((label) => !Object.hasOwn(values, label));
  if (missing.length > 0) {
    throw new Error(`missing swetest labels ${missing.join(',')} (${context})`);
  }
  return values;
}

/** Parse the seven classical visible grahas in their fixed public key order. */
export function parseSwetestGrahas(
  stdout: string,
  context: string,
): Record<VedicGrahaName, number> {
  const parsed = parseSwetestLongitudes(stdout, VEDIC_GRAHAS, context);
  return Object.fromEntries(VEDIC_GRAHAS.map((name) => [name, parsed[name]!])) as Record<
    VedicGrahaName,
    number
  >;
}

/** Parse exactly one named reference point, e.g. `mean Node` or `true Node`. */
export function parseSwetestPoint(stdout: string, label: string, context: string): number {
  return parseSwetestLongitudes(stdout, [label], context)[label]!;
}
