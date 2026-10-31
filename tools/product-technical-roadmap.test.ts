import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8');

const ROADMAP = read('docs/PRODUCT_TECHNICAL_ROADMAP.md');
const GOVERNANCE_ADR = read('docs/adr/0017-product-technical-roadmap-and-execution-governance.md');
const ROUTE_ADR = read('docs/adr/0018-structural-answer-quality-route.md');
const PROTOCOL = read('docs/COMMANDER_PROTOCOL.md');
const AGENTS = read('AGENTS.md');
const NARRATIVE = read('docs/NARRATIVE_OUTPUT_V1.md');
const TEN_GOD_ADR = read('docs/adr/0021-ten-god-cultural-reference.md');

describe('product technical roadmap and commander governance', () => {
  it('records an owner-confirmed v3.3 roadmap and accepted route-change ADR', () => {
    expect(ROADMAP).toContain('Roadmap id: `loom-product-roadmap/v3.3`');
    expect(ROADMAP).toContain('Status: **Accepted and owner-confirmed**');
    expect(ROADMAP).toContain('Confirmed: 2026-10-31');
    expect(ROADMAP).toContain('Supersedes: `loom-product-roadmap/v3.2`');
    expect(ROADMAP).toContain('`loom-product-roadmap/v3.3` — 2026-10-31: **version change**');
    // History is retained, not rewritten.
    expect(ROADMAP).toContain('`loom-product-roadmap/v3.2` — 2026-10-29: **version change**');
    expect(GOVERNANCE_ADR).toContain('Status: Accepted');
    expect(GOVERNANCE_ADR).toContain('Amended: 2026-08-29');
    expect(GOVERNANCE_ADR).toContain('Amended: 2026-10-29');
    expect(GOVERNANCE_ADR).toContain('Amended: 2026-10-31');
    expect(GOVERNANCE_ADR).toContain('## Owner-confirmed focus change — 2026-10-29');
    expect(GOVERNANCE_ADR).toContain('## Owner-confirmed presentation change — 2026-10-31');
    expect(GOVERNANCE_ADR).toContain('The current freeze changes no runtime');
    expect(ROUTE_ADR).toContain('Status: Accepted');
    expect(ROUTE_ADR).toContain('Date: 2026-09-03');
    expect(ROUTE_ADR).toContain('This ADR changes no runtime');
    expect(AGENTS).toContain('loom-product-roadmap/v3.3');
    expect(AGENTS).toContain('loom-commander-protocol/v3');
    expect(PROTOCOL).toContain('roadmap: loom-product-roadmap/v3.3');
  });

  it('bounds the v3.3 presentation change to layout and delivery mechanics', () => {
    expect(ROADMAP).toContain('adaptive scannable layout');
    expect(ROADMAP).toContain('reading-draft/v3');
    expect(ROADMAP).toContain('v2 plain text stays accepted');
    expect(ROADMAP).toContain('fact-owned caveat');
    expect(NARRATIVE).toContain('reading-draft/v3');
    expect(NARRATIVE).toContain('v2 plain-text drafts stay accepted');
    expect(GOVERNANCE_ADR).toContain('no host JSON field can influence the derivation');
    expect(GOVERNANCE_ADR).toContain('IQ-5 deferral, and release authority');
    expect(ROADMAP).toContain('This is a roadmap version, not an engine/ruleset/package');
  });

  it('locks the ADR 0021 ten-god cultural-reference bounds as a v3.1 static gate', () => {
    expect(TEN_GOD_ADR).toContain('Status: Accepted');
    expect(TEN_GOD_ADR).toContain('ADR 0021');
    expect(TEN_GOD_ADR).toContain('七杀');
    expect(TEN_GOD_ADR).toContain('正官');
    // Short gloss only — full TEN_GOD_MEANINGS clauses stay out of the career body.
    expect(TEN_GOD_ADR).toContain('exclude 需制化为权');
    expect(TEN_GOD_ADR).toContain('exclude 女命之夫星');
    expect(TEN_GOD_ADR).toContain('责任、自律、地位');
    expect(TEN_GOD_ADR).toContain('omit');
    expect(TEN_GOD_ADR).toContain('bazi-rule/ten-gods/xiang-yi');
    expect(ROADMAP).toContain('ADR 0021');
    expect(ROADMAP).toContain('`loom-product-roadmap/v3.1` — 2026-09-09: **version change**');
    expect(ROADMAP).toContain('One frozen');
    expect(PROTOCOL).toContain('ADR 0021');
    expect(AGENTS).toContain('ADR 0021');
    expect(NARRATIVE).toContain('ADR 0021');
  });

  it('fixes the product destination on verified reasoning rather than technique count', () => {
    expect(ROADMAP).toContain(
      'lightweight, deterministic, source-governed, privacy-first four-system reasoning',
    );
    expect(ROADMAP).toContain('fact, rule, source profile, limitation, and invalidation path');
    expect(ROADMAP).toContain('Tool count is never a roadmap KPI');
    expect(ROADMAP).toContain('does **not** compete on the number of divination techniques');
  });

  it('locks the phase labels and the owner-confirmed IQ-4 correctness and natal focus', () => {
    const order =
      'G0 -> IQ-0 -> IQ-1 -> IQ-2 -> IQ-3 -> IQ-4 -> IQ-5 -> IQ-6 -> PLAT-1 -> DATA-1 -> EXP-1';
    expect(ROADMAP).toContain(order);
    expect(GOVERNANCE_ADR).toContain(order);
    expect(ROADMAP).toContain('### G0 — governance and security baseline');
    expect(ROADMAP).toContain('### IQ-0 — structural answer-quality safeguards');
    expect(ROADMAP).toContain('**Current active phase.** IQ-4 correctness repair and natal-answer');
    expect(ROADMAP).toContain('never use `--no-verify`');
  });

  it('prioritizes the final-answer quality loop before platform, memory, or expansion', () => {
    for (const phase of [
      'IQ-0 — structural answer-quality safeguards',
      'IQ-1 — AnswerClaim and NarrativeTrace',
      'IQ-2 — final-answer faithfulness verifier',
      'IQ-3 — structured clarification and response projection',
      'IQ-4 — correctness repair and natal-answer usability',
      'IQ-5 — cross-system synthesis',
      'IQ-6 — stability, optional audit, and report delivery',
    ]) {
      expect(ROADMAP, phase).toContain(phase);
    }
    expect(ROADMAP.indexOf('IQ-4')).toBeLessThan(ROADMAP.indexOf('PLAT-1'));
    expect(ROADMAP.indexOf('PLAT-1')).toBeLessThan(ROADMAP.indexOf('DATA-1'));
    expect(ROADMAP.indexOf('DATA-1')).toBeLessThan(ROADMAP.indexOf('EXP-1'));
  });

  it('retains career acceptance without blocking the natal loop or activating synthesis', () => {
    const clarification = ROADMAP.indexOf('### IQ-3 — structured clarification');
    const currentIq4 = ROADMAP.indexOf('### IQ-4 — correctness repair and natal-answer');
    const singleSystemCareer = ROADMAP.indexOf('#### Retained single-system career vertical');
    const synthesis = ROADMAP.indexOf('### IQ-5 — cross-system synthesis');
    expect(clarification).toBeGreaterThan(-1);
    expect(clarification).toBeLessThan(currentIq4);
    expect(currentIq4).toBeLessThan(singleSystemCareer);
    expect(singleSystemCareer).toBeLessThan(synthesis);
    expect(ROADMAP).toContain('one selected, source-admitted system');
    expect(ROADMAP).toContain('Only after the single-system career slice passes');
    expect(ROADMAP).toContain('do not wait for career');
    expect(GOVERNANCE_ADR).toContain('Career is no longer the sole prerequisite');
    expect(GOVERNANCE_ADR).toContain('IQ-5 synthesis remains deferred');
  });

  it('freezes one bounded work list with date and ruleset authenticity as its first scope', () => {
    const correctness = ROADMAP.indexOf('#### 1. Correctness and evidence identity');
    const answerPath = ROADMAP.indexOf('#### 2. Existing answer-path repairs');
    const natalLoop = ROADMAP.indexOf('#### 3. Readable natal-answer loop');
    expect(correctness).toBeGreaterThan(-1);
    expect(correctness).toBeLessThan(answerPath);
    expect(answerPath).toBeLessThan(natalLoop);
    expect(ROADMAP).toContain('真实公历日期校验 + 规则版本真实性');
    expect(ROADMAP).toContain('WP-00 through WP-14');
    expect(ROADMAP).toContain('#### Previous optimization queue — completed history');
    expect(PROTOCOL).toContain('#current-optimization-direction--owner-confirmed-2026-10-29');
    expect(PROTOCOL).toContain('Add the failing synthetic regression beside its fix');
    expect(PROTOCOL).toContain('not a second authority');
    expect(PROTOCOL).not.toContain('#current-optimization-order--owner-confirmed-2026-10-23');
  });

  it('does not turn direction approval into runtime permission or a new infrastructure program', () => {
    expect(ROADMAP).toContain('方向批准不等于 blanket implementation');
    expect(ROADMAP).toContain('确定性渲染是原样转写，不是固定答案模板');
    expect(ROADMAP).toContain('不新增 ADR、阶段编号、前置治理工程');
    expect(ROADMAP).toContain('C-4卡片或问卷用户流');
    expect(ROADMAP).toContain('未验证不标成算法已错');
    expect(ROADMAP).toContain('先用一个真实宿主和固定内容身份运行合成案例');
    expect(PROTOCOL).toContain('Freeze/plan approval does not itself authorize runtime');
    expect(GOVERNANCE_ADR).toContain('source/school');
    expect(GOVERNANCE_ADR).toContain('BLOCKED_SOURCE_ADMISSION');
  });

  it('separates the three evidence programs and their claims', () => {
    for (const program of [
      'Reliability Lab',
      'Answer Faithfulness & Quality Lab',
      'Predictive Validity Research',
    ]) {
      expect(ROADMAP, program).toContain(program);
      expect(PROTOCOL, program).toContain(program);
    }
    expect(ROADMAP).toContain('not a normal product-release gate');
    expect(PROTOCOL).toContain('does not prove');
  });

  it('separates candidate claims, approved claims, and synthesis records', () => {
    for (const boundary of [
      '`AnswerClaimCandidate`',
      '`ApprovedAnswerClaim`',
      '`SynthesisRecord`',
      '`mechanismRefs`',
      '`ruleMatchClarity`',
    ]) {
      expect(ROADMAP, boundary).toContain(boundary);
    }
    expect(ROADMAP).toMatch(/A candidate cannot\s+be narrated/);
    expect(ROADMAP).toContain('`cross-system` is not a chart-system value');
    expect(ROADMAP).toMatch(/does\s+not expose a generic `confidence` field/);
  });

  it('keeps real quality evidence optional while preserving structural non-claim boundaries', () => {
    expect(ROADMAP).toContain('20–30 synthetic development candidates');
    expect(ROADMAP).toContain('not prerequisites for IQ-1');
    expect(ROADMAP).toContain('Optional Quality-Evidence Track');
    expect(PROTOCOL).toContain('Their absence does not block IQ-1');
    expect(ROUTE_ADR).toContain('does not validate answer semantics');
    expect(ROUTE_ADR).toContain('human-validated answer-quality baseline');
    expect(ROUTE_ADR).toContain('The owner has decided not to create those real evidence assets');
    expect(ROADMAP).not.toContain('sealed-holdout governance, a legacy baseline');
  });

  it('requires claim faithfulness without inventing an aggregate accuracy score', () => {
    expect(ROADMAP).toContain('supported, unsupported, and contradicted factual assertions');
    expect(ROADMAP).toContain('professional-mechanism leap or scope overreach');
    expect(ROADMAP).toMatch(/not an\s+“accuracy score”/);
    expect(ROADMAP).toContain('No generic accuracy percentage');
  });

  it('preserves natural delivery and makes audit detail explicitly requested', () => {
    expect(ROADMAP).toContain('Default narration is a scannable natural reading');
    expect(ROADMAP).toMatch(/on explicit request, not\s+appended\s+automatically/);
    expect(ROADMAP).toContain('on-request audit cards rather than mandatory footers');
    expect(ROADMAP).toMatch(/raw\s+ids/);
    for (const clutter of ['warning panels', 'a technique card', 'a fixed disclaimer footer']) {
      expect(ROADMAP, clutter).toContain(clutter);
    }
    for (const clutter of ['讲人话', '敏感项校对', '引擎警告', '专业依据', '声明']) {
      expect(ROADMAP, clutter).toContain(clutter);
      expect(NARRATIVE, clutter).toContain(clutter);
    }
    expect(NARRATIVE).toContain('Vary paragraph structure, transitions, and emphasis naturally');
    expect(AGENTS).toMatch(/Never label a\s+section\s+`讲人话`/);
  });

  it('keeps persistence opt-in and psychology structurally isolated', () => {
    expect(ROADMAP).toContain('are not persisted by default');
    expect(ROADMAP).toMatch(/explicit opt-in, inspectable,\s+deletable, and retention-bounded/);
    expect(ROADMAP).toContain('Psychology self-report never becomes a fact inferred from a chart');
    expect(ROADMAP).toContain('Clinical screening phases remain paused');
    expect(ROADMAP).toContain('maintenance mode');
    expect(ROADMAP).toContain('Zi Wei source governance');
    expect(ROADMAP).toContain('research-only');
  });

  it('keeps BaZi D1/D2 shadow-only and source blockers authoritative', () => {
    expect(ROADMAP).toContain('D1/D2 structures remain shadow-only');
    expect(ROADMAP).toContain('D2-C source and rights blockers remain real blockers');
    for (const boundary of ['`interpretBazi`', 'public contracts', 'CLI', 'Skill output']) {
      expect(ROADMAP, boundary).toContain(boundary);
    }
  });

  it('keeps ordinary tasks bounded with the short owner-authorized protocol', () => {
    expect(PROTOCOL).toContain('Protocol id: `loom-commander-protocol/v3`');
    expect(PROTOCOL).toContain('goal, changed-file scope, validation, and result');
    expect(PROTOCOL).toContain('one full test run');
    expect(PROTOCOL).toContain('Ordinary wording fixes and bug fixes do not need a new');
    expect(PROTOCOL).not.toContain('Every executor prompt must contain these exact headings');
  });

  it('defines continue as the next unblocked roadmap exit criterion', () => {
    expect(PROTOCOL).toContain('Handling “continue”');
    expect(PROTOCOL).toContain('earliest unfulfilled, unblocked required exit criterion');
    expect(PROTOCOL).toContain('may not silently jump to technique expansion, UI, memory');
    expect(ROADMAP).toContain(
      '“Continue”, “next”, or executor convenience does not authorize route drift',
    );
  });

  it('requires explicit owner and versioned governance for any route change', () => {
    for (const required of [
      'an explicit owner decision',
      'a new or amended accepted ADR',
      'a roadmap version change and changelog entry',
      'matching updates to the commander protocol and static gate',
      'green repository verification',
    ]) {
      expect(ROADMAP, required).toContain(required);
    }
    expect(PROTOCOL).toContain('An executor cannot change the roadmap');
  });

  it('routes every agent through the roadmap and protocol before planning or editing', () => {
    expect(AGENTS).toContain('docs/PRODUCT_TECHNICAL_ROADMAP.md');
    expect(AGENTS).toContain('docs/COMMANDER_PROTOCOL.md');
    expect(AGENTS).toMatch(/Every task must name a\s+roadmap phase/);
    expect(AGENTS).toContain('A task with no roadmap anchor is not admitted');
    expect(AGENTS).toMatch(
      /A lower-level prompt may narrow these rules but cannot override\s+them/,
    );
  });
});
