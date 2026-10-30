import {
  buildAnswerPlan,
  buildInterpretationFacts,
  buildPublicResult,
  selectAnswerFacts,
} from '@loom/interpret';
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
  /** Dynamic-chart result and requested target year, reused by the capability probe. */
  horoscope: ReturnType<typeof runHoroscope>['horoscope'];
  targetYear: number | undefined;
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
  const horoscope = horoscopeRun?.horoscope ?? null;
  const interpretation = buildInterpretationFacts(bundle, {
    ...(targetYear !== undefined ? { targetYear } : {}),
    horoscope,
  });
  return {
    bundle,
    interpretation,
    warnings: dedupeWarnings([...bundle.warnings, ...(horoscopeRun?.warnings ?? [])]),
    horoscope,
    targetYear,
  };
}

/**
 * Evidence collector for an empty unknown-time plan — why the selection is
 * empty, never guessed:
 * 1. Facts-layer probe: rebuild ONLY the fact layer on the same computed chart
 *    with the unknown-time reliability filter disabled (no chart recompute) and
 *    ask the ordinary selection whether admitted material would exist with a
 *    known birth time. If yes, the missing time is the real blocker.
 * 2. Dynamic path's own report: an explicitly requested target period whose
 *    horoscope layer answered ZIWEI_INPUT_REQUIRED names its missing input —
 *    birth time when unknown, the rule input (e.g. gender) otherwise.
 * No evidence ⇒ NO_TOPIC_FACTS: supplying time, place or gender would not help.
 */
function probeEmptyReason(
  run: InterpretationRun,
  request: { topic: InterpretationTopic; lens?: AnswerLens },
  atRequested: boolean,
): 'TIME_REQUIRED' | 'INPUT_REQUIRED' | undefined {
  const timeUnknown = run.bundle.originalInput.timeAccuracy === 'unknown';
  if (timeUnknown) {
    const patchedBundle = {
      ...run.bundle,
      originalInput: { ...run.bundle.originalInput, timeAccuracy: 'approximate' as const },
    };
    const probeFacts = buildInterpretationFacts(patchedBundle, {
      ...(run.targetYear !== undefined ? { targetYear: run.targetYear } : {}),
      horoscope: run.horoscope,
    });
    const probePublic = buildPublicResult(patchedBundle, probeFacts, run.warnings);
    if (selectAnswerFacts(probePublic.facts, request).length > 0) return 'TIME_REQUIRED';
  }
  if (
    atRequested &&
    run.horoscope === null &&
    run.warnings.some((warning) => warning.code === 'ZIWEI_INPUT_REQUIRED')
  ) {
    return timeUnknown ? 'TIME_REQUIRED' : 'INPUT_REQUIRED';
  }
  return undefined;
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
  let answerPlan = buildAnswerPlan(fullPublicResult, {
    topic: options.topic,
    lens: options.lens,
  });
  if (answerPlan.selectedFacts.length === 0) {
    // Decide the empty-reason on evidence, not on timeAccuracy alone.
    answerPlan = buildAnswerPlan(
      fullPublicResult,
      { topic: options.topic, lens: options.lens },
      {
        probeReason: probeEmptyReason(
          run,
          { topic: options.topic, lens: options.lens },
          options.at !== undefined,
        ),
      },
    );
  }
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
  // topic. Callers receive a topic-scoped result: non-selected facts and the
  // request-scoped follow-up offers never cross the engine/host boundary beside
  // the AnswerPlan instructions.
  const publicResult: PublicResult = {
    ...fullPublicResult,
    facts: answerPlan.selectedFacts,
    followupOffers: answerPlan.followupOffers,
  };
  return { publicResult, answerPlan, answerBinding };
}
