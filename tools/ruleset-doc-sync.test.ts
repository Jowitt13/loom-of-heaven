import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ChartBundleEnvelope,
  parseBirthInput,
  WESTERN_RULESET_CURRENT,
  WESTERN_RULESET_RETIRED,
} from '../packages/contracts/src/index.ts';
import { calculate } from '../packages/orchestrator/src/index.ts';

/**
 * Active documentation and committed examples must follow the runtime ruleset contract. Historical
 * migration notes are intentionally outside this list: they must continue to name retired ids.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string): string => readFileSync(join(root, relativePath), 'utf8');
const ACTIVE_RULESET_DOCS = [
  'skills/xuan-ji-yu-heng/references/input-contract.md',
  'skills/xuan-ji-yu-heng/references/rulesets.md',
  'docs/RULESETS.md',
];
const ALL_SYSTEMS = ['western', 'bazi', 'ziwei', 'vedic'];
const FIXED_NOW = Date.parse('2026-01-01T00:00:00Z');

describe('ruleset documentation and examples stay synchronized with the engine', () => {
  it('uses the current Western ruleset in every active reference', () => {
    for (const relativePath of ACTIVE_RULESET_DOCS) {
      const text = read(relativePath);
      expect(text, `${relativePath} must state the current Western ruleset`).toContain(
        WESTERN_RULESET_CURRENT,
      );
      for (const retired of WESTERN_RULESET_RETIRED) {
        expect(
          text,
          `${relativePath} may describe ${retired} only as retired, never as an active default`,
        ).not.toMatch(new RegExp(`(?:defaults|default)[^\\n]*${retired}`, 'i'));
      }
    }
  });

  it('keeps the committed end-to-end input viable with the current four-system default', () => {
    const input = parseBirthInput(JSON.parse(read('examples/birth-input.json')));
    expect(input.settings.systems).toEqual(ALL_SYSTEMS);
    expect(input.settings.western.rulesetId).toBe(WESTERN_RULESET_CURRENT);

    const bundle = calculate(input, { now: FIXED_NOW });
    expect(bundle.western?.rulesetId).toBe(WESTERN_RULESET_CURRENT);
    expect(bundle.vedic).toBeDefined();
  });

  it('keeps the committed chart example aligned with its runnable input', () => {
    const example = ChartBundleEnvelope.parse(JSON.parse(read('examples/chart.json')));
    expect(example.bundle.originalInput.settings.systems).toEqual(ALL_SYSTEMS);
    expect(example.bundle.originalInput.settings.western.rulesetId).toBe(WESTERN_RULESET_CURRENT);
    expect(example.bundle.western?.rulesetId).toBe(WESTERN_RULESET_CURRENT);
    expect(example.bundle.vedic).toBeDefined();
  });
});
