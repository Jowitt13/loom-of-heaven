import {
  ENGINE_NAME,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  SOLAR_TIME_METHOD,
  SUPPORTED_YEAR_MAX,
  SUPPORTED_YEAR_MIN,
} from '@loom/contracts';
import { momentVersion, tzdbVersion, zoneCount } from '@loom/time-location';
import { PROVIDER_REGISTRY } from './provenance-build.ts';

/** Optional runtime facts supplied by the CLI (the engine stays process-free). */
export interface RuntimeInfo {
  node?: string;
  platform?: string;
}

export interface DoctorReport {
  ok: true;
  engine: { name: string; version: string; schemaVersion: string };
  runtime: RuntimeInfo;
  tzdb: { source: string; version: string; momentVersion: string; zoneCount: number };
  supportedYearRange: [number, number];
  solarTimeMethod: string;
  network: 'disabled';
  capabilities: {
    normalize: 'ready';
    calculate: 'ready';
    lunar: 'ready';
    western: 'ready';
    bazi: 'ready';
    ziwei: 'ready';
    render: 'disabled';
  };
  providers: typeof PROVIDER_REGISTRY;
}

/**
 * Self-check + capability report (CLI `doctor`). Confirms the bundled TZDB loads
 * with a recorded version and that the engine runs fully offline. Reports honest
 * capabilities: normalization + all three chart systems (Western/BaZi/Zi Wei) are
 * ready; the HTML/SVG `render` report is temporarily disabled (see ADR 0005).
 */
export function doctor(runtime: RuntimeInfo = {}): DoctorReport {
  return {
    ok: true,
    engine: { name: ENGINE_NAME, version: ENGINE_VERSION, schemaVersion: SCHEMA_VERSION },
    runtime,
    tzdb: {
      source: 'moment-timezone',
      version: tzdbVersion(),
      momentVersion: momentVersion(),
      zoneCount: zoneCount(),
    },
    supportedYearRange: [SUPPORTED_YEAR_MIN, SUPPORTED_YEAR_MAX],
    solarTimeMethod: SOLAR_TIME_METHOD,
    network: 'disabled',
    capabilities: {
      normalize: 'ready',
      calculate: 'ready',
      lunar: 'ready',
      western: 'ready',
      bazi: 'ready',
      ziwei: 'ready',
      render: 'disabled',
    },
    providers: PROVIDER_REGISTRY,
  };
}
