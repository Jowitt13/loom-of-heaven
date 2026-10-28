# Commander protocol

- Protocol id: `loom-commander-protocol/v3`
- Governing roadmap: `roadmap: loom-product-roadmap/v3.2`
- Maintenance update: 2026-10-22, owner-authorized workflow simplification.
- Route alignment: 2026-10-29, owner-confirmed correctness and natal-answer focus.

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

For the owner's current optimization work, use the single fixed list in
[roadmap section 7](PRODUCT_TECHNICAL_ROADMAP.md#current-optimization-direction--owner-confirmed-2026-10-29):
proven correctness and evidence-identity repairs, bounded answer-path repairs, then one readable
natal-answer loop from already-admitted material. The first implementation scope is real
Gregorian-date validation plus ruleset-version authenticity. Career's source blocker does not
block these tasks and is not lifted by them; cross-system synthesis remains deferred.

Name the item, affected user behavior, and its done condition in the ordinary four-field task.
Add the failing synthetic regression beside its fix instead of creating a separate baseline
project. Follow actual technical dependencies, not completion of every review work package.
Use the existing checks; do not add phase ids, general frameworks, routine ADRs or model judges
for ordinary bugs. The 2026-10-23 queue is completed history, not the current work list.

Freeze/plan approval does not itself authorize runtime implementation, incompatible contracts,
new rule admission, installed-host changes or publication; retain the requested delivery scope.
An unresolved source or design question blocks only its dependent work, not unrelated fixes.
Once the named work is complete, stop until a real usage issue or owner request. The external
review and its WP-00 through WP-14 are evidence and suggestions, not a second authority.
