import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

const workflow = readFileSync(new URL('../.github/workflows/verify.yml', import.meta.url), 'utf8');
const block = workflow.split('        run: |\n')[1]!.split('      - uses:')[0]!;
const script = block
  .split('\n')
  .map((line) => line.slice(10))
  .join('\n');

it('routes actual workflow scope selection conservatively and keeps main full', () => {
  const dir = mkdtempSync(join(tmpdir(), 'loom-scope-'));
  try {
    for (const [event, paths, expected] of [
      ['pull_request', 'docs/ARCHITECTURE.md', 'docs'],
      ['pull_request', 'packages/ziwei/src/index.ts\ndocs/ARCHITECTURE.md', 'core'],
      ['pull_request', 'packages/ziwei/src/index.ts\npackages/contracts/src/index.ts', 'full'],
      ['pull_request', 'skills/psychology-self-assessment/SKILL.md', 'full'],
      ['pull_request', 'unknown-file', 'full'],
      ['push', 'docs/ARCHITECTURE.md', 'full'],
    ]) {
      const output = join(dir, 'output');
      const run = spawnSync(
        process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash',
        ['-e', '-c', 'git() { printf "%s\\n" "$CHANGED_PATHS"; }\n' + script],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            EVENT: event,
            BASE: 'base',
            CHANGED_PATHS: paths,
            GITHUB_OUTPUT: output,
          },
        },
      );
      expect(run.status, run.stderr).toBe(0);
      expect(readFileSync(output, 'utf8').trim().split('\n').at(-1)).toBe('mode=' + expected);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
