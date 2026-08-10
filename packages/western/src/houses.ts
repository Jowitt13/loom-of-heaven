import { MakeTime, SiderealTime, e_tilt } from 'astronomy-engine';
import { ERROR_CODES, EngineError } from '@loom/contracts';
import { norm360 } from './ephemeris.ts';

/**
 * House-cusp and chart-angle calculation. astronomy-engine supplies only the
 * primitives (apparent sidereal time, mean obliquity); the MC / Ascendant / house
 * division itself is implemented here. Quadrant systems (Placidus, Koch, Porphyry)
 * divide semi-arcs and FAIL at high latitude (circumpolar ecliptic) — that raises
 * HOUSE_SYSTEM_UNAVAILABLE rather than silently switching systems (handoff §5.1).
 */

export type HouseSystemId = 'placidus' | 'whole-sign' | 'equal' | 'koch' | 'porphyry';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const sinD = (d: number): number => Math.sin(d * DEG);
const cosD = (d: number): number => Math.cos(d * DEG);
const tanD = (d: number): number => Math.tan(d * DEG);
const asinD = (x: number): number => Math.asin(clamp(x, -1, 1)) * RAD;
const acosD = (x: number): number => Math.acos(clamp(x, -1, 1)) * RAD;
const atan2D = (y: number, x: number): number => norm360(Math.atan2(y, x) * RAD);

export interface HouseCusps {
  /** Twelve cusp longitudes (degrees); index 0 is house 1 … index 11 is house 12. */
  cusps: number[];
  ascendant: number;
  mc: number;
  descendant: number;
  ic: number;
}

/** Mean obliquity of the ecliptic at the instant (degrees). */
export function meanObliquityDeg(dateMs: number): number {
  return e_tilt(MakeTime(new Date(dateMs))).mobl;
}

/** Right Ascension of the Midheaven (degrees) from sidereal time + east longitude. */
export function ramcDeg(dateMs: number, longitudeEastDeg: number): number {
  const gastHours = SiderealTime(new Date(dateMs)); // Greenwich apparent sidereal time [0,24)
  return norm360(gastHours * 15 + longitudeEastDeg);
}

/** MC (10th-house) ecliptic longitude: the ecliptic point whose right ascension is RAMC. */
export function mcLongitude(ramc: number, eps: number): number {
  return atan2D(sinD(ramc), cosD(ramc) * cosD(eps));
}

/** Ascendant (1st-house) ecliptic longitude from RAMC, latitude and obliquity. */
export function ascendantLongitude(ramc: number, latDeg: number, eps: number): number {
  return atan2D(cosD(ramc), -(sinD(ramc) * cosD(eps) + tanD(latDeg) * sinD(eps)));
}

/** Ecliptic declination of a point at ecliptic longitude lambda (degrees). */
function declinationOf(lambdaDeg: number, eps: number): number {
  return asinD(sinD(eps) * sinD(lambdaDeg));
}

/** Semi-diurnal arc (degrees of hour angle) for a declination at a latitude. */
function semiDiurnalArc(declDeg: number, latDeg: number): number {
  const x = -tanD(latDeg) * tanD(declDeg);
  if (Math.abs(x) > 1) {
    throw new EngineError(
      ERROR_CODES.HOUSE_SYSTEM_UNAVAILABLE,
      'Quadrant house system is undefined at this latitude (circumpolar ecliptic point).',
      { latitudeDeg: latDeg },
    );
  }
  return acosD(x);
}

/** Ecliptic longitude of a point on the ecliptic whose right ascension is `ra`. */
function raToLambda(ra: number, eps: number): number {
  return atan2D(sinD(ra), cosD(ra) * cosD(eps));
}

/** Angular distance going forward (zodiacal order) from a to b, in [0, 360). */
function forwardArc(a: number, b: number): number {
  return norm360(b - a);
}

/** Compute the four angles plus the requested house system. */
export function computeHouseCusps(
  system: HouseSystemId,
  dateMs: number,
  latDeg: number,
  lonEastDeg: number,
): HouseCusps {
  const eps = meanObliquityDeg(dateMs);
  const ramc = ramcDeg(dateMs, lonEastDeg);
  const mc = mcLongitude(ramc, eps);
  const ascendant = ascendantLongitude(ramc, latDeg, eps);
  const descendant = norm360(ascendant + 180);
  const ic = norm360(mc + 180);

  const cusps = new Array<number>(12);
  cusps[0] = ascendant; // house 1
  cusps[3] = ic; // house 4
  cusps[6] = descendant; // house 7
  cusps[9] = mc; // house 10

  switch (system) {
    case 'whole-sign': {
      const signStart = Math.floor(ascendant / 30) * 30;
      for (let i = 0; i < 12; i++) cusps[i] = norm360(signStart + i * 30);
      break;
    }
    case 'equal': {
      for (let i = 0; i < 12; i++) cusps[i] = norm360(ascendant + i * 30);
      break;
    }
    case 'porphyry': {
      const arcMcAsc = forwardArc(mc, ascendant);
      const arcAscIc = forwardArc(ascendant, ic);
      cusps[10] = norm360(mc + arcMcAsc / 3); // house 11
      cusps[11] = norm360(mc + (2 * arcMcAsc) / 3); // house 12
      cusps[1] = norm360(ascendant + arcAscIc / 3); // house 2
      cusps[2] = norm360(ascendant + (2 * arcAscIc) / 3); // house 3
      break;
    }
    case 'koch': {
      // Koch (GOH / "Birthplace") houses — independent derivation, no Swiss
      // Ephemeris code used or consulted (Swiss serves only as an external
      // numeric acceptance oracle via the tracked golden fixture).
      //
      // Definition (Koch & Schäck, "Häusertabellen des Geburtsortes", 1971;
      // described in swisseph.pdf §house systems and Holden, "The Elements of
      // House Division"): the MC ecliptic degree needed SDA degrees of
      // sidereal time (its own semi-diurnal arc) to travel from the eastern
      // horizon to the meridian. Trisecting that TIME interval, the
      // intermediate cusps are the ASCENDANTS at the shifted sidereal times:
      //   cusp 11 = Asc(RAMC − 2·SDA/3)   cusp 12 = Asc(RAMC − SDA/3)
      //   cusp  2 = Asc(RAMC + SDA/3)     cusp  3 = Asc(RAMC + 2·SDA/3)
      // with SDA = acos(−tan φ · tan δ_MC) and δ_MC = asin(sin ε · sin λ_MC)
      // (standard spherical-astronomy formulas). Endpoint self-consistency:
      // Asc(RAMC − SDA) = λ_MC (the MC degree was rising) and
      // Asc(RAMC + SDA) = λ_IC (the IC degree rises as the MC degree sets),
      // so the trisection interpolates exactly between the four angles.
      //
      // The system is geometrically undefined when the MC degree is
      // circumpolar (|tan φ · tan δ_MC| > 1, beyond the polar circles);
      // semiDiurnalArc then raises HOUSE_SYSTEM_UNAVAILABLE — no silent
      // fallback. Known limitation: this engine uses the MEAN obliquity
      // (e_tilt().mobl) while the reference uses the true obliquity, leaving
      // a sub-arcminute residual of the same order as Placidus (~0.3').
      const declMc = declinationOf(mc, eps);
      const sda = semiDiurnalArc(declMc, latDeg);
      cusps[10] = ascendantLongitude(norm360(ramc - (2 * sda) / 3), latDeg, eps); // house 11
      cusps[11] = ascendantLongitude(norm360(ramc - sda / 3), latDeg, eps); // house 12
      cusps[1] = ascendantLongitude(norm360(ramc + sda / 3), latDeg, eps); // house 2
      cusps[2] = ascendantLongitude(norm360(ramc + (2 * sda) / 3), latDeg, eps); // house 3
      break;
    }
    case 'placidus': {
      // Each cusp trisects ITS OWN semi-arc, which depends on its declination, so we
      // solve a fixed point per cusp (the classic Placidus iteration).
      cusps[10] = placidusCusp(1 / 3, false, ramc, latDeg, eps); // house 11
      cusps[11] = placidusCusp(2 / 3, false, ramc, latDeg, eps); // house 12
      cusps[1] = placidusCusp(1 / 3, true, ramc, latDeg, eps); // house 2
      cusps[2] = placidusCusp(2 / 3, true, ramc, latDeg, eps); // house 3
      break;
    }
  }

  // Opposite cusps are always 180° apart (houses 5,6,8,9 derive from 11,12,2,3).
  cusps[4] = norm360(cusps[10]! + 180); // house 5 = house 11 + 180
  cusps[5] = norm360(cusps[11]! + 180); // house 6 = house 12 + 180
  cusps[7] = norm360(cusps[1]! + 180); // house 8 = house 2 + 180
  cusps[8] = norm360(cusps[2]! + 180); // house 9 = house 3 + 180

  return { cusps, ascendant, mc, descendant, ic };
}

/** One Placidus cusp: the ecliptic point that trisects its own diurnal/nocturnal semi-arc. */
function placidusCusp(
  fraction: number,
  nocturnal: boolean,
  ramc: number,
  latDeg: number,
  eps: number,
): number {
  // Initial RA guess: the equatorial (equal-arc) approximation.
  let ra = nocturnal ? ramc + 90 + fraction * 90 : ramc + fraction * 90;
  for (let i = 0; i < 64; i++) {
    const lambda = raToLambda(ra, eps);
    const decl = declinationOf(lambda, eps);
    const sda = semiDiurnalArc(decl, latDeg);
    const sna = 180 - sda;
    const target = nocturnal ? ramc + sda + fraction * sna : ramc + fraction * sda;
    if (Math.abs(target - ra) < 1e-7) return raToLambda(target, eps);
    ra = target;
  }
  return raToLambda(ra, eps);
}

/** Which house (1-12) an ecliptic longitude falls in, given the twelve cusps. */
export function houseOfLongitude(cusps: number[], longitudeDeg: number): number {
  for (let i = 0; i < 12; i++) {
    const start = cusps[i]!;
    const end = cusps[(i + 1) % 12]!;
    if (forwardArc(start, longitudeDeg) < forwardArc(start, end)) return i + 1;
  }
  return 1; // unreachable for a well-formed cusp set
}
