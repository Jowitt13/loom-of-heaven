import { buildInterpretationFacts } from '@ming/interpret';
import type { BirthInput, EngineWarning, InterpretationFacts } from '@ming/contracts';
import { calculate, runHoroscope, type HoroscopeOptions } from './calculate.ts';

export interface InterpretOptions {
  /** Injected wall-clock (epoch ms) for deterministic output. */
  now?: number;
  /** Optional target solar date + double-hour to also compute the Zi Wei 运限盘. */
  at?: HoroscopeOptions;
}

/**
 * The `interpret` verb: compute the natal chart (and optionally the Zi Wei dynamic
 * chart), then aggregate everything into topic-organized, evidence-grounded
 * InterpretationFacts for the host LLM. Deterministic, offline, de-identified — the
 * facts are the only thing the model is allowed to read.
 */
export function runInterpret(
  input: BirthInput,
  options: InterpretOptions = {},
): { interpretation: InterpretationFacts; warnings: EngineWarning[] } {
  const bundle = calculate(input, { now: options.now });
  const horoscope = options.at ? runHoroscope(input, options.at).horoscope : null;
  const interpretation = buildInterpretationFacts(bundle, { horoscope });
  return { interpretation, warnings: bundle.warnings };
}
