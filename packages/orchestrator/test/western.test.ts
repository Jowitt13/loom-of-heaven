// Synthetic fixture — fictional data only; not a real person.
import { describe, expect, it } from 'vitest';
import { canonicalJson, parseBirthInput } from '@loom/contracts';
import type { BirthInputRaw } from '@loom/contracts';
import { calculate, compareProfiles } from '@loom/orchestrator';

const FIXED = Date.parse('2026-01-01T00:00:00Z');

const base: BirthInputRaw = {
  calendar: 'gregorian',
  localDate: '1990-03-10',
  localTime: '08:15:00',
  timeAccuracy: 'exact',
  timezone: 'Asia/Shanghai',
  location: { latitude: 30.5, longitude: 114.3, source: 'user' },
  ruleGender: 'male',
  settings: { systems: ['western'] },
};

function calc(overrides: Partial<BirthInputRaw> = {}) {
  return calculate(parseBirthInput({ ...base, ...overrides }), { now: FIXED });
}

describe('Western natal chart (astronomy-engine provider)', () => {
  it('computes a full chart: 17 points, 12 houses, angles and aspects for a known time', () => {
    const w = calc().western!;
    expect(w).toBeDefined();
    expect(w.provider.id).toBe('astronomy-engine');
    // Sun…Pluto (10) + North/South Node (2) + 5 asteroids = 17 by default.
    expect(w.planets).toHaveLength(17);
    expect(w.houses).toHaveLength(12);
    expect(w.angles).not.toBeNull();
    expect(w.angles!.ascendant.sign).toBeDefined();
    expect(Array.isArray(w.aspects)).toBe(true);
    for (const p of w.planets) expect(p.house).not.toBeNull();
    // Sun–Pluto are astronomy-engine (VSOP87+NOVAS, high precision); nodes/asteroids are approximate.
    expect(w.planets.find((p) => p.body === 'Sun')!.precision).toBe('high');
    expect(w.planets.find((p) => p.body === 'Chiron')!.precision).toBe('approximate');
    expect(w.planets.find((p) => p.body === 'NorthNode')!.precision).toBe('approximate');
  });

  it('places the Sun in Pisces on 1990-03-10 (sign classification)', () => {
    const sun = calc().western!.planets.find((p) => p.body === 'Sun')!;
    expect(sun.sign).toBe('Pisces');
    expect(sun.signDeg).toBeGreaterThan(0);
    expect(sun.signDeg).toBeLessThan(30);
  });

  it('assigns essential dignities (Saturn in Capricorn = domicile)', () => {
    const saturn = calc().western!.planets.find((p) => p.body === 'Saturn')!;
    expect(saturn.dignity).toBe('domicile');
  });

  it('records astronomy-engine + the western ruleset in provenance', () => {
    const bundle = calc();
    expect(bundle.provenance.providers.some((p) => p.id === 'astronomy-engine')).toBe(true);
    expect(bundle.provenance.rulesets.some((r) => r.id === 'western-tropical-placidus')).toBe(true);
  });

  it('is deterministic (byte-identical western across runs)', () => {
    expect(canonicalJson(calc().western)).toBe(canonicalJson(calc().western));
  });

  it('unknown birth time: planets computed but no ascendant/houses fabricated', () => {
    const w = calc({ timeAccuracy: 'unknown', localTime: undefined }).western!;
    expect(w).toBeDefined();
    expect(w.angles).toBeNull();
    expect(w.houses).toHaveLength(0);
    expect(w.planets.length).toBeGreaterThan(0);
    for (const p of w.planets) expect(p.house).toBeNull();
    // Planet positions by date are still valid: the Sun stays in Pisces.
    expect(w.planets.find((p) => p.body === 'Sun')!.sign).toBe('Pisces');
  });

  it('sidereal zodiac is applied via the ayanamsha (Sun shifts back ~24°, not silent)', () => {
    const trop = calc().western!;
    const sid = calc({
      settings: { systems: ['western'], western: { zodiac: 'sidereal' } },
    }).western!;
    expect(sid.zodiac).toBe('sidereal');
    expect(sid.ayanamsha).toBe('lahiri');
    expect(sid.ayanamshaDegrees).toBeGreaterThan(20);
    expect(sid.ayanamshaDegrees).toBeLessThan(30);
    // Sidereal Sun longitude = tropical - ayanamsha (wrap-aware), ~23-24° earlier.
    const tSun = trop.planets.find((p) => p.body === 'Sun')!.longitudeDeg;
    const sSun = sid.planets.find((p) => p.body === 'Sun')!.longitudeDeg;
    let d = tSun - sSun;
    if (d < 0) d += 360;
    expect(d).toBeCloseTo(sid.ayanamshaDegrees!, 3);
  });

  it('true vs mean node give close but distinct longitudes (within ~1.5°)', () => {
    const meanW = calc({ settings: { systems: ['western'], western: { nodes: 'mean' } } }).western!;
    const trueW = calc({ settings: { systems: ['western'], western: { nodes: 'true' } } }).western!;
    const mn = meanW.planets.find((p) => p.body === 'NorthNode')!.longitudeDeg;
    const tn = trueW.planets.find((p) => p.body === 'NorthNode')!.longitudeDeg;
    let d = Math.abs(mn - tn);
    if (d > 180) d = 360 - d;
    expect(d).toBeLessThan(1.7); // true node oscillates around the mean node
    expect(trueW.nodes).toBe('true');
  });

  it('asteroids can be disabled, dropping to 12 points', () => {
    const w = calc({ settings: { systems: ['western'], western: { asteroids: false } } }).western!;
    expect(w.planets).toHaveLength(12);
    expect(w.planets.some((p) => p.body === 'Chiron')).toBe(false);
  });

  it('compare: whole-sign profile yields a different house system than default placidus', () => {
    const result = compareProfiles(parseBirthInput(base), ['default', 'whole-sign'], {
      now: FIXED,
    });
    const def = result.profiles.find((p) => p.profile === 'default')!.bundle.western!;
    const ws = result.profiles.find((p) => p.profile === 'whole-sign')!.bundle.western!;
    expect(def.houseSystem).toBe('placidus');
    expect(ws.houseSystem).toBe('whole-sign');
    // Normalized time is rule-invariant, but the houses now genuinely differ.
    expect(canonicalJson(def.houses)).not.toBe(canonicalJson(ws.houses));
  });
});
