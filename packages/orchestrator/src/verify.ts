import { ChartBundle as ChartBundleSchema, canonicalJson, parseBirthInput } from '@loom/contracts';
import type { BirthInput } from '@loom/contracts';
import { calculate } from './calculate.ts';

export interface VerifyCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface VerifyReport {
  ok: boolean;
  checks: VerifyCheck[];
}

/** Fixed clock so `verify` compares byte-for-byte without a volatile timestamp. */
const FIXED_NOW = Date.parse('2026-01-01T00:00:00Z');
const ISO_Z_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/**
 * Self-verification (CLI `verify`): proves the packaged engine is internally
 * consistent and deterministic on the bundled smoke fixture. This is the same
 * property the cross-environment reproducibility guarantee relies on (handoff §9).
 */
export function verify(fixtureInput: unknown): VerifyReport {
  const checks: VerifyCheck[] = [];

  let input: BirthInput;
  try {
    input = parseBirthInput(fixtureInput);
    checks.push({ name: 'smoke fixture parses against BirthInput', ok: true });
  } catch (err) {
    return {
      ok: false,
      checks: [{ name: 'smoke fixture parses against BirthInput', ok: false, detail: String(err) }],
    };
  }

  const first = calculate(input, { now: FIXED_NOW });
  const second = calculate(input, { now: FIXED_NOW });

  checks.push({
    name: 'canonical JSON is byte-identical across runs',
    ok: canonicalJson(first) === canonicalJson(second),
  });
  checks.push({
    name: 'requestId is derived deterministically',
    ok: first.requestId === second.requestId,
    detail: first.requestId,
  });
  checks.push({
    name: 'bundle validates against ChartBundle schema',
    ok: ChartBundleSchema.safeParse(first).success,
  });
  checks.push({
    name: 'utcInstant is an ISO-Z instant',
    ok: ISO_Z_RE.test(first.normalizedTime.utcInstant),
    detail: first.normalizedTime.utcInstant,
  });
  checks.push({
    name: 'TZDB version is recorded in provenance',
    ok: first.provenance.tzdb.version.length > 0,
    detail: first.provenance.tzdb.version,
  });

  return { ok: checks.every((c) => c.ok), checks };
}
