import { buildAnswerPlan, buildInterpretationFacts, buildPublicResult } from '@loom/interpret';
import type {
  AnswerBinding,
  AnswerLens,
  AnswerPlan,
  BirthInput,
  CareerRealityContextData,
  EngineWarning,
  InterpretationFacts,
  InterpretationTopic,
  PublicResult,
} from '@loom/contracts';
import { calculate, runHoroscope, type HoroscopeOptions } from './calculate.ts';
import { buildAnswerBinding } from './answer-delivery.ts';

export interface InterpretOptions {
  /** Injected wall-clock (epoch ms) for deterministic output. */
  now?: number;
  /** Optional target solar date + double-hour to also compute the Zi Wei 运限盘. */
  at?: HoroscopeOptions;
}

export interface AnswerPlanOptions extends InterpretOptions {
  /** Bounded topic selected by the host; the free-form question is never passed through. */
  topic: InterpretationTopic;
  /** Bounded answer perspective selected by the host. */
  lens?: AnswerLens;
  /**
   * Optional transient career-reality context; when present it participates in
   * the delivery binding digest (content revision — same factId with a changed
   * statement invalidates) but never changes the computed chart or plan facts.
   */
  careerReality?: CareerRealityContextData;
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
): { publicResult: PublicResult; answerPlan: AnswerPlan; answerBinding: AnswerBinding } {
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
  // Transient per-answer binding: digest over the CURRENT request context (the
  // caller's original input, topic/lens, resolved at/now — parsed once by the
  // CLI — executed settings and optional career-reality content) plus the full
  // plan content. Lives beside the public outputs; never inside PublicResult.
  const answerBinding = buildAnswerBinding(
    {
      birthInput: input,
      request: {
        topic: options.topic,
        lens: options.lens,
        ...(options.now !== undefined ? { now: options.now } : {}),
        ...(options.at !== undefined ? { at: options.at } : {}),
      },
      ...(options.careerReality === undefined ? {} : { careerReality: options.careerReality }),
    },
    answerPlan,
  );
  // The intermediate result exists only in-process so the planner can select a
  // topic. Callers receive a topic-scoped result: non-selected facts never cross
  // the engine/host boundary beside the AnswerPlan instructions.
  const publicResult: PublicResult = {
    ...fullPublicResult,
    facts: answerPlan.selectedFacts,
  };
  return { publicResult, answerPlan, answerBinding };
}
