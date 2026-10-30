import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseNulSeparatedPaths, routeCiScope } from './ci-scope.ts';

describe('CI scope routing (shared implementation)', () => {
  // The six original behavior cases from the workflow-fragment test.
  it('routes a docs-only pull request to docs', () => {
    expect(routeCiScope('pull_request', ['docs/ARCHITECTURE.md'])).toBe('docs');
  });

  it('routes a core-plus-docs pull request to core', () => {
    expect(
      routeCiScope('pull_request', ['packages/ziwei/src/index.ts', 'docs/ARCHITECTURE.md']),
    ).toBe('core');
  });

  it('routes shared contract changes to full', () => {
    expect(
      routeCiScope('pull_request', [
        'packages/ziwei/src/index.ts',
        'packages/contracts/src/index.ts',
      ]),
    ).toBe('full');
  });

  it('routes psychology skill changes to full', () => {
    expect(routeCiScope('pull_request', ['skills/psychology-self-assessment/SKILL.md'])).toBe(
      'full',
    );
  });

  it('routes unknown paths conservatively to full', () => {
    expect(routeCiScope('pull_request', ['unknown-file'])).toBe('full');
  });

  it('keeps push events full even for docs-only paths', () => {
    expect(routeCiScope('push', ['docs/ARCHITECTURE.md'])).toBe('full');
  });

  // Priority and edge coverage required by the shared-implementation change.
  it('lets a full-triggering path win regardless of ordering', () => {
    expect(
      routeCiScope('pull_request', ['packages/ziwei/src/index.ts', '.github/workflows/verify.yml']),
    ).toBe('full');
    expect(
      routeCiScope('pull_request', ['.github/workflows/verify.yml', 'packages/ziwei/src/index.ts']),
    ).toBe('full');
  });

  it('keeps tooling and config patterns full', () => {
    for (const path of [
      'tools/build-psychology-host-packages.ts',
      'tools/ci-scope.ts',
      'eslint.config.js',
      'tsconfig.base.json',
      'package.json',
      'pnpm-lock.yaml',
      'AGENTS.md',
    ]) {
      expect(routeCiScope('pull_request', [path])).toBe('full');
    }
  });

  it('routes an empty change set to full so no check is skipped', () => {
    expect(routeCiScope('pull_request', [])).toBe('full');
  });

  it('treats unknown event names conservatively as full', () => {
    expect(routeCiScope('workflow_dispatch', ['docs/ARCHITECTURE.md'])).toBe('full');
    expect(routeCiScope('', ['docs/ARCHITECTURE.md'])).toBe('full');
  });

  it('keeps deeply nested paths matching by the original glob semantics', () => {
    expect(routeCiScope('pull_request', ['docs/guides/deep/nested.md'])).toBe('docs');
    expect(routeCiScope('pull_request', ['docs/file with space.md'])).toBe('docs');
    expect(routeCiScope('pull_request', ['skills/xuan-ji-yu-heng/references/deep/notes.md'])).toBe(
      'core',
    );
  });

  it('parses NUL-separated stdin lists with trailing separators and spaces intact', () => {
    expect(parseNulSeparatedPaths('docs/a.md\0docs/b.md\0')).toEqual(['docs/a.md', 'docs/b.md']);
    expect(parseNulSeparatedPaths('docs/a file.md\0')).toEqual(['docs/a file.md']);
    expect(parseNulSeparatedPaths('')).toEqual([]);
    expect(parseNulSeparatedPaths('\0\0')).toEqual([]);
  });
});

describe('CI workflow wiring', () => {
  it('runs the shared scope CLI from the Select checks step after the Node 24 setup', () => {
    const workflow = readFileSync(
      new URL('../.github/workflows/verify.yml', import.meta.url),
      'utf8',
    );
    // The workflow invokes this shared implementation...
    expect(workflow).toContain('node tools/ci-scope.ts');
    // ...and no longer embeds the routing globs inline (they live only here).
    expect(workflow).not.toContain('packages/personality-assessment/*');
    expect(workflow).not.toContain('tools/*psychology*');
    // The Select checks step is ordered after the Node 24 setup step.
    const setupIndex = workflow.indexOf('node-version: 24');
    const selectIndex = workflow.indexOf('Select checks');
    expect(setupIndex).toBeGreaterThan(-1);
    expect(selectIndex).toBeGreaterThan(setupIndex);
  });
});
