import { buildAnswerPlan, buildInterpretationFacts, buildPublicResult } from '@loom/interpret';
import type {
  AnswerLens,
  AnswerPlan,
  BirthInput,
  EngineWarning,
  InterpretationFacts,
  InterpretationTopic,
  PublicResult,
} from '@loom/contracts';
import { calculate, runHoroscope, type HoroscopeOptions } from './calculate.ts';

export interface InterpretOptions {
  /** Injected wall-clock (epoch ms) for deterministic output. */
  now?: number;
  /** Optional target solar date + double-hour to also compute the Zi Wei 运限盘. */
  at?: HoroscopeOptions;
  /**
   * Unknown-time reliability boundary (default on): facts computed from the
   * internal noon placeholder are withheld unless their evidence is
   * whole-day-stable. The IQ-4A career journey opts out because it owns the
   * recorded unknown-time degradation that projects the material and then
   * omits the whole claim class through the clarification contract.
   */
  withholdUnstableUnknownTimeFacts?: boolean;
}

export interface AnswerPlanOptions extends InterpretOptions {
  /** Bounded topic selected by the host; the free-form question is never passed through. */
  topic: InterpretationTopic;
  /** Bounded answer perspective selected by the host. */
  lens?: AnswerLens;
}

interface InterpretationRun {
  bundle: ReturnType<typeof calculate>;
  interpretation: InterpretationFacts;
  warnings: EngineWarning[];
}

function dedupeWarnings(warnings: EngineWarning[]): EngineWarning[] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.code}:${warning.severity}:${warning.system}:${warning.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The requested target year, derived from the same `at.solarDate` the CLI already
 * validated. Kept independent of the Zi Wei run: an unavailable 运限盘 must not
 * silently move per-year facts back to the run year.
 */
function targetYearFrom(at: HoroscopeOptions | undefined): number | undefined {
  if (!at) return undefined;
  const year = new Date(at.solarDate).getUTCFullYear();
  return Number.isFinite(year) ? year : undefined;
}

function runInterpretation(input: BirthInput, options: InterpretOptions): InterpretationRun {
  const bundle = calculate(input, { now: options.now });
  const horoscopeRun = options.at ? runHoroscope(input, options.at) : null;
  const targetYear = targetYearFrom(options.at);
  const interpretation = buildInterpretationFacts(bundle, {
    ...(targetYear !== undefined ? { targetYear } : {}),
    horoscope: horoscopeRun?.horoscope ?? null,
    ...(options.withholdUnstableUnknownTimeFacts === false
      ? { withholdUnstableUnknownTimeFacts: false }
      : {}),
  });
  return {
    bundle,
    interpretation,
    warnings: dedupeWarnings([...bundle.warnings, ...(horoscopeRun?.warnings ?? [])]),
  };
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
  const run = runInterpretation(input, options);
  return { interpretation: run.interpretation, warnings: run.warnings };
}

/**
 * The safe default for ordinary questions. P4's v2 hard cut computes all four
 * systems internally, then returns only the de-identified PublicResult and
 * bounded AnswerPlan. `calculate` remains caller-selected and its default
 * systems array stays at three until the separately authorized P5 product cut.
 */
export function runAnswerPlan(
  input: BirthInput,
  options: AnswerPlanOptions,
): { publicResult: PublicResult; answerPlan: AnswerPlan } {
  const allSystemsInput: BirthInput = {
    ...input,
    settings: {
      ...input.settings,
      systems: ['western', 'bazi', 'ziwei', 'vedic'],
    },
  };
  const run = runInterpretation(allSystemsInput, options);
  const fullPublicResult = buildPublicResult(run.bundle, run.interpretation, run.warnings);
  const answerPlan = buildAnswerPlan(fullPublicResult, {
    topic: options.topic,
    lens: options.lens,
  });
  // The intermediate result exists only in-process so the planner can select a
  // topic. Callers receive a topic-scoped result: non-selected facts never cross
  // the engine/host boundary beside the AnswerPlan instructions.
  const publicResult: PublicResult = {
    ...fullPublicResult,
    facts: answerPlan.selectedFacts,
  };
  return { publicResult, answerPlan };
}
