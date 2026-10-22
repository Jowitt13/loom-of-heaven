# Commander protocol

- Protocol id: `loom-commander-protocol/v3`
- Governing roadmap: `roadmap: loom-product-roadmap/v3.1`
- Maintenance update: 2026-10-22, owner-authorized workflow simplification.

## Ordinary work

Use four short fields: goal, changed-file scope, validation, and result.
Name the relevant roadmap phase, inspect branch/HEAD and existing changes, and preserve unrelated
work. Read the roadmap once per task and consult only the ADRs relevant to the change.
An executor cannot change the roadmap.

Use one reviewable PR per coherent change. Ordinary wording fixes and bug fixes do not need a new
ADR, contract, phase id, long task template, or repeated owner approval. Existing authorization
continues through the requested delivery scope.

## Validation proportional to the change

- Documentation only: format and current-document validation.
- Core calculation, answers, or Skill: `pnpm run check` (one full test run).
- Psychology, shared contracts/dependencies, workflow changes, unknown scope, main, or release:
  `pnpm run verify:cloud` (one full test run plus psychology package checks).
- Node 22 extracted-package smoke is required for non-document PRs and main.
- Test totals are reported by CI; never run the suite again merely to count tests in prose.
- Keep release acceptance and controlled incident checks in RELEASE_CHECKLIST.md.

## Product invariants

Reliability Lab, Answer Faithfulness & Quality Lab, and Predictive Validity Research retain
separate evidence: a technical test does not prove prose quality or predictive validity.
Human review and sealed holdouts remain optional. Their absence does not block IQ-1.

Calculation remains deterministic and offline. Preserve source references, material caveats and
privacy; do not invent chart values or user history. Candidate claims need verification before
narration. Separate systems and clinical/nonclinical capabilities. ADR 0021 bounds career output:
one admitted ten-god cultural reference at most; career practices use user-stated reality.
Default answers are natural prose with material limits inline, not technical footer panels.

## Delivery and decisions

Report changed behavior, validation, PR/CI state and remaining limitations briefly.
Commit, push and open a Draft PR within an authorized delivery task; Ready/merge follow the owner's
authorized scope. Do not bypass failing checks or fabricate results. Preserve unrelated dirty
work. Tags, Releases, publication, privacy changes, incompatible public contracts and new rule
admission require an explicit owner decision. A direction change follows roadmap section 8.

## Handling “continue”

Select the earliest unfulfilled, unblocked required exit criterion; execution
may not silently jump to technique expansion, UI, memory or publication.
