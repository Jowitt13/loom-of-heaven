/**
 * Strict parser for Swiss Ephemeris `swetest -house` output.
 *
 * Pure module: no I/O, no environment access, no side effects — imported by
 * both the one-time generator (tools/generate-house-golden.ts) and its fully
 * OFFLINE unit tests (tools/swetest-parse.test.ts).
 *
 * Fail-closed by design: every numeric field must be consumed IN FULL (no
 * partial matches), and every thrown error is structural only — it never
 * echoes raw external output back, so nothing from a swetest run can leak
 * into tracked logs via error messages.
 */

/** swetest DMS field, e.g. `93°10'50.7734` or `94°45' 1.3614` (space before seconds). */
const DMS_RE = /^(\d{1,3})°\s*(\d{1,2})'\s*(\d{1,2}(?:\.\d+)?)"?$/;
/** Plain decimal-degree field, e.g. `123.4567890`. */
const DECIMAL_RE = /^\d{1,3}(?:\.\d+)?$/;

// Non-anchored lexemes for splitting the TWO-COLUMN swetest line shape.
// A DMS field may contain an internal space before the seconds, so columns
// cannot be split on whitespace — the anchored two-column regex below
// separates them by lexical shape (with backtracking), and its ^…$ anchors
// reject a missing second column, a third column and any trailing garbage.
const DMS_LEX = /\d{1,3}°\s*\d{1,2}'\s*\d{1,2}(?:\.\d+)?"?/;
const FIELD_LEX = new RegExp(`(?:${DMS_LEX.source}|\\d{1,3}(?:\\.\\d+)?)`);
// The ignored auxiliary column can contain an ARMC-related value beyond a
// full turn, which Swiss emits with four degree digits on some dates.
const AUX_DMS_RE = /^(\d{1,4})°\s*(\d{1,2})'\s*(\d{1,2}(?:\.\d+)?)"?$/;
const AUX_DMS_LEX = /\d{1,4}°\s*\d{1,2}'\s*\d{1,2}(?:\.\d+)?"?/;
const AUX_DECIMAL_RE = /^\d{1,4}(?:\.\d+)?$/;
const AUX_FIELD_LEX = new RegExp(`(?:${AUX_DMS_LEX.source}|\\d{1,4}(?:\\.\\d+)?)`);
const TWO_COL_RE = new RegExp(`^(${FIELD_LEX.source})\\s+(${AUX_FIELD_LEX.source})$`);

/**
 * Parse a single swetest angle field into decimal degrees.
 *
 * Accepts exactly two shapes — DMS (`D°M'S[.frac]["]`) or decimal degrees —
 * anchored over the WHOLE trimmed field. Anything else (missing minutes or
 * seconds, stray characters, signs, trailing garbage, empty input) throws.
 * The result must lie in [0, 360).
 */
export function parseSwetestAngle(field: string, context = 'angle'): number {
  const trimmed = field.trim();
  if (trimmed === '') {
    throw new Error(`empty angle field (${context})`);
  }

  let value: number;
  const dms = trimmed.match(DMS_RE);
  if (dms) {
    const deg = Number(dms[1]);
    const min = Number(dms[2]);
    const sec = Number(dms[3]);
    if (min >= 60) {
      throw new Error(`minutes out of range (${context})`);
    }
    if (sec >= 60) {
      throw new Error(`seconds out of range (${context})`);
    }
    value = deg + min / 60 + sec / 3600;
  } else if (DECIMAL_RE.test(trimmed)) {
    value = Number(trimmed);
  } else {
    throw new Error(`malformed angle field (${context})`);
  }

  if (!Number.isFinite(value) || value < 0 || value >= 360) {
    throw new Error(`angle out of [0,360) range (${context})`);
  }
  return value;
}

/**
 * Validate the ignored second `-house` column. It has the same lexical forms
 * as an angle, but ARMC-related rows can legitimately exceed 360° there, so
 * it must not inherit the retained first column's [0,360) range contract.
 */
function validateSwetestAuxiliaryAngle(field: string, context: string): void {
  const trimmed = field.trim();
  const dms = trimmed.match(AUX_DMS_RE);
  if (dms) {
    const min = Number(dms[2]);
    const sec = Number(dms[3]);
    if (min >= 60 || sec >= 60) {
      throw new Error(`auxiliary angle component out of range (${context})`);
    }
    return;
  }
  if (AUX_DECIMAL_RE.test(trimmed) && Number.isFinite(Number(trimmed))) return;
  throw new Error(`malformed auxiliary angle (${context})`);
}

export interface ParsedHouse {
  cusps: number[]; // index 0 = house 1 ... index 11 = house 12
  ascendant: number;
  mc: number;
  armc: number | null;
}

/**
 * Split a recognised line's remainder into its two columns and return the
 * parsed FIRST column. Column 1 must be a strictly valid DMS or decimal
 * angle in [0,360) (re-checked by parseSwetestAngle's full-consumption
 * contract) and is the value we keep. Column 2 must be present and fully
 * match the same strict DMS-or-decimal angle grammar, but is deliberately NOT
 * captured as a golden value. Swiss emits decimal second columns for some
 * valid historical house rows, and ARMC-related auxiliary values can exceed
 * 360°, so requiring DMS or a longitude range there would reject a real
 * reference capture. Anything else — missing second column, a third column,
 * trailing garbage, a garbled or incomplete second column — is rejected. The
 * error stays structural: no raw external content is echoed.
 */
function parseTwoColumnValue(rest: string, where: string): number {
  const m = rest.trim().match(TWO_COL_RE);
  if (!m) {
    throw new Error(`malformed two-column line (${where})`);
  }
  // Validate the ignored reference column syntactically. Its ARMC-related
  // values may lie outside [0,360), unlike the retained ecliptic longitude.
  validateSwetestAuxiliaryAngle(m[2]!, `${where} column 2`);
  return parseSwetestAngle(m[1]!, where);
}

/**
 * Parse full swetest -house output. Standard lines are TWO-COLUMN (with
 * -head suppressing the header):
 *   house  1  93°10'50.7734  <second DMS column>
 *   ...
 *   house 12  ...           ...
 *   Ascendant  ...          ...
 *   MC         ...          ...
 *   ARMC       ...          ...
 * The remainder after each recognised label must match the two-column shape
 * exactly; only the first column enters the result. Errors carry only the
 * caller-supplied context, the 1-based line number and structural facts —
 * never raw line content.
 */
export function parseSwetestHouses(stdout: string, context: string): ParsedHouse {
  const cusps: (number | undefined)[] = new Array(12).fill(undefined);
  let ascendant: number | undefined;
  let mc: number | undefined;
  let armc: number | null = null;

  const lines = stdout.split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n]!.trim();
    const where = `${context} line ${n + 1}`;
    if (line === '') continue;

    const h = line.match(/^house\s+(\d{1,2})\s+(.+)$/i);
    if (h) {
      const idx = Number(h[1]) - 1;
      if (idx < 0 || idx > 11) {
        throw new Error(`house number out of range (${where})`);
      }
      if (cusps[idx] !== undefined) {
        throw new Error(`duplicate house ${idx + 1} line (${where})`);
      }
      cusps[idx] = parseTwoColumnValue(h[2]!, where);
      continue;
    }
    const asc = line.match(/^Ascendant\s+(.+)$/i);
    if (asc) {
      if (ascendant !== undefined) {
        throw new Error(`duplicate Ascendant line (${where})`);
      }
      ascendant = parseTwoColumnValue(asc[1]!, where);
      continue;
    }
    const armcM = line.match(/^ARMC\s+(.+)$/i);
    if (armcM) {
      if (armc !== null) {
        throw new Error(`duplicate ARMC line (${where})`);
      }
      armc = parseTwoColumnValue(armcM[1]!, where);
      continue;
    }
    const mcM = line.match(/^MC\s+(.+)$/i);
    if (mcM) {
      if (mc !== undefined) {
        throw new Error(`duplicate MC line (${where})`);
      }
      mc = parseTwoColumnValue(mcM[1]!, where);
      continue;
    }
    // Vertex / equat. Asc. / co-Asc. / polar Asc. etc — recognised but unused.
  }

  const missing = cusps
    .map((v, i) => (v === undefined ? i + 1 : null))
    .filter((x): x is number => x !== null);
  if (missing.length > 0) {
    throw new Error(`missing house cusps ${missing.join(',')} (${context})`);
  }
  if (ascendant === undefined) {
    throw new Error(`missing Ascendant (${context})`);
  }
  if (mc === undefined) {
    throw new Error(`missing MC (${context})`);
  }
  return { cusps: cusps as number[], ascendant, mc, armc };
}
