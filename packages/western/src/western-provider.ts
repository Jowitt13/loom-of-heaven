import { WARNING_CODES, makeWarning } from '@ming/contracts';
import type {
  EngineWarning,
  NormalizedBirthData,
  ProviderRef,
  WesternAngle,
  WesternChartResult,
  WesternHouse,
  WesternPlanet,
  WesternSettings,
} from '@ming/contracts';
import {
  ASTEROID_BODIES,
  NATAL_BODIES,
  asteroidPlacement,
  meanNodePlacement,
  norm360,
  planetPlacement,
  trueNodePlacement,
  type PointPlacement,
} from './ephemeris.ts';
import { ayanamshaDegrees, dignityOf, signFromLongitude } from './zodiac.ts';
import { computeHouseCusps, houseOfLongitude } from './houses.ts';
import { computeAspects, type AspectPoint } from './aspects.ts';

/** Pinned astronomy-engine version (authoritative record is sbom.cdx.json, regenerated at build). */
export const ASTRONOMY_ENGINE_VERSION = '2.1.19';
const PROVIDER: ProviderRef = {
  id: 'astronomy-engine',
  version: ASTRONOMY_ENGINE_VERSION,
  license: 'MIT',
};
const EPHEMERIS_SOURCE = 'astronomy-engine/VSOP87+NOVAS';

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Compute the Western natal chart from the normalized UTC instant + coordinates.
 * Sun–Pluto come from astronomy-engine (VSOP87 + NOVAS, ≤1′ wrapper-consistency gate); the true node and the five
 * asteroids are self-computed and marked precision:'approximate'. Sidereal charts shift
 * every displayed longitude by the ayanamsha (house membership is shift-invariant, so it
 * is decided on the tropical longitudes). Unknown birth time still places planets by date
 * but fabricates no ascendant/houses (handoff §7.2).
 */
export function computeWestern(
  normalized: NormalizedBirthData,
  settings: WesternSettings,
): { result: WesternChartResult | null; warnings: EngineWarning[] } {
  const warnings: EngineWarning[] = [];
  const dateMs = normalized.utcInstantMs;
  const latitude = normalized.location.latitude;
  const longitudeEast = normalized.location.longitude;

  // Sidereal: subtract the ayanamsha from every displayed longitude. Tropical: 0.
  const sidereal = settings.zodiac === 'sidereal';
  const aya = sidereal ? ayanamshaDegrees(settings.ayanamsha, dateMs) : 0;
  const proj = (tropicalLon: number): number => norm360(tropicalLon - aya);
  if (sidereal) {
    warnings.push(
      makeWarning(
        WARNING_CODES.SOLAR_TIME_APPROXIMATE,
        'western',
        `Sidereal zodiac applied via the ${settings.ayanamsha} ayanamsha (${aya.toFixed(3)}° at this date, linear model).`,
        { severity: 'info', detail: { ayanamsha: settings.ayanamsha, degrees: round6(aya) } },
      ),
    );
  }

  const angleFrom = (tropicalLon: number): WesternAngle => {
    const lon = proj(tropicalLon);
    return { longitudeDeg: round6(lon), sign: signFromLongitude(lon).sign };
  };

  // Angles + house cusps require a known birth time. House membership is computed on the
  // TROPICAL longitudes (a uniform sidereal shift does not change which house a point is in).
  let cusps: number[] | null = null;
  let angles: WesternChartResult['angles'] = null;
  if (normalized.timeKnown) {
    const house = computeHouseCusps(settings.houseSystem, dateMs, latitude, longitudeEast);
    cusps = house.cusps;
    angles = {
      ascendant: angleFrom(house.ascendant),
      mc: angleFrom(house.mc),
      descendant: angleFrom(house.descendant),
      ic: angleFrom(house.ic),
    };
    if (
      settings.houseSystem !== 'whole-sign' &&
      settings.houseSystem !== 'equal' &&
      Math.abs(latitude) > 60
    ) {
      warnings.push(
        makeWarning(
          WARNING_CODES.HIGH_LATITUDE_HOUSE_RISK,
          'western',
          `Latitude ${latitude} is high; the quadrant house system "${settings.houseSystem}" may be unstable.`,
          { severity: 'info', detail: { latitudeDeg: latitude } },
        ),
      );
    }
  }

  const planets: WesternPlanet[] = [];
  const aspectPoints: AspectPoint[] = [];

  /** Build a WesternPlanet from a tropical placement (house on tropical, display on proj). */
  const makePlanet = (
    body: string,
    p: PointPlacement,
    precision: 'high' | 'approximate',
    source: string,
    forAspects: boolean,
  ): void => {
    const displayLon = proj(p.longitudeDeg);
    const { sign, signDeg } = signFromLongitude(displayLon);
    const houseIndex = cusps ? houseOfLongitude(cusps, p.longitudeDeg) : null;
    const dignity = dignityOf(body, sign);
    const planet: WesternPlanet = {
      body,
      longitudeDeg: round6(displayLon),
      latitudeDeg: round6(p.latitudeDeg),
      speedDegPerDay: round6(p.speedDegPerDay),
      retrograde: p.retrograde,
      sign,
      signDeg: round6(signDeg),
      house: houseIndex,
      precision,
      source,
    };
    if (dignity !== undefined) planet.dignity = dignity;
    planets.push(planet);
    // Aspects are computed on tropical longitudes (separations are shift-invariant).
    if (forAspects) {
      aspectPoints.push({ body, longitudeDeg: p.longitudeDeg, speedDegPerDay: p.speedDegPerDay });
    }
  };

  // Planets (Sun…Pluto) — astronomy-engine (VSOP87 + NOVAS), high precision, feed aspects.
  for (const body of NATAL_BODIES) {
    makePlanet(body, planetPlacement(body, dateMs), 'high', EPHEMERIS_SOURCE, true);
  }

  // Lunar nodes: true (osculating) or mean, per settings. South Node = North + 180°.
  const node = settings.nodes === 'true' ? trueNodePlacement(dateMs) : meanNodePlacement(dateMs);
  const nodeSource = settings.nodes === 'true' ? 'osculating-node' : 'meeus-mean-node';
  makePlanet(
    'NorthNode',
    {
      longitudeDeg: norm360(node.longitudeDeg),
      latitudeDeg: 0,
      speedDegPerDay: node.speedDegPerDay,
      retrograde: node.retrograde,
    },
    'approximate',
    nodeSource,
    false,
  );
  makePlanet(
    'SouthNode',
    {
      longitudeDeg: norm360(node.longitudeDeg + 180),
      latitudeDeg: 0,
      speedDegPerDay: node.speedDegPerDay,
      retrograde: node.retrograde,
    },
    'approximate',
    nodeSource,
    false,
  );
  warnings.push(
    makeWarning(
      WARNING_CODES.SOLAR_TIME_APPROXIMATE,
      'western',
      settings.nodes === 'true'
        ? 'Lunar nodes use the true (osculating) node — self-computed, approximate (~arc-minutes).'
        : 'Lunar nodes use the mean orbit (Meeus series).',
      { severity: 'info' },
    ),
  );

  // Asteroids (approximate, element-based) — optional.
  if (settings.asteroids) {
    for (const body of ASTEROID_BODIES) {
      makePlanet(
        body,
        asteroidPlacement(body, dateMs),
        'approximate',
        'osculating-elements',
        false,
      );
    }
    warnings.push(
      makeWarning(
        WARNING_CODES.SOLAR_TIME_APPROXIMATE,
        'western',
        'Asteroids (Chiron/Ceres/Pallas/Juno/Vesta) use Keplerian osculating elements: approximate (sub-degree; Chiron coarser), not part of the ≤1′ gate.',
        { severity: 'info' },
      ),
    );
  }

  const houses: WesternHouse[] = cusps
    ? cusps.map((cusp, i) => {
        const lon = proj(cusp);
        return { index: i + 1, cuspLongitudeDeg: round6(lon), sign: signFromLongitude(lon).sign };
      })
    : [];

  const aspects = computeAspects(aspectPoints);

  const result: WesternChartResult = {
    rulesetId: settings.rulesetId,
    provider: PROVIDER,
    zodiac: settings.zodiac,
    ayanamsha: sidereal ? settings.ayanamsha : null,
    ayanamshaDegrees: sidereal ? round6(aya) : null,
    houseSystem: settings.houseSystem,
    nodes: settings.nodes,
    planets,
    houses,
    angles,
    aspects,
  };
  return { result, warnings };
}
