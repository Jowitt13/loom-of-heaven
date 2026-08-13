import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const p1Packages = ['packages/psychology-contracts', 'packages/personality-assessment'];

function sourceFiles(relativeDir: string): string[] {
  const absoluteDir = join(root, relativeDir);
  return readdirSync(absoluteDir, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(relative);
    return entry.name.endsWith('.ts') ? [relative] : [];
  });
}

describe('psychology P1 import and content firewall', () => {
  it('does not allow P1 packages to import chart or clinical packages', () => {
    const forbidden =
      /@loom\/(?:bazi|bazi-rules|contracts|interpret|synastry|time-location|vedic|vedic-rules|western|western-rules|ziwei|ziwei-rules|mental-health-[\w-]+)/;
    const offenders = p1Packages.flatMap((pkg) =>
      sourceFiles(`${pkg}/src`).filter((file) =>
        forbidden.test(readFileSync(join(root, file), 'utf8')),
      ),
    );
    expect(offenders, `P1 crossed a package boundary: ${offenders.join(', ')}`).toEqual([]);
  });

  it('keeps source-bound item content inside its assessment package and exposes only the P9 nonclinical Skill', () => {
    const instrumentNames = /PHQ-9|GAD-7|ASRS|PC-PTSD|PCL-5|PID-5|IPIP-NEO|C-SSRS/i;
    const p3InstrumentFiles = new Set([
      'packages/personality-assessment/src/index.ts',
      'packages/personality-assessment/src/ipip-neo-120-zh-CN.ts',
      'packages/personality-assessment/src/ipip-neo-120.ts',
      'packages/personality-assessment/src/skill-entry.ts',
    ]);
    const offenders = p1Packages.flatMap((pkg) =>
      sourceFiles(`${pkg}/src`).filter(
        (file) =>
          !p3InstrumentFiles.has(file) &&
          instrumentNames.test(readFileSync(join(root, file), 'utf8')),
      ),
    );
    expect(offenders, `instrument content escaped its P3 package: ${offenders.join(', ')}`).toEqual(
      [],
    );
    const skill = readFileSync(join(root, 'skills/psychology-self-assessment/SKILL.md'), 'utf8');
    const cli = readFileSync(
      join(root, 'skills/psychology-self-assessment/scripts/psychology.mjs'),
      'utf8',
    );
    expect(skill).not.toMatch(/PHQ-9|GAD-7|ASRS|PC-PTSD|PCL-5|PID-5|C-SSRS/i);
    expect(cli).not.toMatch(
      /loom-chart\.mjs|@loom\/(?:bazi|interpret|synastry|time-location|vedic|western|ziwei)/i,
    );
    expect(readdirSync(join(root, 'skills/psychology-self-assessment'))).toContain('SKILL.md');
  });
});
