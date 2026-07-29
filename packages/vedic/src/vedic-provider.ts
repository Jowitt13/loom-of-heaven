import { WARNING_CODES, makeWarning } from '@ming/contracts';
import type { EngineWarning, NormalizedBirthData, VedicSettings } from '@ming/contracts';

/**
 * Vedic (Jyotish) provider — P1 skeleton only (ADR 0013, Status: Proposed).
 *
 * Golden rules honored here: the engine NEVER fabricates a chart value, a
 * provider ref, a ruleset ref or a precision claim for a system it cannot
 * actually compute. Until the P2 slice lands (precise Lahiri ayanamsha, nine
 * grahas, mean/true Rahu, Ketu opposition, Lagna — all behind an independent
 * ≤1′ Swiss golden), this provider returns null plus one structured warning,
 * exactly like the pre-provider phases of the other three systems.
 *
 * The `settings` parameter is accepted (contract-validated upstream) but
 * deliberately unused: `nodes` and `dashaYear` are unresolved owner decisions
 * (ADR 0013 Open questions 1–2) and must not influence anything yet.
 */
export function computeVedic(
  _normalized: NormalizedBirthData,
  _settings: VedicSettings,
): { result: null; warnings: EngineWarning[] } {
  return {
    result: null,
    warnings: [
      makeWarning(
        WARNING_CODES.SYSTEM_NOT_YET_IMPLEMENTED,
        'vedic',
        'The vedic provider is a P1 skeleton (ADR 0013): contracts are reserved, but no ' +
          'calculation exists yet. Nothing is fabricated; graha/Lagna/panchanga/dasha ' +
          'values arrive only after the P2/P3 slices pass their independent goldens.',
        { severity: 'info' },
      ),
    ],
  };
}
