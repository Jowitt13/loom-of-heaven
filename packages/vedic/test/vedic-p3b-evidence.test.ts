import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { nextSunriseUtcMs, vaaraAtInstant, vimshottariFromMoon } from '@loom/vedic';

const here = dirname(fileURLToPath(import.meta.url));

interface SunriseFixture {
  schemaVersion: string;
  status: string;
  source: {
    version: string;
    swetestBinarySha256: string;
    rawManifestSha256: string;
    referenceInputTimeScale: string;
    eventDefinition: string;
    ephemerisMode: string;
  };
  toleranceSeconds: number;
  cases: Array<{
    id: string;
    description: string;
    timezone: string;
    latDeg: number;
    lonEastDeg: number;
    startUtcIso: string;
    sunriseUtcIso: string;
  }>;
}

interface ReferencePeriod {
  lord: string;
  startUtc: string;
  endUtc: string;
}

interface DashaFixture {
  schemaVersion: string;
  status: string;
  source: {
    provider: string;
    version: string;
    license: string;
    dashaYear: string;
    dashaYearDays: number;
    wheelSha256: string;
    sourceArchiveSha256: string;
    de440tSha256: string;
    rawManifestSha256: string;
    sourceBinding: string;
  };
  endpointToleranceMs: number;
  cases: Array<{
    id: string;
    description: string;
    birthUtcIso: string;
    siderealMoonLongitudeDeg: number;
    startLord: string;
    nakshatraProgressFraction: number;
    firstMaha: ReferencePeriod;
    antarCheckpoints: ReferencePeriod[];
    cycleEndUtc: string;
  }>;
}

const sunriseFixture: SunriseFixture = JSON.parse(
  readFileSync(join(here, '..', 'goldens', 'swiss-vedic-sunrise.json'), 'utf8'),
);
const dashaFixture: DashaFixture = JSON.parse(
  readFileSync(join(here, '..', 'goldens', 'ndastro-vimshottari-julian-36525.json'), 'utf8'),
);

function endpointDifferenceMs(actual: string, expected: string): number {
  return Math.abs(Date.parse(actual) - Date.parse(expected));
}

function referenceLord(value: string): string {
  return value === 'KETHU' ? 'Ketu' : `${value.slice(0, 1)}${value.slice(1).toLowerCase()}`;
}

describe('Vedic P3B evidence: Swiss sunrise mapping', () => {
  it('keeps the reviewed, provenance-complete Swiss capture offline and bounded', () => {
    expect(sunriseFixture.schemaVersion).toBe('vedic-sunrise-golden/v1');
    expect(sunriseFixture.status).toBe('populated');
    expect(sunriseFixture.cases).toHaveLength(16);
    expect(sunriseFixture.source.version).toMatch(/^Version:\s*2\.10\.03$/);
    expect(sunriseFixture.source.swetestBinarySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(sunriseFixture.source.rawManifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(sunriseFixture.source.referenceInputTimeScale).toBe('UTC');
    expect(sunriseFixture.source.eventDefinition).toMatch(/upper-limb/i);
    expect(sunriseFixture.source.eventDefinition).toMatch(/-norefrac.*omitted/i);
    expect(sunriseFixture.source.ephemerisMode).toContain('-emos');
    expect(sunriseFixture.toleranceSeconds).toBeGreaterThan(0);
    expect(sunriseFixture.toleranceSeconds).toBeLessThanOrEqual(60);
  });

  it('maps astronomy-engine SearchRiseSet to every Swiss upper-limb sunrise within the reviewed tolerance', () => {
    for (const sample of sunriseFixture.cases) {
      expect(sample.description).toMatch(/synthetic/i);
      const actualUtcMs = nextSunriseUtcMs({
        utcMs: Date.parse(sample.startUtcIso),
        latitudeDeg: sample.latDeg,
        longitudeEastDeg: sample.lonEastDeg,
      });
      expect(actualUtcMs, `${sample.id} should have a sunrise`).not.toBeNull();
      const differenceSeconds = Math.abs(actualUtcMs! - Date.parse(sample.sunriseUtcIso)) / 1000;
      expect(differenceSeconds, `${sample.id} sunrise mapping`).toBeLessThanOrEqual(
        sunriseFixture.toleranceSeconds,
      );
    }
  });

  it('changes Vaara only when crossing the verified local sunrise boundary', () => {
    const sample = sunriseFixture.cases[0]!;
    const sunriseUtcMs = Date.parse(sample.sunriseUtcIso);
    const common = {
      timezone: sample.timezone,
      latitudeDeg: sample.latDeg,
      longitudeEastDeg: sample.lonEastDeg,
    };
    expect(vaaraAtInstant({ ...common, utcMs: sunriseUtcMs - 60_000 })).toBe('Budhavara');
    expect(vaaraAtInstant({ ...common, utcMs: sunriseUtcMs + 60_000 })).toBe('Guruvara');
  });
});

describe('Vedic P3B evidence: NDAstro same-model Vimshottari cross-check', () => {
  it('pins a source-bound MIT reference configured for exactly julian-365.25', () => {
    expect(dashaFixture.schemaVersion).toBe('vedic-vimshottari-reference/v1');
    expect(dashaFixture.status).toBe('populated');
    expect(dashaFixture.cases).toHaveLength(12);
    expect(dashaFixture.source).toMatchObject({
      provider: 'ndastro-engine',
      version: '0.28.1',
      license: 'MIT',
      dashaYear: 'julian-365.25',
      dashaYearDays: 365.25,
    });
    for (const sha of [
      dashaFixture.source.wheelSha256,
      dashaFixture.source.sourceArchiveSha256,
      dashaFixture.source.de440tSha256,
      dashaFixture.source.rawManifestSha256,
    ]) {
      expect(sha).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(dashaFixture.source.sourceBinding).toMatch(/byte-for-byte/i);
  });

  it('matches independent first-Maha balance, Antar checkpoints, and terminal 120-year endpoint', () => {
    for (const sample of dashaFixture.cases) {
      expect(sample.description).toMatch(/synthetic/i);
      const actual = vimshottariFromMoon(
        Date.parse(sample.birthUtcIso),
        sample.siderealMoonLongitudeDeg,
      );
      const firstMaha = actual.mahadashas[0]!;
      expect(firstMaha.lord, `${sample.id} first lord`).toBe(referenceLord(sample.firstMaha.lord));
      expect(actual.nakshatraProgressFraction, `${sample.id} progress`).toBeCloseTo(
        sample.nakshatraProgressFraction,
        7,
      );
      for (const [label, observed, expected] of [
        ['first start', firstMaha.startUtc, sample.firstMaha.startUtc],
        ['first end', firstMaha.endUtc, sample.firstMaha.endUtc],
        ['cycle end', actual.mahadashas.at(-1)!.endUtc, sample.cycleEndUtc],
      ] as const) {
        expect(
          endpointDifferenceMs(observed, expected),
          `${sample.id} ${label}`,
        ).toBeLessThanOrEqual(dashaFixture.endpointToleranceMs);
      }
      const checkpoints = [firstMaha.antar[0]!, firstMaha.antar[4]!, firstMaha.antar[8]!];
      for (const [index, expected] of sample.antarCheckpoints.entries()) {
        const observed = checkpoints[index]!;
        expect(observed.lord, `${sample.id} Antar ${index} lord`).toBe(
          referenceLord(expected.lord),
        );
        expect(endpointDifferenceMs(observed.startUtc, expected.startUtc)).toBeLessThanOrEqual(
          dashaFixture.endpointToleranceMs,
        );
        expect(endpointDifferenceMs(observed.endUtc, expected.endUtc)).toBeLessThanOrEqual(
          dashaFixture.endpointToleranceMs,
        );
      }
    }
  });

  it('keeps Maha and Antar intervals gap-free, ordered, and half-open around birth', () => {
    for (const sample of dashaFixture.cases) {
      const birthUtcMs = Date.parse(sample.birthUtcIso);
      const actual = vimshottariFromMoon(birthUtcMs, sample.siderealMoonLongitudeDeg);
      expect(actual.mahadashas).toHaveLength(9);
      for (const [index, maha] of actual.mahadashas.entries()) {
        expect(Date.parse(maha.startUtc)).toBeLessThan(Date.parse(maha.endUtc));
        expect(maha.antar).toHaveLength(9);
        if (index > 0) expect(maha.startUtc).toBe(actual.mahadashas[index - 1]!.endUtc);
        for (const [antarIndex, antar] of maha.antar.entries()) {
          expect(Date.parse(antar.startUtc)).toBeLessThan(Date.parse(antar.endUtc));
          if (antarIndex > 0) expect(antar.startUtc).toBe(maha.antar[antarIndex - 1]!.endUtc);
        }
        expect(maha.antar[0]!.startUtc).toBe(maha.startUtc);
        expect(maha.antar.at(-1)!.endUtc).toBe(maha.endUtc);
      }
      expect(Date.parse(actual.mahadashas[0]!.startUtc)).toBeLessThanOrEqual(birthUtcMs);
      expect(Date.parse(actual.mahadashas[0]!.endUtc)).toBeGreaterThan(birthUtcMs);
    }
  });
});
