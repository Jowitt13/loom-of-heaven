import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8');

const ROADMAP = read('docs/PRODUCT_TECHNICAL_ROADMAP.md');
const ADR = read('docs/adr/0017-product-technical-roadmap-and-execution-governance.md');
const PROTOCOL = read('docs/COMMANDER_PROTOCOL.md');
const AGENTS = read('AGENTS.md');

describe('product technical roadmap and commander governance', () => {
  it('records an owner-confirmed v1 roadmap and accepted ADR', () => {
    expect(ROADMAP).toContain('Roadmap id: `loom-product-roadmap/v1`');
    expect(ROADMAP).toContain('Status: **Accepted and owner-confirmed**');
    expect(ROADMAP).toContain('Confirmed: 2026-08-28');
    expect(ADR).toContain('Status: Accepted');
    expect(ADR).toContain('This ADR changes no current runtime');
  });

  it('fixes the product destination on verified reasoning rather than technique count', () => {
    expect(ROADMAP).toContain(
      'lightweight, deterministic, source-governed, privacy-first four-system reasoning',
    );
    expect(ROADMAP).toContain('fact, rule, source profile, limitation, and invalidation path');
    expect(ROADMAP).toContain('Tool count is never a roadmap KPI');
    expect(ROADMAP).toContain('does **not** compete on the number of divination techniques');
  });

  it('locks the authoritative phase order with G0 as the active phase', () => {
    const order =
      'G0 -> IQ-0 -> IQ-1 -> IQ-2 -> IQ-3 -> IQ-4 -> IQ-5 -> IQ-6 -> PLAT-1 -> DATA-1 -> EXP-1';
    expect(ROADMAP).toContain(order);
    expect(ADR).toContain(order);
    expect(ROADMAP).toContain('### G0 — governance and security baseline');
    expect(ROADMAP).toContain('**Current active phase.**');
    expect(ROADMAP).toContain('never use `--no-verify`');
  });

  it('prioritizes the final-answer quality loop before platform, memory, or expansion', () => {
    for (const phase of [
      'IQ-0 — final-answer quality baseline',
      'IQ-1 — AnswerClaim and NarrativeTrace',
      'IQ-2 — final-answer faithfulness verifier',
      'IQ-3 — career vertical slice',
      'IQ-4 — structured clarification and response projection',
      'IQ-5 — cross-system synthesis',
      'IQ-6 — optional audit and report delivery',
    ]) {
      expect(ROADMAP, phase).toContain(phase);
    }
    expect(ROADMAP.indexOf('IQ-4')).toBeLessThan(ROADMAP.indexOf('PLAT-1'));
    expect(ROADMAP.indexOf('PLAT-1')).toBeLessThan(ROADMAP.indexOf('DATA-1'));
    expect(ROADMAP.indexOf('DATA-1')).toBeLessThan(ROADMAP.indexOf('EXP-1'));
  });

  it('requires claim faithfulness without inventing an aggregate accuracy score', () => {
    expect(ROADMAP).toContain('supported, unsupported, and contradicted factual assertions');
    expect(ROADMAP).toContain('professional-mechanism leap or scope overreach');
    expect(ROADMAP).toMatch(/not an\s+“accuracy score”/);
    expect(ROADMAP).toContain('No generic accuracy percentage');
  });

  it('preserves natural delivery and makes audit detail explicitly requested', () => {
    expect(ROADMAP).toContain('Default narration remains continuous prose');
    expect(ROADMAP).toMatch(/on explicit request, not\s+appended automatically/);
    expect(ROADMAP).toContain('on-request audit cards rather than mandatory footers');
    expect(ROADMAP).toMatch(/raw\s+ids/);
    for (const clutter of ['warning panels', 'a technique card', 'a fixed disclaimer footer']) {
      expect(ROADMAP, clutter).toContain(clutter);
    }
  });

  it('keeps persistence opt-in and psychology structurally isolated', () => {
    expect(ROADMAP).toContain('are not persisted by default');
    expect(ROADMAP).toMatch(/explicit opt-in, inspectable,\s+deletable, and retention-bounded/);
    expect(ROADMAP).toContain('Psychology self-report never becomes a fact inferred from a chart');
    expect(ROADMAP).toContain('Clinical screening phases remain paused');
  });

  it('keeps BaZi D1/D2 shadow-only and source blockers authoritative', () => {
    expect(ROADMAP).toContain('D1/D2 structures remain shadow-only');
    expect(ROADMAP).toContain('D2-C source and rights blockers remain real blockers');
    for (const boundary of ['`interpretBazi`', 'public contracts', 'CLI', 'Skill output']) {
      expect(ROADMAP, boundary).toContain(boundary);
    }
  });

  it('requires every executor prompt to carry the complete admission header set', () => {
    expect(PROTOCOL).toContain('Protocol id: `loom-commander-protocol/v1`');
    for (const heading of [
      '路线锚点',
      '当前阶段与切片',
      '用户价值',
      '已核验基线',
      '前置条件',
      '本切片目标',
      '精确文件白名单',
      '精确禁止项',
      '必须保持的不变量',
      '测试与验收命令',
      '停止条件',
      'GitHub 与发布边界',
      '交付报告格式',
    ]) {
      expect(PROTOCOL, heading).toContain(heading);
    }
  });

  it('defines continue as the next unblocked roadmap exit criterion', () => {
    expect(PROTOCOL).toContain('Handling “continue”');
    expect(PROTOCOL).toContain('earliest unfulfilled, unblocked exit criterion');
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
