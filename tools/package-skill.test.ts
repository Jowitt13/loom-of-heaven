import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { packageSkill } from './package-skill.ts';
import { listZipEntries } from './lib/zip.ts';

describe('packageSkill local-runtime hygiene', () => {
  it('never stages .mimosa data into the install zip while keeping normal Skill content', () => {
    const work = mkdtempSync(join(tmpdir(), 'loom-package-skill-'));
    try {
      const srcSkill = join(work, 'skill-src');
      mkdirSync(join(srcSkill, 'scripts', 'dist'), { recursive: true });
      mkdirSync(join(srcSkill, 'references'), { recursive: true });
      writeFileSync(join(srcSkill, 'SKILL.md'), '# Synthetic Skill\n');
      writeFileSync(join(srcSkill, 'LICENSE'), 'MIT\n');
      writeFileSync(join(srcSkill, 'scripts', 'dist', 'engine.mjs'), 'export const x = 1;\n');
      writeFileSync(join(srcSkill, 'scripts', 'loom-chart.mjs'), '#!/usr/bin/env node\n');
      writeFileSync(join(srcSkill, 'references', 'answer-contract.md'), '# contract\n');

      // Synthetic local Mimosa runtime sentinels at the Skill root and nested
      // one level down: neither may reach the staged folder or the archive.
      mkdirSync(join(srcSkill, '.mimosa', 'history'), { recursive: true });
      writeFileSync(join(srcSkill, '.mimosa', 'history', 'run-sentinel.json'), '{}\n');
      mkdirSync(join(srcSkill, 'references', '.mimosa'), { recursive: true });
      writeFileSync(join(srcSkill, 'references', '.mimosa', 'sentinel.json'), '{}\n');

      const outDir = join(work, 'dist');
      const count = packageSkill(srcSkill, outDir, 'synthetic-skill');
      expect(count).toBeGreaterThan(0);

      // Entry naming follows the existing dist archive layout (the pkgName prefix
      // is applied on top of paths already relative to outDir).
      const zip = readFileSync(join(outDir, 'synthetic-skill.zip'));
      const entries = listZipEntries(zip);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries).toContain('synthetic-skill/synthetic-skill/SKILL.md');
      expect(entries).toContain('synthetic-skill/synthetic-skill/LICENSE');
      expect(entries).toContain('synthetic-skill/synthetic-skill/scripts/dist/engine.mjs');
      expect(entries).toContain('synthetic-skill/synthetic-skill/references/answer-contract.md');
      for (const name of entries) {
        expect(name.includes('.mimosa')).toBe(false);
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
