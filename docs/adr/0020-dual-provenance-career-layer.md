# ADR 0020: Dual-source career layer

- Status: Accepted — architecture and governance only; no runtime behavior implemented
- Date: 2026-09-07
- Scope: career-layer capability separation, provenance and composition rules, privacy and
  consent boundaries, and the staged C-track plan
- Related: [Product technical roadmap](../PRODUCT_TECHNICAL_ROADMAP.md) (§5 C-track, §9 v3
  amendment), [ADR 0014](0014-psychology-and-mental-health-architecture.md) (referenced, not
  modified), [ADR 0019](0019-clarification-and-response-projection-boundary.md),
  [Narrative Output V1](../NARRATIVE_OUTPUT_V1.md),
  [IQ-4H acceptance-packet source gate](../../evals/fixtures/synthetic/iq4-acceptance-packet.json)

## Context

IQ-4H records `BLOCKED_SOURCE_ADMISSION` for the reviewed-answer-examples criterion: today
there is no source-admitted visible BaZi career claim, because the existing text claims depend
on rule content (pattern 格局, useful-god industry matching) that has not passed source
admission. The bazi-career runtime entry therefore emits structured records only. Separately,
the owner has confirmed a product direction: career guidance for users must exist eventually,
but it must never be presented as derived from BaZi structure, and clinical or screening
capabilities must never feed it.

The risk this ADR freezes out is source-smuggling: career advice that silently claims chart
provenance, a chart statement that silently claims career meaning, or a clinical/psychological
artifact that silently feeds career advice.

## Decision

Career composition is built from four strictly separated layers. Every final answer is a list
of composition units, and every unit carries exactly one layer tag with resolvable
provenance.

### 1. Layer responsibilities

1. **T — TraditionalStructureLayer.** Inputs: provider-derived chart facts and admitted
   traditional structural claims or traditional-culture background only (today: the structured
   bazi-career records; zero admitted visible text claims). Allowed outputs: structural
   statements and traditional-culture background. Forbidden outputs: career advice, career or
   industry fit, personality or tendency statements, strong/weak or pattern judgments, any
   prediction or action directive.
2. **R — CareerRealityLayer.** Inputs: only reality information the user actively states —
   roles, skills, goals, constraints, preferences, opportunities — plus clarification answers.
   Allowed outputs: restatement, clarifying questions, decision frameworks, action experiments,
   information-gap prompts. This is the **only** layer from which career advice may originate.
   Forbidden outputs: any chart-derived conclusion, any psychological trait inference, any
   prediction of outcomes.
3. **F — CareerReflectionLayer.** Future, optional, non-clinical. Inputs: results of a
   self-reflection instrument admitted per-instrument by separate owner authorization (none is
   selected or admitted by this ADR). Allowed outputs: reflection framing and action
   experiments that mirror the user's own statements. Forbidden outputs: scores, norms, trait
   labels, or match percentages used to produce advice.
4. **C — ClinicalAssessmentLayer.** A fully separate capability boundary (ADR 0014). The
   career layer must never read, import, persist, reference, or infer from any clinical
   artifact. The composition grammar contains no edge from C to any career layer.

### 2. Mandatory provenance and composition rules

- Every composition unit has a single layer tag and resolvable provenance references; units
  without provenance fail closed.
- Mixed-source paragraphs are not allowed. Cross-layer content may only appear as adjacent
  units that keep their own tags, with an explicit separator semantic: traditional background
  is adjacent context, never the source of an adjacent recommendation.
- The composition grammar admits only T→T, R→R, R→F (reflection framing), and T⊣R adjacency.
  Deriving career advice from T is a forbidden edge. Any edge from C is forbidden.
- Career advice units must trace to user-stated reality (or admitted F reflection framing);
  traditional terms, psychological labels, or screening results must never be rewritten into
  career causality.
- Failure is the default: prediction requests, missing reality information, missing consent,
  and cross-layer smuggling fail closed or degrade (clarifying questions, structure-record-only,
  refusal), per the existing clarification chain.

### 3. Privacy and consent

- R information is session-transient by default and is never persisted because a host chat
  log happens to contain it; any future persistence follows the opt-in local-file,
  inspectable, deletable, retention-bounded pattern.
- F requires explicit consent with a versioned notice (scope `career-reflection`, separate
  from the personality consent scope), must be skippable per item, withdrawable, and
  minimal-collection, with a local-file lifecycle (create, export, delete) following the
  existing nonclinical assessment precedent. Raw answers are never written to the repository,
  logs, or cross-layer storage.
- If a user volunteers health or clinical circumstances, the career layer does not save it,
  does not infer from it, and does not advise on it; it may give only a minimal boundary
  statement. It is never a diagnosis or a safety-routing substitute.
- This ADR does not modify ADR 0014; it only references it and extends the same separation
  principle to the career layer.

### 4. Output governance

- Conditions and boundaries sit next to the sentences they qualify; no fixed footer blocks
  (专业依据/敏感项校对/引擎警告/声明-style) are introduced.
- No fixed "讲人话"-style templates: composition ordering stays flexible while every unit
  keeps its provenance; where a traditional term appears, its conditional meaning must be
  adjacent — but this ADR grants **no new traditional-term visibility** (that remains governed
  by source admission).
- Career action recommendations must never carry BaZi provenance.

### 5. Current state and staged plan

- The IQ-4 technical entry (`bazi-career`) remains available; traditional BaZi career visible
  text claims remain `BLOCKED_SOURCE_ADMISSION`. The dual-source career layer does not, and
  cannot, bypass or lift that state; C-layer-free career advice originates from R, not from T.
- **C-1**: R-layer reality clarification contract (internal, fail-closed against prediction
  and inference).
- **C-2**: composition/provenance contract with negative and mutation tests (internal).
- **C-3**: wiring the T layer into career composition — paused until separate owner
  authorization AND admitted visible traditional text claims exist.
- **C-4**: future per-instrument admission of a nonclinical reflection tool — requires
  separate owner authorization; no instrument is selected by this ADR.
- **C-5**: future acceptance packet for the career layer — it records evidence honestly and
  does not change the IQ-4 blocked state.
- Any clinical or diagnostic questionnaire capability stays fully separate and is out of scope
  here.

## Verification and governance

Machine-verifiable gates for later slices: a composition contract validating single-layer tags,
resolvable provenance, and forbidden edges; negative and mutation tests (stripped provenance,
swapped layer tags on advice units, injected clinical vocabulary, traditional vocabulary inside
advice units); adversarial fixtures for smuggling ("按八字我适合什么行业" must degrade, not
answer); trace checks that caveats sit with their units. Owner review and any future host
acceptance use the acceptance-packet pattern with digest binding; pending is never pass. No
accuracy percentages, model judges, or opaque scores.

## Non-goals and evidence boundary

This ADR implements nothing, selects no instrument, admits no source, creates no visible claim,
and does not modify answer-plan/v2, the frozen rules, the source matrix, the CLI, the Skill, or
any contract. It does not prove that career advice is useful, correct, or effective; the R
layer's advice quality is the user's own responsibility domain supported by framing, not an
engine-validated output. It does not change the IQ-4 exit state.
