# 0012 — Empty-talk (vagueness) detection in lint-reading + real-report acceptance

- Status: Partially superseded by `docs/NARRATIVE_OUTPUT_V1.md` (empty-talk and overreach checks remain active)
- Date: 2026-07-22
- Extends: 0011 (Channel B writing isolation + term firewall) — output layer only.

> **Current delivery note (2026-08-11):** The concrete-action requirement remains active.
> The fixed seven-step requirement, terminology quarantine and mandatory “专业依据” section do not;
> current default delivery is defined by `docs/NARRATIVE_OUTPUT_V1.md`.

## Context

After 0011, lint-reading blocked 命理 terms and consultant jargon, but a subtler problem remained:
a report can be term-free yet still abstract and empty ("逐步提高专业能力，建立长期竞争优势",
"把握机会，实现事业突破", "财运需要稳中求进"). The user cannot tell what will happen or what to do.
Prompt rules alone could not enforce concreteness, and there was no check on REAL produced reports.

## Decision

- **A. Vagueness detector (packages/interpret/src/reading-lint.ts).** A sentence-level pass: a
  sentence containing an abstract marker (abstract goal / abstract ability / non-actionable advice
  lists) is flagged as category `空话` UNLESS the same or the immediately following sentence carries a
  concrete signal (real-life noun, number+unit, or an observable step/scene). Severity is `error` in
  every checked zone. Stacked soft jargon (≥2 in one sentence) escalates to `error`; a lone soft
  jargon stays `warn` outside the strict zone. Heading detection was tightened so core-conclusion
  bullets and short sentences are checked (not skipped as headings).
- **B. Anti-gaming rule.** Reports must keep the 7-step structure and information density: no
  compressing into empty short sentences, no deleting risk/timeline/advice, no "仅供参考"-only, no
  moving concrete conclusions into 专业依据, no synonym-swapping jargon, no mechanical "例如" without
  a real example. Section 6 may use terms but must stay consistent with the body and add no new major
  conclusion.
- **C. Real end-to-end acceptance.** Three reports were generated from the PRODUCTION Skill + real
  engine facts (male, 1990-06-15 14:20, 示例城市) for 事业/感情/财运, saved unpolished to
  `docs/round9-acceptance/{career,love,wealth}.md`, linted, and rewritten to 0 error. The detector
  caught the real empty-talk ("争取更多自主权", "安全感"×2); wealth was already clean. Test #8 lints
  these committed reports.
- **D. Examples.** Each of examples-{career,love,wealth}.md gained ≥5 完整改写 covering
  abstract→real-manifestation, vague-advice→actionable, risk→life-scene, time-judgement→possible-event,
  and term/user-language separation.

## Consequences

- The detector is a heuristic on NEARBY concreteness, not meaning: it cannot judge whether an example
  is genuinely apt, only that concrete vocabulary/numbers/steps are present. This limitation is
  retained in docs/VALIDATION.md.
- New unit tests (reading-lint.test.ts, +11 incl. the real-report lint) cover empty-only reports
  failing, abstract+concrete passing, soft-jargon warn/stack, synonym variants, no false positives on
  years/amounts/jobs/scenes, `--simple` strictness, and detector self-test.
- No change to排盘 algorithms, calendar/time, 大运/流年/星曜/宫位/相位, facts (claim/reason/evidence/
  ref/ruleId), schema/ruleset/provenance, warnings, or合婚 computation.

## Revision 9.1 (2026-07-22)

- The vagueness check was tightened: a concrete ACTION / observable behaviour is now REQUIRED **in the
  same sentence** as an abstract marker (via colon / parentheses / “也就是”“比如”). Numbers and
  life-nouns are auxiliary only and cannot pass a sentence on their own; an unrelated concrete NEXT
  sentence no longer rescues an abstract one (“未来3年稳中求进”“在工作中提高竞争力” fail;
  “把收入、支出、储蓄和合作资金分开记录” passes).
- Added a `重复` (repetition) warning: the same judgement re-worded across sections, or highly similar
  sentences (character-bigram Jaccard ≥ 0.7), are flagged so every section adds new information and
  near-identical consecutive years get merged.
- The three real reports were re-linted to 0 error / 0 warn: stiff phrases replaced with concrete
  language, similar consecutive years merged (感情 2031–2033, 财运 2031–2032), the birth-time statement
  unified (东莞真太阳时约21:20—21:25、仍属亥时、距21:00边界二十多分钟), bolding focused on one core
  sentence per section, and the over-broad career industry list trimmed to three work-traits.

## Revision 9.1.1 (2026-07-22)

- Added a fact-boundary check (category `越界`, error): (a) “升职/加薪” is flagged unless the report
  carries an income fact (收入/薪资/财星/进账…); a responsibility-only fact must not be expanded to a
  raise. (b) Group comparisons (比同龄人/比大多数人/比别人更强) and success guarantees (肯定能/做得出来)
  are flagged — distinguish “愿意做/可能擅长” from “实际能否完成”. (c) Asserting the user's real-life
  situation as an established fact (你现在有/你有一份/你和别人正在…) is flagged unless the sentence
  carries a conditional marker (如果/可能/例如/以后…); scenarios must stay hypothetical. (d) A career
  “参考方向” may list at most 3 categories with at most 3 familiar job examples each, with a
  “只是参考、非唯一” note; the full 五行 industry map stays in section 6.
- The three real reports were revised accordingly (removed 加薪/同龄人/既成事实, restored a bounded
  career 参考方向, replaced residual stiff phrases) and still lint to 0 error / 0 warn.
