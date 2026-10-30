import { pathToFileURL } from 'node:url';

/**
 * Shared CI scope routing (used by `.github/workflows/verify.yml` and its unit
 * tests). Deterministic pure classification of a change set into exactly one of
 * `docs` / `core` / `full`, preserving the original workflow's path ranges and
 * priority: a full-triggering path wins immediately regardless of order; a
 * core-triggering path upgrades `docs` to `core` while scanning continues;
 * unknown events, unknown paths, and empty change sets conservatively select
 * `full` so no necessary check is ever skipped.
 */

export type CiScopeMode = 'docs' | 'core' | 'full';

/** Shell-`case`-style globs: `*` matches any characters, including `/`. */
function globToRegExp(glob: string): RegExp {
  const source = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${source}$`);
}

const FULL_TRIGGERS = [
  'packages/personality-assessment/*',
  'packages/psychology-contracts/*',
  'skills/psychology-self-assessment/*',
  'tools/*psychology*',
  'packages/contracts/*',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.github/*',
  'tools/*',
  'AGENTS.md',
  'tsconfig*',
  'eslint*',
].map(globToRegExp);

const CORE_TRIGGERS = ['packages/*', 'skills/xuan-ji-yu-heng/*', 'evals/*', 'examples/*'].map(
  globToRegExp,
);

/** Docs-only paths leave the current mode unchanged (original empty `case` arm). */
const DOCS_NEUTRAL = ['docs/*', 'README.md', 'README.en.md'].map(globToRegExp);

/** Pure scope routing: event name plus changed paths -> docs / core / full. */
export function routeCiScope(event: string, changedPaths: readonly string[]): CiScopeMode {
  if (event !== 'pull_request') return 'full';
  if (changedPaths.length === 0) return 'full';
  let mode: CiScopeMode = 'docs';
  for (const path of changedPaths) {
    if (FULL_TRIGGERS.some((pattern) => pattern.test(path))) return 'full';
    if (CORE_TRIGGERS.some((pattern) => pattern.test(path))) {
      mode = 'core';
      continue;
    }
    if (DOCS_NEUTRAL.some((pattern) => pattern.test(path))) continue;
    // A path outside every known range is conservative full (original `*)` arm).
    return 'full';
  }
  return mode;
}

/**
 * Parse the CLI's NUL-separated path list. Trailing separators are tolerated
 * (dropped as empty entries); spaces inside paths are preserved as-is because
 * NUL separation never word-splits.
 */
export function parseNulSeparatedPaths(input: string): string[] {
  if (input === '') return [];
  return input.split('\0').filter((path) => path !== '');
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/**
 * Thin CLI entry: reads EVENT from the environment and NUL-separated changed
 * paths from stdin, then prints exactly one `mode=<docs|core|full>` line. It
 * spawns no subprocesses, writes nothing to GITHUB_OUTPUT (the workflow owns
 * that), and never echoes paths or other environment values.
 */
async function runCli(): Promise<void> {
  const event = process.env.EVENT ?? '';
  const changedPaths = parseNulSeparatedPaths(await readStdin());
  process.stdout.write(`mode=${routeCiScope(event, changedPaths)}\n`);
}

// Only act when invoked as a script; importing the pure functions above must
// never read stdin or trigger CLI side effects.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli().catch((err: unknown) => {
    process.stderr.write(`${String(err)}\n`);
    process.exit(1);
  });
}
