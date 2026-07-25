import {
  EngineError,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  canonicalJson,
  fnv1a64Hex,
} from '@ming/contracts';
import type { EngineWarning, SynastryInput, SynastryPerson, SynastryResult } from '@ming/contracts';
import { synastryFindings } from '@ming/synastry';
import { calculate } from './calculate.ts';

export interface SynastryRunOptions {
  now?: number;
}

const DISCLAIMERS: string[] = [
  '以下为传统合婚/关系分析（八字/紫微/占星），仅供传统文化、娱乐与自我反思；契合与否是相处经营的结果，非命定，非科学预测。',
  '只能从本文提供的 findings 作答：每条结论引用其 code/reason/出处；不得臆断双方隐私或编造星曜、干支、宫位。',
  '不下"注定在一起 / 必分手 / 必成"等绝对化断语；张力多的组合可通过沟通与磨合改善，吉多亦需现实经营。',
  '合婚仅为参考，重大关系决定请结合现实相处、双方意愿与专业咨询，勿以命理替代沟通。',
];

const FOLLOWUP_OFFERS: string[] = [
  '两人相处的关键磨合点与建议',
  '感情推进/结婚的有利流年（需各自的婚姻应期）',
  '财务/事业上的合作契合度',
  '与其他人的对比（如上传了多位）',
];

/** Find a person by label, or throw a clear validation error. */
function pick(people: SynastryPerson[], label: string): SynastryPerson {
  const found = people.find((p) => p.label === label);
  if (!found) {
    throw new EngineError(
      'INPUT_VALIDATION_FAILED',
      `analyzePair label "${label}" not found among people.`,
      {
        labels: people.map((p) => p.label),
      },
    );
  }
  return found;
}

/**
 * The `synastry` verb: chart each of 1-5 people, then run the sourced 合婚 rules over the
 * chosen pair. When more than two people are given, `analyzePair` MUST name the two to
 * analyze (the SKILL asks the user first). Deterministic, offline, de-identified.
 */
export function runSynastry(
  input: SynastryInput,
  options: SynastryRunOptions = {},
): { synastry: SynastryResult; warnings: EngineWarning[] } {
  const people = input.people;
  let a: SynastryPerson;
  let b: SynastryPerson;
  if (input.analyzePair) {
    a = pick(people, input.analyzePair[0]);
    b = pick(people, input.analyzePair[1]);
    if (a.label === b.label) {
      throw new EngineError(
        'INPUT_VALIDATION_FAILED',
        'analyzePair must name two different people.',
      );
    }
  } else if (people.length === 2) {
    a = people[0]!;
    b = people[1]!;
  } else {
    throw new EngineError(
      'INPUT_VALIDATION_FAILED',
      'Synastry needs two people. Provide exactly two, or set analyzePair to the two labels to analyze.',
      { peopleCount: people.length },
    );
  }

  const bundleA = calculate(a.input, { now: options.now });
  const bundleB = calculate(b.input, { now: options.now });
  const focusYear = new Date(options.now ?? Date.now()).getUTCFullYear();
  const findings = synastryFindings(bundleA, bundleB, focusYear);
  const relation = a.relation !== 'unspecified' ? a.relation : b.relation;

  const requestId = `req_syn_${fnv1a64Hex(
    canonicalJson({ people: people.map((p) => p.input), pair: [a.label, b.label], relation }),
  )}`;

  const synastry: SynastryResult = {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    requestId,
    people: people.map((p) => ({
      label: p.label,
      relation: p.relation,
      calendar: p.input.calendar,
      timeAccuracy: p.input.timeAccuracy,
      timezone: p.input.timezone,
    })),
    pair: { a: a.label, b: b.label, relation },
    findings,
    followupOffers: FOLLOWUP_OFFERS,
    disclaimers: DISCLAIMERS,
  };

  return { synastry, warnings: [...bundleA.warnings, ...bundleB.warnings] };
}
