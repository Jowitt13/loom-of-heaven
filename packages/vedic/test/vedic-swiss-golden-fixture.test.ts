import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { computeVedicP2Positions } from '@ming/vedic';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, '..', 'goldens', 'swiss-vedic-mode1.json');
const GRAHAS = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'] as const;

interface GoldenCase {
  id: string;
  description: string;
  utcIso: string;
  timezone: string;
  latDeg: number;
  lonEastDeg: number;
  boundaryTags: string[];
  grahas: Record<(typeof GRAHAS)[number], number>;
  meanRahu: number;
  trueRahu: number;
  meanKetu: number;
  trueKetu: number;
  lagna: number;
}

interface Fixture {
  schemaVersion: string;
  status: string;
  source: {
    version: string;
    captureDateUtc: string;
    swetestBinarySha256: string;
    rawManifestSha256: string;
    referenceInputTimeScale: string;
    siderealMode: string;
    ephemerisMode: string;
  };
  toleranceArcmin: number;
  cases: GoldenCase[];
}

const fixture: Fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

function norm360(value: number): number {
  const out = value % 360;
  return out < 0 ? out + 360 : out;
}

function isLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value < 360;
}

function arcMinuteDifference(actual: number, expected: number): number {
  const delta = Math.abs(norm360(actual - expected));
  return Math.min(delta, 360 - delta) * 60;
}

function boundaryIndex(c: GoldenCase): number {
  if (c.boundaryTags.includes('rashi')) return Math.floor(c.grahas.Moon / 30);
  if (c.boundaryTags.includes('nakshatra')) return Math.floor(c.grahas.Moon / (360 / 27));
  if (c.boundaryTags.includes('pada')) return Math.floor(c.grahas.Moon / (360 / 108));
  if (c.boundaryTags.includes('tithi'))
    return Math.floor(norm360(c.grahas.Moon - c.grahas.Sun) / 12);
  throw new Error(`boundary row without a supported tag: ${c.id}`);
}

describe('Vedic Swiss mode-1 golden: fail-closed fixture gate', () => {
  it('is a populated, provenance-complete offline capture of at least 100 synthetic cases', () => {
    expect(fixture.schemaVersion).toBe('vedic-swiss-golden/v1');
    expect(fixture.status).toBe('populated');
    expect(fixture.cases.length).toBeGreaterThanOrEqual(100);
    expect(fixture.source.version).toMatch(/^Version:\s*2\.10\.03$/);
    expect(fixture.source.swetestBinarySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fixture.source.rawManifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fixture.source.referenceInputTimeScale).toBe('UTC');
    expect(fixture.source.siderealMode).toContain('SE_SIDM_LAHIRI');
    expect(fixture.source.ephemerisMode).toContain('-emos');
    expect(fixture.toleranceArcmin).toBeGreaterThan(0);
    expect(fixture.toleranceArcmin).toBeLessThanOrEqual(1);
  });

  it('contains complete bounded values and exact Ketu opposition for each reference row', () => {
    for (const c of fixture.cases) {
      expect(c.id).toMatch(/^(coverage|boundary)-/);
      expect(c.description).toMatch(/synthetic/i);
      expect(c.utcIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(c.timezone).toBeTruthy();
      expect(c.latDeg).toBeGreaterThanOrEqual(-90);
      expect(c.latDeg).toBeLessThanOrEqual(90);
      expect(c.lonEastDeg).toBeGreaterThanOrEqual(-180);
      expect(c.lonEastDeg).toBeLessThanOrEqual(180);
      for (const graha of GRAHAS) expect(isLongitude(c.grahas[graha])).toBe(true);
      for (const value of [c.meanRahu, c.trueRahu, c.meanKetu, c.trueKetu, c.lagna]) {
        expect(isLongitude(value)).toBe(true);
      }
      expect(norm360(c.meanKetu - c.meanRahu)).toBeCloseTo(180, 9);
      expect(norm360(c.trueKetu - c.trueRahu)).toBeCloseTo(180, 9);
    }
  });

  it('keeps every P2 runtime field within the frozen Swiss tolerance', () => {
    for (const c of fixture.cases) {
      const actual = computeVedicP2Positions({
        utcInstantMs: Date.parse(c.utcIso),
        latitudeDeg: c.latDeg,
        longitudeEastDeg: c.lonEastDeg,
      });
      for (const graha of GRAHAS) {
        expect(
          arcMinuteDifference(actual.grahas[graha], c.grahas[graha]),
          `${c.id} ${graha}`,
        ).toBeLessThanOrEqual(fixture.toleranceArcmin);
      }
      for (const [label, observed, expected] of [
        ['mean Rahu', actual.meanRahuLongitudeDeg, c.meanRahu],
        ['true Rahu', actual.trueRahuLongitudeDeg, c.trueRahu],
        ['Lagna', actual.lagnaLongitudeDeg, c.lagna],
      ] as const) {
        expect(arcMinuteDifference(observed, expected), `${c.id} ${label}`).toBeLessThanOrEqual(
          fixture.toleranceArcmin,
        );
      }
      expect(norm360(actual.meanKetuLongitudeDeg - actual.meanRahuLongitudeDeg)).toBeCloseTo(
        180,
        9,
      );
      expect(norm360(actual.trueKetuLongitudeDeg - actual.trueRahuLongitudeDeg)).toBeCloseTo(
        180,
        9,
      );
    }
  });

  it('preserves the required 84/16 coverage and boundary-probe matrix', () => {
    expect(fixture.cases.filter((c) => c.id.startsWith('coverage-'))).toHaveLength(84);
    const boundaryCases = fixture.cases.filter((c) => c.id.startsWith('boundary-'));
    expect(boundaryCases).toHaveLength(16);
    const tags = fixture.cases.flatMap((c) => c.boundaryTags);
    for (const tag of ['rashi', 'nakshatra', 'dasha-lord', 'pada', 'D9', 'tithi']) {
      expect(tags.filter((candidate) => candidate === tag)).toHaveLength(4);
    }

    const pairs = new Map<string, GoldenCase[]>();
    for (const c of boundaryCases) {
      const key = c.id.replace(/-(before|after)$/, '');
      pairs.set(key, [...(pairs.get(key) ?? []), c]);
    }
    expect(pairs).toHaveLength(8);
    for (const [key, pair] of pairs) {
      expect(pair, `${key} must contain a before/after pair`).toHaveLength(2);
      const before = pair.find((c) => c.id.endsWith('-before'));
      const after = pair.find((c) => c.id.endsWith('-after'));
      expect(before, `${key} missing before`).toBeDefined();
      expect(after, `${key} missing after`).toBeDefined();
      expect(Date.parse(after!.utcIso) - Date.parse(before!.utcIso)).toBe(120_000);
      expect(boundaryIndex(before!)).not.toBe(boundaryIndex(after!));
    }
  });
});
