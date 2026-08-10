import type { BirthInputRaw, ErrorCode } from '@loom/contracts';

/**
 * Sourced time & location boundary fixtures (handoff §9.1). Expectations are
 * grounded in independently-known facts — documented IANA DST transition dates,
 * standard UTC offsets, and plain wall<->UTC arithmetic — NOT engine snapshots.
 * Each fixture records why its expectation is trustworthy.
 */

export interface FixtureExpectOk {
  kind: 'ok';
  utcInstant?: string;
  offsetEastMinutes?: number;
  ambiguityStatus?: 'unambiguous' | 'ambiguous-resolved' | 'not-applicable-unknown-time';
  candidateCount?: number;
  timeKnown?: boolean;
  longitudeOffsetMinutes?: number;
  warningsInclude?: string[];
}

export interface FixtureExpectError {
  kind: 'error';
  code: ErrorCode;
}

export interface TimeLocationFixture {
  id: string;
  description: string;
  source: string;
  input: BirthInputRaw;
  expect: FixtureExpectOk | FixtureExpectError;
}

const user = 'user' as const;

export const timeLocationFixtures: TimeLocationFixture[] = [
  // --- Standard offsets (IANA ground truth) + hand-verifiable wall->UTC ---
  {
    id: 'shanghai-standard-1995',
    description: 'Asia/Shanghai after DST abolition (1991+) is a fixed UTC+8.',
    source: 'IANA tz: China has observed no DST since 1991.',
    input: {
      calendar: 'gregorian',
      localDate: '1995-06-15',
      localTime: '12:00:00',
      timeAccuracy: 'exact',
      timezone: 'Asia/Shanghai',
      location: { latitude: 31.23, longitude: 121.47, source: user },
    },
    expect: {
      kind: 'ok',
      utcInstant: '1995-06-15T04:00:00Z',
      offsetEastMinutes: 480,
      ambiguityStatus: 'unambiguous',
      candidateCount: 1,
    },
  },
  {
    id: 'kolkata-half-hour-offset',
    description: 'Asia/Kolkata is UTC+5:30 (330 min).',
    source: 'IANA tz: India Standard Time = +05:30, no DST since 1945.',
    input: {
      calendar: 'gregorian',
      localDate: '2000-01-01',
      localTime: '12:00:00',
      timeAccuracy: 'exact',
      timezone: 'Asia/Kolkata',
      location: { latitude: 22.57, longitude: 88.36, source: user },
    },
    expect: { kind: 'ok', utcInstant: '2000-01-01T06:30:00Z', offsetEastMinutes: 330 },
  },
  {
    id: 'kathmandu-45-min-offset',
    description: 'Asia/Kathmandu is UTC+5:45 (345 min).',
    source: 'IANA tz: Nepal Time = +05:45.',
    input: {
      calendar: 'gregorian',
      localDate: '2000-01-01',
      localTime: '12:00:00',
      timeAccuracy: 'exact',
      timezone: 'Asia/Kathmandu',
      location: { latitude: 27.71, longitude: 85.32, source: user },
    },
    expect: { kind: 'ok', utcInstant: '2000-01-01T06:15:00Z', offsetEastMinutes: 345 },
  },
  {
    id: 'eucla-8h45-offset',
    description: 'Australia/Eucla is UTC+8:45 (525 min), no DST.',
    source: 'IANA tz: Eucla = +08:45.',
    input: {
      calendar: 'gregorian',
      localDate: '2000-06-01',
      localTime: '12:00:00',
      timeAccuracy: 'exact',
      timezone: 'Australia/Eucla',
      location: { latitude: -31.68, longitude: 128.89, source: user },
    },
    expect: { kind: 'ok', utcInstant: '2000-06-01T03:15:00Z', offsetEastMinutes: 525 },
  },
  {
    id: 'yangon-6h30-offset',
    description: 'Asia/Yangon is UTC+6:30 (390 min).',
    source: 'IANA tz: Myanmar Time = +06:30.',
    input: {
      calendar: 'gregorian',
      localDate: '2000-01-01',
      localTime: '12:00:00',
      timeAccuracy: 'exact',
      timezone: 'Asia/Yangon',
      location: { latitude: 16.87, longitude: 96.2, source: user },
    },
    expect: { kind: 'ok', utcInstant: '2000-01-01T05:30:00Z', offsetEastMinutes: 390 },
  },
  {
    id: 'kiritimati-plus14-dateline',
    description: 'Pacific/Kiritimati is UTC+14; local noon is the previous UTC day.',
    source: 'IANA tz: Line Islands = +14:00 (furthest-forward zone).',
    input: {
      calendar: 'gregorian',
      localDate: '2000-06-01',
      localTime: '12:00:00',
      timeAccuracy: 'exact',
      timezone: 'Pacific/Kiritimati',
      location: { latitude: 1.87, longitude: -157.4, source: user },
    },
    expect: { kind: 'ok', utcInstant: '2000-05-31T22:00:00Z', offsetEastMinutes: 840 },
  },
  {
    id: 'ny-est-winter',
    description: 'America/New_York in January is EST (UTC-5).',
    source: 'IANA tz: US Eastern standard = -05:00 in winter.',
    input: {
      calendar: 'gregorian',
      localDate: '2020-01-15',
      localTime: '12:00:00',
      timeAccuracy: 'exact',
      timezone: 'America/New_York',
      location: { latitude: 40.71, longitude: -74.01, source: user },
    },
    expect: { kind: 'ok', utcInstant: '2020-01-15T17:00:00Z', offsetEastMinutes: -300 },
  },
  {
    id: 'la-pst-winter',
    description: 'America/Los_Angeles in January is PST (UTC-8).',
    source: 'IANA tz: US Pacific standard = -08:00 in winter.',
    input: {
      calendar: 'gregorian',
      localDate: '2020-01-15',
      localTime: '12:00:00',
      timeAccuracy: 'exact',
      timezone: 'America/Los_Angeles',
      location: { latitude: 34.05, longitude: -118.24, source: user },
    },
    expect: { kind: 'ok', utcInstant: '2020-01-15T20:00:00Z', offsetEastMinutes: -480 },
  },

  // --- DST fall-back (ambiguous local time occurs twice) ---
  {
    id: 'ny-fallback-ambiguous',
    description: 'NY 2021-11-07 01:30 occurs twice; without a fold choice this must error.',
    source: 'US DST ended 2021-11-07 02:00 EDT -> 01:00 EST.',
    input: {
      calendar: 'gregorian',
      localDate: '2021-11-07',
      localTime: '01:30:00',
      timeAccuracy: 'exact',
      timezone: 'America/New_York',
      location: { latitude: 40.71, longitude: -74.01, source: user },
    },
    expect: { kind: 'error', code: 'AMBIGUOUS_LOCAL_TIME' },
  },
  {
    id: 'ny-fallback-earlier',
    description: 'NY fall-back, earlier occurrence = EDT (UTC-4).',
    source: 'Earlier of the two 01:30 instants is still EDT.',
    input: {
      calendar: 'gregorian',
      localDate: '2021-11-07',
      localTime: '01:30:00',
      timeAccuracy: 'exact',
      timezone: 'America/New_York',
      dstDisambiguation: 'earlier',
      location: { latitude: 40.71, longitude: -74.01, source: user },
    },
    expect: {
      kind: 'ok',
      utcInstant: '2021-11-07T05:30:00Z',
      offsetEastMinutes: -240,
      ambiguityStatus: 'ambiguous-resolved',
      candidateCount: 2,
      warningsInclude: ['DST_AMBIGUOUS_RESOLVED'],
    },
  },
  {
    id: 'ny-fallback-later',
    description: 'NY fall-back, later occurrence = EST (UTC-5).',
    source: 'Later of the two 01:30 instants is EST.',
    input: {
      calendar: 'gregorian',
      localDate: '2021-11-07',
      localTime: '01:30:00',
      timeAccuracy: 'exact',
      timezone: 'America/New_York',
      dstDisambiguation: 'later',
      location: { latitude: 40.71, longitude: -74.01, source: user },
    },
    expect: {
      kind: 'ok',
      utcInstant: '2021-11-07T06:30:00Z',
      offsetEastMinutes: -300,
      ambiguityStatus: 'ambiguous-resolved',
      candidateCount: 2,
    },
  },
  {
    id: 'london-fallback-earlier',
    description: 'London fall-back 2021-10-31 01:30 earlier = BST (UTC+1).',
    source: 'EU DST ended 2021-10-31 02:00 BST -> 01:00 GMT.',
    input: {
      calendar: 'gregorian',
      localDate: '2021-10-31',
      localTime: '01:30:00',
      timeAccuracy: 'exact',
      timezone: 'Europe/London',
      dstDisambiguation: 'earlier',
      location: { latitude: 51.5, longitude: -0.13, source: user },
    },
    expect: {
      kind: 'ok',
      utcInstant: '2021-10-31T00:30:00Z',
      offsetEastMinutes: 60,
      candidateCount: 2,
    },
  },
  {
    id: 'london-fallback-later',
    description: 'London fall-back 2021-10-31 01:30 later = GMT (UTC+0).',
    source: 'Later occurrence is GMT.',
    input: {
      calendar: 'gregorian',
      localDate: '2021-10-31',
      localTime: '01:30:00',
      timeAccuracy: 'exact',
      timezone: 'Europe/London',
      dstDisambiguation: 'later',
      location: { latitude: 51.5, longitude: -0.13, source: user },
    },
    expect: {
      kind: 'ok',
      utcInstant: '2021-10-31T01:30:00Z',
      offsetEastMinutes: 0,
      candidateCount: 2,
    },
  },
  {
    id: 'berlin-fallback-ambiguous',
    description: 'Berlin 2021-10-31 02:30 occurs twice; must error without a fold.',
    source: 'EU DST ended 2021-10-31 03:00 CEST -> 02:00 CET.',
    input: {
      calendar: 'gregorian',
      localDate: '2021-10-31',
      localTime: '02:30:00',
      timeAccuracy: 'exact',
      timezone: 'Europe/Berlin',
      location: { latitude: 52.52, longitude: 13.4, source: user },
    },
    expect: { kind: 'error', code: 'AMBIGUOUS_LOCAL_TIME' },
  },
  {
    id: 'sydney-fallback-ambiguous',
    description: 'Southern-hemisphere fall-back: Sydney 2021-04-04 02:30 occurs twice.',
    source: 'AU DST ended 2021-04-04 03:00 AEDT -> 02:00 AEST.',
    input: {
      calendar: 'gregorian',
      localDate: '2021-04-04',
      localTime: '02:30:00',
      timeAccuracy: 'exact',
      timezone: 'Australia/Sydney',
      location: { latitude: -33.87, longitude: 151.21, source: user },
    },
    expect: { kind: 'error', code: 'AMBIGUOUS_LOCAL_TIME' },
  },

  // --- DST spring-forward (non-existent local time) ---
  {
    id: 'ny-spring-gap',
    description: 'NY 2021-03-14 02:30 does not exist.',
    source: 'US DST began 2021-03-14 02:00 EST -> 03:00 EDT.',
    input: {
      calendar: 'gregorian',
      localDate: '2021-03-14',
      localTime: '02:30:00',
      timeAccuracy: 'exact',
      timezone: 'America/New_York',
      location: { latitude: 40.71, longitude: -74.01, source: user },
    },
    expect: { kind: 'error', code: 'NONEXISTENT_LOCAL_TIME' },
  },
  {
    id: 'london-spring-gap',
    description: 'London 2021-03-28 01:30 does not exist.',
    source: 'EU DST began 2021-03-28 01:00 GMT -> 02:00 BST.',
    input: {
      calendar: 'gregorian',
      localDate: '2021-03-28',
      localTime: '01:30:00',
      timeAccuracy: 'exact',
      timezone: 'Europe/London',
      location: { latitude: 51.5, longitude: -0.13, source: user },
    },
    expect: { kind: 'error', code: 'NONEXISTENT_LOCAL_TIME' },
  },
  {
    id: 'berlin-spring-gap',
    description: 'Berlin 2021-03-28 02:30 does not exist.',
    source: 'EU DST began 2021-03-28 02:00 CET -> 03:00 CEST.',
    input: {
      calendar: 'gregorian',
      localDate: '2021-03-28',
      localTime: '02:30:00',
      timeAccuracy: 'exact',
      timezone: 'Europe/Berlin',
      location: { latitude: 52.52, longitude: 13.4, source: user },
    },
    expect: { kind: 'error', code: 'NONEXISTENT_LOCAL_TIME' },
  },
  {
    id: 'sydney-spring-gap',
    description: 'Southern-hemisphere spring-forward: Sydney 2021-10-03 02:30 does not exist.',
    source: 'AU DST began 2021-10-03 02:00 AEST -> 03:00 AEDT.',
    input: {
      calendar: 'gregorian',
      localDate: '2021-10-03',
      localTime: '02:30:00',
      timeAccuracy: 'exact',
      timezone: 'Australia/Sydney',
      location: { latitude: -33.87, longitude: 151.21, source: user },
    },
    expect: { kind: 'error', code: 'NONEXISTENT_LOCAL_TIME' },
  },
  {
    id: 'apia-dateline-skip-2011',
    description: 'Samoa skipped all of 2011-12-30 when moving west of the date line.',
    source: 'Pacific/Apia jumped from 2011-12-29 to 2011-12-31.',
    input: {
      calendar: 'gregorian',
      localDate: '2011-12-30',
      localTime: '10:00:00',
      timeAccuracy: 'exact',
      timezone: 'Pacific/Apia',
      location: { latitude: -13.83, longitude: -171.77, source: user },
    },
    expect: { kind: 'error', code: 'NONEXISTENT_LOCAL_TIME' },
  },

  // --- China historical DST (1986-1991) ---
  {
    id: 'shanghai-cdt-summer-1988',
    description: 'China observed DST in summer 1988 (UTC+9).',
    source: 'IANA tz: China DST 1986-1991; summer offset +09:00.',
    input: {
      calendar: 'gregorian',
      localDate: '1988-07-15',
      localTime: '12:00:00',
      timeAccuracy: 'exact',
      timezone: 'Asia/Shanghai',
      location: { latitude: 31.23, longitude: 121.47, source: user },
    },
    expect: { kind: 'ok', utcInstant: '1988-07-15T03:00:00Z', offsetEastMinutes: 540 },
  },
  {
    id: 'shanghai-standard-winter-1988',
    description: 'Winter 1988 in China is standard UTC+8.',
    source: 'IANA tz: China DST applied only in summer months.',
    input: {
      calendar: 'gregorian',
      localDate: '1988-01-15',
      localTime: '12:00:00',
      timeAccuracy: 'exact',
      timezone: 'Asia/Shanghai',
      location: { latitude: 31.23, longitude: 121.47, source: user },
    },
    expect: { kind: 'ok', utcInstant: '1988-01-15T04:00:00Z', offsetEastMinutes: 480 },
  },

  // --- Different longitudes -> different mean solar time (lon*4) ---
  {
    id: 'beijing-longitude-solar',
    description: 'Beijing longitude 116.4 gives mean-solar offset 465.6 min.',
    source: 'Mean solar time = longitude * 4 minutes.',
    input: {
      calendar: 'gregorian',
      localDate: '2000-06-01',
      localTime: '12:00:00',
      timeAccuracy: 'exact',
      timezone: 'Asia/Shanghai',
      location: { latitude: 39.9, longitude: 116.4, source: user },
    },
    expect: { kind: 'ok', offsetEastMinutes: 480, longitudeOffsetMinutes: 465.6 },
  },
  {
    id: 'xinjiang-on-beijing-time-solar',
    description: 'Xinjiang longitude 87.6 on Beijing civil time: solar offset 350.4 min.',
    source: 'Mean solar time = 87.6 * 4; civil zone still Asia/Shanghai (+8).',
    input: {
      calendar: 'gregorian',
      localDate: '2000-06-01',
      localTime: '12:00:00',
      timeAccuracy: 'exact',
      timezone: 'Asia/Shanghai',
      location: { latitude: 43.8, longitude: 87.6, source: user },
    },
    expect: { kind: 'ok', offsetEastMinutes: 480, longitudeOffsetMinutes: 350.4 },
  },
  {
    id: 'urumqi-zone-plus6',
    description: 'Asia/Urumqi is a distinct UTC+6 civil zone.',
    source: 'IANA tz: Asia/Urumqi = +06:00.',
    input: {
      calendar: 'gregorian',
      localDate: '2000-06-01',
      localTime: '12:00:00',
      timeAccuracy: 'exact',
      timezone: 'Asia/Urumqi',
      location: { latitude: 43.8, longitude: 87.6, source: user },
    },
    expect: { kind: 'ok', utcInstant: '2000-06-01T06:00:00Z', offsetEastMinutes: 360 },
  },
  {
    id: 'lhasa-longitude-solar',
    description: 'Lhasa longitude 91.1 gives mean-solar offset 364.4 min.',
    source: 'Mean solar time = 91.1 * 4.',
    input: {
      calendar: 'gregorian',
      localDate: '2000-06-01',
      localTime: '12:00:00',
      timeAccuracy: 'exact',
      timezone: 'Asia/Shanghai',
      location: { latitude: 29.65, longitude: 91.1, source: user },
    },
    expect: { kind: 'ok', offsetEastMinutes: 480, longitudeOffsetMinutes: 364.4 },
  },

  // --- Near day / zi-hour boundaries ---
  {
    id: 'near-midnight-start',
    description: '00:00:30 is within ~2 min of the day boundary.',
    source: 'Boundary-awareness for BaZi day pillar.',
    input: {
      calendar: 'gregorian',
      localDate: '2000-06-01',
      localTime: '00:00:30',
      timeAccuracy: 'exact',
      timezone: 'Asia/Shanghai',
      location: { latitude: 31.23, longitude: 121.47, source: user },
    },
    expect: { kind: 'ok', offsetEastMinutes: 480, warningsInclude: ['NEAR_BOUNDARY'] },
  },
  {
    id: 'near-zi-hour-2300',
    description: '23:00:30 is within ~2 min of the 23:00 zi-hour boundary.',
    source: 'Boundary-awareness for zi-hour day-change rules.',
    input: {
      calendar: 'gregorian',
      localDate: '2000-06-01',
      localTime: '23:00:30',
      timeAccuracy: 'exact',
      timezone: 'Asia/Shanghai',
      location: { latitude: 31.23, longitude: 121.47, source: user },
    },
    expect: { kind: 'ok', warningsInclude: ['NEAR_BOUNDARY'] },
  },
  {
    id: 'near-midnight-end',
    description: '23:59:30 is within ~2 min of the next-day boundary.',
    source: 'Boundary-awareness near 24:00.',
    input: {
      calendar: 'gregorian',
      localDate: '2000-06-01',
      localTime: '23:59:30',
      timeAccuracy: 'exact',
      timezone: 'Asia/Shanghai',
      location: { latitude: 31.23, longitude: 121.47, source: user },
    },
    expect: { kind: 'ok', warningsInclude: ['NEAR_BOUNDARY'] },
  },

  // --- Time accuracy ---
  {
    id: 'unknown-time',
    description: 'Unknown time suppresses time-of-day results; anchored to noon.',
    source: 'Handoff §7.2: never fabricate ascendant/hour pillar for unknown time.',
    input: {
      calendar: 'gregorian',
      localDate: '2000-06-01',
      timeAccuracy: 'unknown',
      timezone: 'Asia/Shanghai',
      location: { latitude: 31.23, longitude: 121.47, source: user },
    },
    expect: {
      kind: 'ok',
      timeKnown: false,
      ambiguityStatus: 'not-applicable-unknown-time',
      warningsInclude: ['TIME_UNKNOWN'],
    },
  },
  {
    id: 'approximate-time',
    description: 'Approximate time still computes but warns.',
    source: 'Handoff §9: approximate time near boundaries may shift.',
    input: {
      calendar: 'gregorian',
      localDate: '2000-06-01',
      localTime: '08:00:00',
      timeAccuracy: 'approximate',
      timezone: 'Asia/Shanghai',
      location: { latitude: 31.23, longitude: 121.47, source: user },
    },
    expect: { kind: 'ok', timeKnown: true, warningsInclude: ['TIME_ACCURACY_APPROXIMATE'] },
  },

  // --- Errors: range, timezone, calendar ---
  {
    id: 'out-of-range-low',
    description: 'Year before 1901 is out of the supported range.',
    source: 'Handoff §1.1: unified range 1901-2100.',
    input: {
      calendar: 'gregorian',
      localDate: '1850-01-01',
      localTime: '12:00:00',
      timeAccuracy: 'exact',
      timezone: 'Asia/Shanghai',
      location: { latitude: 31.23, longitude: 121.47, source: user },
    },
    expect: { kind: 'error', code: 'DATE_OUT_OF_RANGE' },
  },
  {
    id: 'out-of-range-high',
    description: 'Year after 2100 is out of the supported range.',
    source: 'Handoff §1.1: unified range 1901-2100.',
    input: {
      calendar: 'gregorian',
      localDate: '2200-01-01',
      localTime: '12:00:00',
      timeAccuracy: 'exact',
      timezone: 'Asia/Shanghai',
      location: { latitude: 31.23, longitude: 121.47, source: user },
    },
    expect: { kind: 'error', code: 'DATE_OUT_OF_RANGE' },
  },
  {
    id: 'unknown-timezone',
    description: 'A non-IANA zone id is rejected.',
    source: 'Only real IANA zones carry historical DST.',
    input: {
      calendar: 'gregorian',
      localDate: '2000-06-01',
      localTime: '12:00:00',
      timeAccuracy: 'exact',
      timezone: 'Mars/Phobos',
      location: { latitude: 31.23, longitude: 121.47, source: user },
    },
    expect: { kind: 'error', code: 'UNKNOWN_TIMEZONE' },
  },
  {
    id: 'lunar-not-yet',
    description: 'Lunar input needs the Phase 2 calendar provider.',
    source: 'Handoff Phase 2: lunar conversion via tyme4ts.',
    input: {
      calendar: 'lunar',
      localDate: '2000-05-01',
      localTime: '12:00:00',
      timeAccuracy: 'exact',
      timezone: 'Asia/Shanghai',
      lunarLeapMonth: false,
      location: { latitude: 31.23, longitude: 121.47, source: user },
    },
    expect: { kind: 'error', code: 'LUNAR_CONVERSION_UNAVAILABLE' },
  },
];

export function fixtureCount(): number {
  return timeLocationFixtures.length;
}
