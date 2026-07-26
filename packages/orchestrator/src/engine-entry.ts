/**
 * esbuild entry for the packaged engine (skills/.../scripts/dist/engine.mjs).
 *
 * The CLI imports ONLY from the built bundle, so everything it needs — engine
 * verbs plus the handful of contract helpers — is re-exported here and bundled
 * into a single self-contained ESM file with no external path dependencies.
 */
export { doctor } from './doctor.ts';
export type { DoctorReport, RuntimeInfo } from './doctor.ts';

export { calculate, runNormalize, runHoroscope, computeRequestId } from './calculate.ts';
export type { CalculateOptions, NormalizeResult, HoroscopeOptions } from './calculate.ts';

export { runAnswerPlan, runInterpret } from './interpret.ts';
export type { AnswerPlanOptions, InterpretOptions } from './interpret.ts';

// Output-layer term firewall for produced Channel B reports (ADR 0011). Pure text util.
export { lintReading, READING_TERMS, JARGON_STRONG, JARGON_SOFT } from '@ming/interpret';
export type {
  ReadingLintResult,
  ReadingViolation,
  ReadingLintOptions,
  ReadingChannel,
} from '@ming/interpret';

// Fact-boundary and safety validator for host-produced answer drafts (P0),
// plus the bounded parsing facade shared by the CLI and host integrations.
export { validateAnswer, parseValidateAnswerInputBounded } from '@ming/interpret';

// Validator types come from the contracts layer.
export type {
  AnswerValidationResult,
  AnswerViolation as AnswerValidationViolation,
} from '@ming/contracts';

export { runSynastry } from './synastry.ts';
export type { SynastryRunOptions } from './synastry.ts';

export { timeIndexFromHour } from '@ming/ziwei';

export { compareProfiles, listCompareProfiles, COMPARE_PROFILES } from './compare.ts';
export type { CompareResult, CompareEntry } from './compare.ts';

export {
  renderReport,
  renderSvgReport,
  renderHoroscopeReport,
  renderHoroscopeSvg,
  escapeHtml,
} from './render.ts';
export type { RenderOptions } from './render.ts';

export { verify } from './verify.ts';
export type { VerifyReport, VerifyCheck } from './verify.ts';

// Contract helpers the CLI needs — re-exported so the CLI imports one bundle only.
export {
  parseBirthInput,
  parseSynastryInput,
  ValidateAnswerInput,
  MAX_VALIDATE_ANSWER_INPUT_BYTES,
  EngineError,
  toEngineError,
  ERROR_CODES,
  canonicalJson,
  canonicalJsonPretty,
  ENGINE_NAME,
  ENGINE_VERSION,
  SCHEMA_VERSION,
} from '@ming/contracts';
export type {
  BirthInput,
  ChartBundle,
  NormalizedBirthData,
  SynastryInput,
  SynastryResult,
  ValidateAnswerInput as ValidateAnswerInputType,
} from '@ming/contracts';
