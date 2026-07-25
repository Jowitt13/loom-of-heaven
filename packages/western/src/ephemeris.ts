import { Ecliptic, GeoVector, HelioVector, type Body } from 'astronomy-engine';

/**
 * Ephemeris access for the Western provider. ALL planetary positions come from
 * astronomy-engine (VSOP87 + NOVAS, MIT) — the ADR-designated base that passes the
 * ≤1 arc-minute precision gate. The mean lunar node uses the standard Meeus mean-orbit
 * series. astronomy-engine types never leave this module.
 */

/** The ten natal bodies computed from the ephemeris (Sun…Pluto). */
export const NATAL_BODIES = [
  'Sun',
  'Moon',
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
  'Pluto',
] as const;
export type NatalBody = (typeof NATAL_BODIES)[number];

const MS_PER_DAY = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0); // J2000.0 epoch (noon UTC 2000-01-01)

/** Normalize an angle to [0, 360). */
export function norm360(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Smallest signed angular difference a−b, wrapped into (−180, 180]. */
export function deltaLon(a: number, b: number): number {
  let d = norm360(a) - norm360(b);
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** A function giving a point's ecliptic longitude (degrees) at an epoch-ms instant. */
export type LongitudeFn = (dateMs: number) => number;

export interface PointPlacement {
  longitudeDeg: number;
  latitudeDeg: number;
  speedDegPerDay: number;
  retrograde: boolean;
}

/** Apparent geocentric ecliptic position (tropical, of-date). */
function eclipticPosition(
  body: NatalBody,
  dateMs: number,
): { longitudeDeg: number; latitudeDeg: number } {
  const date = new Date(dateMs);
  const ecl = Ecliptic(GeoVector(body as Body, date, true));
  return { longitudeDeg: norm360(ecl.elon), latitudeDeg: ecl.elat };
}

/** Signed daily motion in longitude via a central difference over ±0.5 day. */
function dailyMotion(
  lonAt: LongitudeFn,
  dateMs: number,
): { speedDegPerDay: number; retrograde: boolean } {
  const half = MS_PER_DAY / 2;
  const speed = deltaLon(lonAt(dateMs + half), lonAt(dateMs - half)); // degrees/day
  return { speedDegPerDay: speed, retrograde: speed < 0 };
}

/** Position + daily motion + retrograde flag for one of the ten natal bodies. */
export function planetPlacement(body: NatalBody, dateMs: number): PointPlacement {
  const lonFn: LongitudeFn = (ms) => eclipticPosition(body, ms).longitudeDeg;
  const { longitudeDeg, latitudeDeg } = eclipticPosition(body, dateMs);
  const { speedDegPerDay, retrograde } = dailyMotion(lonFn, dateMs);
  return { longitudeDeg, latitudeDeg, speedDegPerDay, retrograde };
}

function julianCenturies(dateMs: number): number {
  return (dateMs - J2000_MS) / MS_PER_DAY / 36525;
}

/**
 * Mean ascending lunar node (North Node) longitude, Meeus mean-orbit series
 * (valid for the 1901–2100 support window). The mean node always regresses.
 */
export function meanNorthNodeLongitude(dateMs: number): number {
  const T = julianCenturies(dateMs);
  const omega =
    125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + T ** 3 / 467441 - T ** 4 / 10716000;
  return norm360(omega);
}

/** Mean North Node placement (ecliptic latitude is 0 by definition of the node). */
export function meanNodePlacement(dateMs: number): {
  longitudeDeg: number;
  speedDegPerDay: number;
  retrograde: boolean;
} {
  const { speedDegPerDay, retrograde } = dailyMotion(meanNorthNodeLongitude, dateMs);
  return { longitudeDeg: meanNorthNodeLongitude(dateMs), speedDegPerDay, retrograde };
}

// ---------------------------------------------------------------------------
// True lunar node (approximate): the ascending node of the Moon's OSCULATING
// orbit. astronomy-engine has no direct true-node function, so we take the Moon's
// geocentric ecliptic-of-date position + velocity (central difference), form the
// orbital angular momentum h = r x v, and read the node line n = zhat x h. This is
// the standard osculating construction; accuracy is arc-minute level, well within
// sign/house needs, and is marked precision:'approximate'.
// ---------------------------------------------------------------------------

function moonEclipticVec(dateMs: number): { x: number; y: number; z: number } {
  const ecl = Ecliptic(GeoVector('Moon' as Body, new Date(dateMs), false));
  return { x: ecl.vec.x, y: ecl.vec.y, z: ecl.vec.z };
}

/** True (osculating) ascending-node ecliptic longitude of the Moon, of-date. */
export function trueNorthNodeLongitude(dateMs: number): number {
  const h = MS_PER_DAY / 2;
  const rMinus = moonEclipticVec(dateMs - h);
  const rPlus = moonEclipticVec(dateMs + h);
  const r = moonEclipticVec(dateMs);
  // Velocity by central difference (units cancel in the cross products below).
  const v = { x: rPlus.x - rMinus.x, y: rPlus.y - rMinus.y, z: rPlus.z - rMinus.z };
  // Angular momentum h = r x v (only the x,y components feed the node line).
  const hx = r.y * v.z - r.z * v.y;
  const hy = r.z * v.x - r.x * v.z;
  // Node line n = zhat x h = (-hy, hx, 0); ascending-node longitude = atan2(n_y, n_x).
  return norm360((Math.atan2(hx, -hy) * 180) / Math.PI);
}

/** True North Node placement (latitude 0 by definition). */
export function trueNodePlacement(dateMs: number): {
  longitudeDeg: number;
  speedDegPerDay: number;
  retrograde: boolean;
} {
  const { speedDegPerDay, retrograde } = dailyMotion(trueNorthNodeLongitude, dateMs);
  return { longitudeDeg: trueNorthNodeLongitude(dateMs), speedDegPerDay, retrograde };
}

// ---------------------------------------------------------------------------
// Asteroids (approximate): Chiron, Ceres, Pallas, Juno, Vesta via Keplerian
// propagation of published J2000 osculating elements (public factual orbital data)
// against astronomy-engine's heliocentric Earth. No ephemeris data files, MIT-clean.
// Precision is arc-minute-to-sub-degree for the main belt and coarser for Chiron
// (chaotic orbit); all are marked precision:'approximate' and are NOT ≤1' gated.
// The Kepler pipeline itself is regression-tested against a major planet.
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;
const OBLIQUITY_J2000 = 23.4392911; // degrees
const PRECESSION_DEG_PER_CENTURY = 1.396971; // general precession in ecliptic longitude

/** Osculating elements at epoch J2000 (JD 2451545.0). Angles in degrees, a in AU. */
export interface OrbitalElements {
  a: number; // semi-major axis (AU)
  e: number; // eccentricity
  i: number; // inclination to ecliptic
  node: number; // longitude of ascending node (Ω)
  peri: number; // argument of perihelion (ω)
  m0: number; // mean anomaly at epoch
}

export const ASTEROID_BODIES = ['Chiron', 'Ceres', 'Pallas', 'Juno', 'Vesta'] as const;
export type AsteroidBody = (typeof ASTEROID_BODIES)[number];

/** J2000 osculating elements (public JPL small-body data; approximate, ω/M convention). */
const ASTEROID_ELEMENTS: Record<AsteroidBody, OrbitalElements> = {
  Ceres: { a: 2.76607, e: 0.07913, i: 10.5832, node: 80.3932, peri: 72.5898, m0: 113.4104 },
  Pallas: { a: 2.77236, e: 0.23127, i: 34.841, node: 173.0904, peri: 309.9057, m0: 59.7825 },
  Juno: { a: 2.66869, e: 0.25785, i: 12.9897, node: 169.9192, peri: 247.8285, m0: 32.087 },
  Vesta: { a: 2.36179, e: 0.08872, i: 7.14, node: 103.8513, peri: 150.7267, m0: 48.3122 },
  Chiron: { a: 13.7092, e: 0.38312, i: 6.9354, node: 209.3776, peri: 339.4295, m0: 8.641 },
};

function jdFromMs(dateMs: number): number {
  return dateMs / MS_PER_DAY + 2440587.5;
}

/** Solve Kepler's equation E - e sinE = M (radians) by Newton iteration. */
function solveKepler(mRad: number, e: number): number {
  let E = e < 0.8 ? mRad : Math.PI;
  for (let k = 0; k < 64; k++) {
    const d = (E - e * Math.sin(E) - mRad) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

/** Heliocentric ecliptic-J2000 rectangular position (AU) from elements at dateMs. */
function heliocentricEcliptic(
  el: OrbitalElements,
  dateMs: number,
): { x: number; y: number; z: number } {
  const n = 0.9856076686 / (el.a * Math.sqrt(el.a)); // deg/day (Gaussian)
  const days = jdFromMs(dateMs) - 2451545.0;
  const M = ((el.m0 + n * days) % 360) * DEG;
  const E = solveKepler(M, el.e);
  const xv = el.a * (Math.cos(E) - el.e);
  const yv = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const nu = Math.atan2(yv, xv);
  const r = Math.hypot(xv, yv);
  const o = el.node * DEG;
  const w = el.peri * DEG;
  const i = el.i * DEG;
  const u = w + nu;
  return {
    x: r * (Math.cos(o) * Math.cos(u) - Math.sin(o) * Math.sin(u) * Math.cos(i)),
    y: r * (Math.sin(o) * Math.cos(u) + Math.cos(o) * Math.sin(u) * Math.cos(i)),
    z: r * (Math.sin(u) * Math.sin(i)),
  };
}

/** Earth heliocentric position rotated from EQJ into ecliptic-J2000 (AU). */
function earthEclipticJ2000(dateMs: number): { x: number; y: number; z: number } {
  const v = HelioVector('Earth' as Body, new Date(dateMs));
  const eps = OBLIQUITY_J2000 * DEG;
  return {
    x: v.x,
    y: v.y * Math.cos(eps) + v.z * Math.sin(eps),
    z: -v.y * Math.sin(eps) + v.z * Math.cos(eps),
  };
}

function asteroidLonLat(
  body: AsteroidBody,
  dateMs: number,
): { longitudeDeg: number; latitudeDeg: number } {
  const helio = heliocentricEcliptic(ASTEROID_ELEMENTS[body], dateMs);
  const earth = earthEclipticJ2000(dateMs);
  const gx = helio.x - earth.x;
  const gy = helio.y - earth.y;
  const gz = helio.z - earth.z;
  const lonJ2000 = (Math.atan2(gy, gx) * 180) / Math.PI;
  const T = julianCenturies(dateMs);
  const lon = norm360(lonJ2000 + PRECESSION_DEG_PER_CENTURY * T); // precess to of-date
  const lat = (Math.atan2(gz, Math.hypot(gx, gy)) * 180) / Math.PI;
  return { longitudeDeg: lon, latitudeDeg: lat };
}

/** Position + daily motion + retrograde flag for an asteroid (approximate). */
export function asteroidPlacement(body: AsteroidBody, dateMs: number): PointPlacement {
  const lonFn: LongitudeFn = (ms) => asteroidLonLat(body, ms).longitudeDeg;
  const { longitudeDeg, latitudeDeg } = asteroidLonLat(body, dateMs);
  const { speedDegPerDay, retrograde } = dailyMotion(lonFn, dateMs);
  return { longitudeDeg, latitudeDeg, speedDegPerDay, retrograde };
}
