import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8');

const ADR = read('docs/adr/0016-interpretable-state-and-accuracy-lab.md');
const ARCHITECTURE = read('docs/ARCHITECTURE.md');

describe('ADR 0016 interpretation-state architecture gate', () => {
  it('records an accepted architecture-only boundary without claiming runtime delivery', () => {
    expect(ADR).toContain(
      'Status: Accepted — architecture boundary only; no runtime behavior enabled',
    );
    expect(ADR).toContain('internal-first, transient, regenerable artifact');
    expect(ADR).toContain('does not change an existing public contract, command, or output path');
    expect(ADR).toContain('does not add a state CLI, state file, public schema');
  });

  it('keeps state out of default memory and excludes private or model-reasoning material', () => {
    expect(ADR).toMatch(/not a default\s+cross-session memory/);
    for (const prohibited of [
      'real name',
      'free-text location',
      'life event',
      'original birth-input record',
      'raw host-model reasoning',
      'chain-of-thought',
      'prompt text',
      'provider keys',
      'chat transcript',
    ]) {
      expect(ADR, prohibited).toContain(prohibited);
    }
  });

  it('does not mistake a hash for privacy and reserves SHA-256 for claimed integrity', () => {
    expect(ADR).toContain('Hashing is not anonymization');
    expect(ADR).toContain('must not be described as a privacy safeguard');
    expect(ADR).toContain('SHA-256 integrity digest');
    expect(ADR).toContain('FNV request id');
    expect(ADR).toMatch(/not be relabelled\s+as a state-integrity or security guarantee/);
  });

  it('keeps semantic layers, unresolved outcomes, and cross-system boundaries explicit', () => {
    for (const layer of [
      'fact',
      'derived-structure',
      'rule-judgment',
      'school-judgment',
      'temporal-signal',
      'answer-claim',
    ]) {
      expect(ADR, layer).toContain(layer);
    }
    for (const status of ['matched', 'rejected', 'unresolved', 'not-applicable']) {
      expect(ADR, status).toContain(status);
    }
    expect(ADR).toContain('No common state field normalizes every system');
  });

  it('requires typed invalidation and rejects a generic DAG runtime', () => {
    expect(ADR).toContain('typed causes rather than an unstructured list of strings');
    for (const cause of [
      'input/chart',
      'settings',
      'engine/provider',
      'ruleset',
      'source profile',
      'topic/lens',
      'language/narrator',
    ]) {
      expect(ADR, cause).toContain(cause);
    }
    expect(ADR).toContain('A generic DAG runtime is not introduced');
    expect(ADR).toContain('No `@loom/bazi-schools` package is introduced');
  });

  it('requires accepted source governance and does not unlock blocked D2-C3 work', () => {
    expect(ADR).toContain('accepted source');
    expect(ADR).toContain('named source profile');
    expect(ADR).toContain('positive plus negative or blocking synthetic fixtures');
    expect(ADR).toContain('VISUAL_TEXT_VERIFIED_BUT_SECOND_SOURCE_OR_RIGHTS_BLOCKED');
    expect(ADR).toContain('does not authorize an active rule');
    expect(ADR).toContain('Distinct traditions do not vote');
  });

  it('keeps D1/D2 evidence shadow-only and frozen legacy rulesets unchanged', () => {
    for (const module of [
      'root-state.ts',
      'relation-geometry.ts',
      'strength-inputs.ts',
      'pattern-inputs.ts',
    ]) {
      expect(ADR, module).toContain(module);
    }
    expect(ADR).toContain('shadow-only');
    expect(ADR).toContain('cannot silently alter `bazi-standard@0.1.0`');
    expect(ADR).toContain('`bazi-rules-ziping@0.1.0`');
    expect(ADR).toContain('cannot itself reach a user answer');
  });

  it('limits verification to derivation and preserves a clean default narrative surface', () => {
    expect(ADR).toContain(
      'cannot establish that traditional divination is scientifically predictive',
    );
    expect(ADR).toContain('never the sole release gate');
    expect(ADR).toContain('Default user-facing prose remains continuous and topic-specific');
    for (const heading of ['敏感项校对', '引擎警告', '专业依据', '声明']) {
      expect(ADR, heading).toContain(heading);
    }
    expect(ADR).toMatch(/explicit-request\s+capability only/);
  });

  it('keeps external-model evaluation and training outside runtime and daily CI', () => {
    expect(ADR).toMatch(/synthetic or de-identified fixtures\s+only/);
    expect(ADR).toContain('not daily CI gates');
    expect(ADR).toMatch(/not\s+published Skill runtime dependencies/);
    expect(ADR).toContain('Model training is deferred');
    expect(ADR).toContain('verified trajectories');
  });

  it('links the repository architecture to ADR 0016 without claiming a shipped State feature', () => {
    expect(ARCHITECTURE).toContain('ADR 0016');
    expect(ARCHITECTURE).toContain('architecture directions only');
    expect(ARCHITECTURE).toContain('do not add a state CLI');
    expect(ARCHITECTURE).not.toContain('state CLI is available');
  });
});
