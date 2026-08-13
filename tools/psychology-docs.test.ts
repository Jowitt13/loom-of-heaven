import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Psychology P0 documentation gate (ADR 0014). This keeps the roadmap portable
 * across Agents while preventing a planning document from becoming a premature
 * personality, clinical-screening, or diagnosis capability claim.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8');

const ADR = 'docs/adr/0014-psychology-and-mental-health-architecture.md';
const MATRIX = 'docs/PSYCHOLOGY_SOURCE_MATRIX.md';
const PLAN = 'docs/PSYCHOLOGY_IMPLEMENTATION_PLAN.md';

describe('psychology P0 architecture', () => {
  it('keeps ADR 0014 proposed for clinical work and separates all three capabilities', () => {
    const adr = read(ADR);
    expect(adr).toMatch(/Status: Proposed/);
    expect(adr).toMatch(/no clinical screening capability is shipped/i);
    for (const section of [
      'Psychology-informed narration',
      'Optional personality self-assessment',
      'Mental-health screening',
      'Professional assessment mode',
      'Privacy and data lifecycle',
      'Safety kernel before clinical screeners',
      'Deterministic validation gates',
      'Not supported by the first release',
    ]) {
      expect(adr, `ADR 0014 lost section: ${section}`).toContain(section);
    }
  });

  it('locks the evidence and diagnosis boundaries', () => {
    const adr = read(ADR);
    expect(adr).toMatch(/never infer a questionnaire answer from a chart/i);
    expect(adr).toMatch(/MentalHealthScreeningResult.*structurally prohibited/s);
    expect(adr).toMatch(/Automated diagnosis is out of\s+scope/i);
    expect(adr).toMatch(/PHQ-9 item 9 independently of the total score/i);
    expect(adr).toMatch(/qualified mental-health professional before release/i);
  });

  it('keeps the instrument and software source matrix explicit', () => {
    const matrix = read(MATRIX);
    for (const source of [
      'IPIP-NEO-120',
      'PHQ-9',
      'GAD-7',
      'ASRS v1.1',
      'PC-PTSD-5',
      'PCL-5',
      'PID-5',
      'C-SSRS',
      'b5-johnson-120-ipip-neo-pi-r',
      'jspsych/jsPsych',
      'surveyjs/survey-library',
    ]) {
      expect(matrix, `source matrix lost ${source}`).toContain(source);
    }
    expect(matrix).toContain('BLOCKED_LICENSE');
    expect(matrix).toContain('BLOCKED_TRANSLATION');
    expect(matrix).toMatch(/software license, questionnaire-content rights,\s+translation rights/s);
  });

  it('keeps a complete cross-agent execution and stop protocol', () => {
    const plan = read(PLAN);
    for (const section of [
      'Mandatory reading order',
      'Start-of-work protocol',
      'Frozen product decisions',
      'Privacy threat model',
      'Safety acceptance model',
      'PR sequence',
      'Test matrix',
      'Stop conditions',
      'Required phase report',
      'Portable kickoff prompt',
      'Definition of roadmap completion',
    ]) {
      expect(plan, `implementation plan lost section: ${section}`).toContain(section);
    }
    for (let phase = 0; phase <= 10; phase += 1) {
      expect(plan, `implementation plan lost P${phase}`).toMatch(
        new RegExp(`### P${phase} \\u2014`),
      );
    }
    expect(plan).toMatch(/Do not submit a partial clinical feature/i);
    expect(plan).toMatch(/Do not push, create a PR, merge, tag, publish a\s+Release/s);
  });

  it('routes every future Agent through the three planning documents', () => {
    const agents = read('AGENTS.md');
    for (const path of [
      'docs/adr/0014-psychology-and-mental-health-architecture.md',
      'docs/PSYCHOLOGY_SOURCE_MATRIX.md',
      'docs/PSYCHOLOGY_IMPLEMENTATION_PLAN.md',
    ]) {
      expect(agents).toContain(path);
    }
    expect(agents).toMatch(/P9.*nonclinical/i);
  });
});

describe('psychology P0 capability truthfulness', () => {
  const userSurfaces = [
    'README.md',
    'skills/xuan-ji-yu-heng/SKILL.md',
    'skills/xuan-ji-yu-heng/agents/openai.yaml',
    '.claude-plugin/plugin.json',
    'install-manifest.json',
  ];
  const prematureClaim =
    /PHQ-9|GAD-7|ASRS|PC-PTSD|PCL-5|PID-5|IPIP-NEO|心理问卷|心理筛查|心理画像/i;

  it('keeps current user-facing surfaces free of planned capability claims', () => {
    const offenders = userSurfaces.filter((file) => prematureClaim.test(read(file)));
    expect(offenders, `premature psychology capability claim: ${offenders.join(', ')}`).toEqual([]);
  });

  it('keeps clinical and chart-cross-check packages absent while P9 owns the only public nonclinical Skill', () => {
    const futurePaths = [
      'packages/psychology-cross-check',
      'packages/mental-health-safety',
      'packages/mental-health-screening',
    ];
    const existing = futurePaths.filter((path) => existsSync(join(root, path)));
    expect(existing, `P1 created a public or later-phase path: ${existing.join(', ')}`).toEqual([]);
    for (const path of ['packages/psychology-contracts', 'packages/personality-assessment']) {
      expect(existsSync(join(root, path)), `P1 skeleton is missing: ${path}`).toBe(true);
    }
    expect(existsSync(join(root, 'skills/psychology-self-assessment'))).toBe(true);
    expect(read('package.json')).toMatch(/psychology-self-assessment/);
    expect(read('package.json')).not.toMatch(/mental-health-screening/);
  });

  it('records P3 source binding while P9 exposes only a nonclinical file-only Skill', () => {
    const matrix = read(MATRIX);
    const adr = read(ADR);
    expect(matrix).toMatch(/P3 internal IPIP-NEO-120 source binding/);
    expect(matrix).toMatch(/IMPLEMENTED_INTERNAL/);
    expect(matrix).toMatch(
      /not a dependency and it\s+does not constitute a separate scoring implementation/i,
    );
    expect(adr).toMatch(/P3 implementation decision/);
    expect(adr).toMatch(/P9 implementation decision/);
    expect(adr).toMatch(/no clinical screening capability is shipped/i);
  });
});
