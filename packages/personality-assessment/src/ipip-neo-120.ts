import {
  ConsentReceipt,
  InstrumentRef,
  PersonalityProfile,
  QuestionnaireSession,
} from '@loom/psychology-contracts';
import type {
  InstrumentRef as InstrumentRefType,
  PersonalityProfile as PersonalityProfileType,
  QuestionnaireSession as QuestionnaireSessionType,
} from '@loom/psychology-contracts';
import {
  IPIP_NEO_120_FACET_IDS,
  IPIP_NEO_120_ITEMS,
  IPIP_NEO_120_ITEM_SET_SHA256,
  IPIP_NEO_120_SOURCE,
} from './ipip-neo-120-zh-CN.ts';
import type { IpipNeo120FacetId, IpipNeo120Item } from './ipip-neo-120-zh-CN.ts';

export const IPIP_NEO_120_INSTRUMENT: InstrumentRefType = InstrumentRef.parse({
  id: IPIP_NEO_120_SOURCE.instrumentId,
  version: 'johnson-2014-mandarin-ipip-source-2026-08-13',
  language: IPIP_NEO_120_SOURCE.language,
  itemSetSha256: IPIP_NEO_120_ITEM_SET_SHA256,
  scoringVersion: 'ipip-standard-reverse-and-sum/v1',
  sourceUrl: IPIP_NEO_120_SOURCE.sources.mandarinItems.url,
  licenseRef:
    'IPIP public-domain items and scales; cite Johnson (2014) and the Mandarin translator.',
});

export const IPIP_NEO_120_CONSENT_SCOPE = 'personality' as const;

export interface IpipNeo120Response {
  itemId: string;
  response: number;
}

export class IpipNeo120InputError extends Error {
  constructor() {
    super('IPIP-NEO-120 session is invalid or incomplete.');
    this.name = 'IpipNeo120InputError';
  }
}

const ITEMS_BY_ID = new Map(IPIP_NEO_120_ITEMS.map((item) => [item.id, item]));
const FACET_DOMAIN: Record<IpipNeo120FacetId, string> = Object.fromEntries(
  IPIP_NEO_120_FACET_IDS.map((facetId) => [facetId, facetId[0]!.toLowerCase()]),
) as Record<IpipNeo120FacetId, string>;

function sameInstrument(instrument: InstrumentRefType): boolean {
  return (
    instrument.id === IPIP_NEO_120_INSTRUMENT.id &&
    instrument.language === IPIP_NEO_120_INSTRUMENT.language &&
    instrument.itemSetSha256 === IPIP_NEO_120_INSTRUMENT.itemSetSha256 &&
    instrument.scoringVersion === IPIP_NEO_120_INSTRUMENT.scoringVersion
  );
}

function checkedSession(session: unknown): QuestionnaireSessionType {
  const parsed = QuestionnaireSession.parse(session);
  if (!sameInstrument(parsed.instrument)) throw new IpipNeo120InputError();
  for (const answer of parsed.answers) {
    if (!ITEMS_BY_ID.has(answer.itemId) || answer.response < 1 || answer.response > 5) {
      throw new IpipNeo120InputError();
    }
  }
  return parsed;
}

function sortedAnswers(answers: Iterable<IpipNeo120Response>): IpipNeo120Response[] {
  const order = new Map(IPIP_NEO_120_ITEMS.map((item, index) => [item.id, index]));
  return [...answers].sort((a, b) => order.get(a.itemId)! - order.get(b.itemId)!);
}

/** Start a voluntary, local-only session; callers persist it explicitly if they want resume. */
export function startPersonalityAssessment(consent: unknown): QuestionnaireSessionType {
  const parsedConsent = ConsentReceipt.parse(consent);
  if (parsedConsent.scope !== IPIP_NEO_120_CONSENT_SCOPE) throw new IpipNeo120InputError();
  return QuestionnaireSession.parse({
    contractVersion: 'questionnaire-session/v1',
    instrument: IPIP_NEO_120_INSTRUMENT,
    consent: parsedConsent,
    status: 'in-progress',
    answers: [],
  });
}

/** List the exact source-bound Mandarin items for a local questionnaire surface. */
export function listIpipNeo120Items(): readonly IpipNeo120Item[] {
  return IPIP_NEO_120_ITEMS;
}

/**
 * Replace or add a bounded batch of answers. This pure function never writes a file,
 * logs a response, or accepts unknown ids. It is therefore safe for local pause/resume.
 */
export function recordIpipNeo120Answers(
  session: unknown,
  incoming: readonly IpipNeo120Response[],
): QuestionnaireSessionType {
  const parsed = checkedSession(session);
  if (parsed.status !== 'in-progress' || incoming.length > IPIP_NEO_120_ITEMS.length) {
    throw new IpipNeo120InputError();
  }
  const answers = new Map(parsed.answers.map((answer) => [answer.itemId, answer.response]));
  const seenIncoming = new Set<string>();
  for (const answer of incoming) {
    if (
      !ITEMS_BY_ID.has(answer.itemId) ||
      !Number.isInteger(answer.response) ||
      answer.response < 1 ||
      answer.response > 5 ||
      seenIncoming.has(answer.itemId)
    ) {
      throw new IpipNeo120InputError();
    }
    seenIncoming.add(answer.itemId);
    answers.set(answer.itemId, answer.response);
  }
  return QuestionnaireSession.parse({
    ...parsed,
    answers: sortedAnswers([...answers].map(([itemId, response]) => ({ itemId, response }))),
  });
}

/** In-progress is the persisted pause state; resuming validates without changing answers. */
export function resumeIpipNeo120Session(session: unknown): QuestionnaireSessionType {
  const parsed = checkedSession(session);
  if (parsed.status !== 'in-progress') throw new IpipNeo120InputError();
  return parsed;
}

/** Complete only when every official item has one valid response. */
export function completeIpipNeo120Session(session: unknown): QuestionnaireSessionType {
  const parsed = checkedSession(session);
  if (parsed.status !== 'in-progress' || parsed.answers.length !== IPIP_NEO_120_ITEMS.length) {
    throw new IpipNeo120InputError();
  }
  return QuestionnaireSession.parse({ ...parsed, status: 'completed' });
}

/** Cancel scrubs raw answers from the returned record; the caller must replace/delete its local file. */
export function cancelIpipNeo120Session(session: unknown): QuestionnaireSessionType {
  const parsed = checkedSession(session);
  if (parsed.status === 'completed') throw new IpipNeo120InputError();
  return QuestionnaireSession.parse({ ...parsed, status: 'cancelled', answers: [] });
}

/**
 * The scorer emits de-identified raw keyed sums only. It deliberately applies no
 * population norms, percentile, high/middle/low label, chart input, or clinical claim.
 */
export function scoreIpipNeo120(session: unknown): PersonalityProfileType {
  const parsed = checkedSession(session);
  if (parsed.status !== 'completed' || parsed.answers.length !== IPIP_NEO_120_ITEMS.length) {
    throw new IpipNeo120InputError();
  }
  const responses = new Map(parsed.answers.map((answer) => [answer.itemId, answer.response]));
  const facetScores = new Map<IpipNeo120FacetId, number>(
    IPIP_NEO_120_FACET_IDS.map((facetId) => [facetId, 0]),
  );
  for (const item of IPIP_NEO_120_ITEMS) {
    const response = responses.get(item.id);
    if (response === undefined) throw new IpipNeo120InputError();
    facetScores.set(
      item.facetId,
      facetScores.get(item.facetId)! + (item.reverseScored ? 6 - response : response),
    );
  }
  const domainScores = new Map<string, number>();
  for (const [facetId, score] of facetScores) {
    const domain = FACET_DOMAIN[facetId];
    domainScores.set(domain, (domainScores.get(domain) ?? 0) + score);
  }
  return PersonalityProfile.parse({
    contractVersion: 'personality-profile/v1',
    instrument: IPIP_NEO_120_INSTRUMENT,
    completeness: 1,
    domains: ['n', 'e', 'o', 'a', 'c'].map((domain) => ({
      id: `domain-${domain}`,
      score: domainScores.get(domain)!,
    })),
    facets: IPIP_NEO_120_FACET_IDS.map((facetId) => ({
      id: `facet-${facetId.toLowerCase()}`,
      score: facetScores.get(facetId)!,
    })),
    qualityFlags: ['complete-120-items', 'norms-not-applied'],
    selfReportNotDiagnosis: true,
  });
}

/** A profile is already the only exportable P3 representation; raw answers never leave it. */
export function exportIpipNeo120Profile(session: unknown): PersonalityProfileType {
  return scoreIpipNeo120(session);
}

/** Signal that the caller must delete its local private artifact; no raw session is returned. */
export function deleteIpipNeo120Session(): {
  contractVersion: 'personality-session-delete/v1';
  deleted: true;
} {
  return { contractVersion: 'personality-session-delete/v1', deleted: true };
}
