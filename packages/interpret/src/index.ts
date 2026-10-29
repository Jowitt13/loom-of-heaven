/**
 * @loom/interpret — cross-system interpretation-facts layer (handoff §8 layer 2).
 * Offline, deterministic, de-identified, evidence-grounded; never prose or prediction.
 */
export {
  buildInterpretationFacts,
  selectCareerOfficerLabel,
  careerOfficerEvidence,
  type CareerOfficerPillar,
  type InterpretOptions,
} from './build.ts';
export * from './answer-plan.ts';
export * from './validate-answer.ts';
export * from './reading-lint.ts';
