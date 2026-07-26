import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Supply-chain dependency LICENSE gate (Phase 6 hardening).
 *
 * Enforces the docs/LICENSE_AUDIT.md policy over the workspace's PRODUCTION
 * dependency closure (the code that actually ships in the Skill bundle):
 * closed-source-friendly licenses only — no AGPL/GPL, no unknown provenance.
 * Reads `pnpm licenses list --prod --json` (local node_modules/lockfile, works
 * fully OFFLINE), so unlike scan-deps there is NO offline skip+warn path: any
 * tooling failure fails the gate (fail-closed).
 *
 * Also cross-checks the committed Skill SBOM (sbom.cdx.json): every component's
 * declared license must equal the license pnpm reports for that package, so a
 * dependency upgrade that changes a license can never hide behind a stale
 * hardcoded SBOM entry.
 *
 * Flags:
 *   --licenses-json <file>  read a pre-captured `pnpm licenses list --prod --json`
 *                           document instead of spawning pnpm (deterministic testing)
 *
 * Optional exception file (tools/scan-licenses.allowlist.json):
 *   [{ "name": <pkg>, "license": <spdx>, "reason": "…", "expires": "YYYY-MM-DD" }]
 *   A matching, non-expired entry downgrades that package to a note (e.g. an
 *   owner-approved dual-licensed dep). An expired entry is ignored — the package
 *   re-blocks — and is reported. Currently EMPTY by design.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/** docs/LICENSE_AUDIT.md policy: closed-source-friendly licenses only. */
const ALLOWED = new Set(['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD']);

/** A license string passes when it, or any side of a simple OR expression, is allowed. */
function licenseAllowed(expr: string | undefined): boolean {
  if (!expr) return false;
  const cleaned = expr.replace(/[()]/g, ' ').trim();
  if (cleaned === '') return false;
  return cleaned.split(/\s+OR\s+/i).some((part) => ALLOWED.has(part.trim()));
}

// --- Args ---
const argv = process.argv.slice(2);
const getFlag = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const licensesJsonFile = getFlag('--licenses-json');

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}
const checks: Check[] = [];
const add = (name: string, ok: boolean, detail?: string): void => {
  checks.push(detail === undefined ? { name, ok } : { name, ok, detail });
};

// --- Self-tests: prove the policy detector is non-trivial. ---
function selfTest(): void {
  add('[self-test] MIT 放行', licenseAllowed('MIT'));
  add('[self-test] (MIT OR Apache-2.0) 放行', licenseAllowed('(MIT OR Apache-2.0)'));
  add('[self-test] GPL-3.0 拦截', !licenseAllowed('GPL-3.0'));
  add('[self-test] AGPL-3.0-only 拦截', !licenseAllowed('AGPL-3.0-only'));
  add('[self-test] (GPL-2.0 OR MIT) 放行', licenseAllowed('(GPL-2.0 OR MIT)'));
  add('[self-test] 未知/缺失 license 拦截', !licenseAllowed(undefined) && !licenseAllowed(''));
  add('[self-test] Unknown 字面量拦截', !licenseAllowed('Unknown'));
}

// --- License report: a captured document (testing) or a live pnpm run. ---
interface LicensePkg {
  name: string;
  versions?: string[];
  license?: string;
}
type LicenseReport = Record<string, LicensePkg[]>;

function loadReport(): { report?: LicenseReport; error?: string } {
  if (licensesJsonFile) {
    const p = join(root, licensesJsonFile);
    if (!existsSync(p)) return { error: `--licenses-json file not found: ${relative(root, p)}` };
    try {
      // Tolerate a UTF-8 BOM in captured documents (some editors/shells add one).
      return {
        report: JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, '')) as LicenseReport,
      };
    } catch (e) {
      return { error: `could not parse ${relative(root, p)}: ${(e as Error).message}` };
    }
  }
  // Prefer the pnpm CLI entry that `pnpm run` exposes via npm_execpath (no shell);
  // fall back to a shell lookup only when invoked outside pnpm.
  const pnpmJs = process.env.npm_execpath;
  const res =
    pnpmJs && /\.[cm]?js$/.test(pnpmJs)
      ? spawnSync(process.execPath, [pnpmJs, 'licenses', 'list', '--prod', '--json'], {
          cwd: root,
          encoding: 'utf8',
          maxBuffer: 32 * 1024 * 1024,
        })
      : spawnSync('pnpm licenses list --prod --json', {
          cwd: root,
          encoding: 'utf8',
          shell: true,
          maxBuffer: 32 * 1024 * 1024,
        });
  try {
    return { report: JSON.parse(res.stdout ?? '') as LicenseReport };
  } catch {
    const why = res.error
      ? String(res.error)
      : (res.stderr || res.stdout || 'no JSON on stdout').trim();
    return { error: `pnpm licenses produced no parseable JSON — ${why.split('\n')[0]}` };
  }
}

// --- Exception file (optional; empty by design today). ---
interface AllowEntry {
  name: string;
  license?: string;
  reason?: string;
  expires?: string;
}
function loadExceptions(): AllowEntry[] {
  const p = join(root, 'tools', 'scan-licenses.allowlist.json');
  if (!existsSync(p)) return [];
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8'));
    return Array.isArray(parsed) ? (parsed as AllowEntry[]) : [];
  } catch {
    process.stdout.write(
      '[WARN] tools/scan-licenses.allowlist.json is not valid JSON; ignoring it.\n',
    );
    return [];
  }
}

function main(): void {
  selfTest();

  const { report, error } = loadReport();
  if (!report) {
    // Fail-closed: this scan needs no network, so a tooling failure is a real failure.
    process.stdout.write(`[FAIL] license scan could not run: ${error ?? 'unknown failure'}\n`);
    process.exit(1);
  }

  const packages: LicensePkg[] = [];
  for (const [license, pkgs] of Object.entries(report)) {
    for (const p of pkgs) packages.push({ ...p, license: p.license ?? license });
  }
  add('production closure is non-empty', packages.length > 0, `${packages.length} package(s)`);

  const exceptions = loadExceptions();
  const today = new Date().toISOString().slice(0, 10);

  for (const pkg of packages) {
    if (licenseAllowed(pkg.license)) continue;
    const exc = exceptions.find((e) => e.name === pkg.name && (!e.expires || e.expires >= today));
    if (exc) {
      process.stdout.write(
        `[NOTE] exception (${exc.reason ?? 'no reason given'}): ${pkg.name} — ${pkg.license}\n`,
      );
      continue;
    }
    const expired = exceptions.find((e) => e.name === pkg.name && e.expires && e.expires < today);
    add(
      `license allowed: ${pkg.name}`,
      false,
      `${pkg.license ?? 'unknown'}${expired ? ` (exception expired ${expired.expires})` : ''}`,
    );
  }
  const blocked = checks.filter((c) => !c.ok && c.name.startsWith('license allowed'));
  add(
    `all production licenses within policy (${[...ALLOWED].join(', ')})`,
    blocked.length === 0,
    `${packages.length} package(s) checked`,
  );

  // --- Cross-check: committed Skill SBOM license claims must match reality. ---
  const sbomPath = join(root, 'skills', 'calculate-birth-charts', 'sbom.cdx.json');
  const sbomText = existsSync(sbomPath) ? readFileSync(sbomPath, 'utf8') : null;
  add('skill sbom.cdx.json exists', sbomText !== null);
  if (sbomText !== null) {
    interface CdxComponent {
      name?: string;
      licenses?: { license?: { id?: string } }[];
    }
    const sbom = JSON.parse(sbomText) as { components?: CdxComponent[] };
    for (const comp of sbom.components ?? []) {
      const declared = comp.licenses?.[0]?.license?.id;
      const actual = packages.find((p) => p.name === comp.name)?.license;
      add(
        `sbom license matches installed reality: ${comp.name}`,
        declared !== undefined && declared === actual,
        `sbom=${declared ?? '?'} installed=${actual ?? 'not in prod closure'}`,
      );
    }
  }

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    process.stdout.write(
      `[${c.ok ? 'PASS' : 'FAIL'}] ${c.name}${c.detail ? ` (${c.detail})` : ''}\n`,
    );
  }
  process.stdout.write(
    `\n${checks.length - failed.length}/${checks.length} license checks passed.\n`,
  );
  if (failed.length > 0) {
    process.stdout.write(
      'A production dependency is outside the docs/LICENSE_AUDIT.md policy (or the SBOM\n' +
        'claim drifted). Remove/replace the dependency, fix the SBOM from a real build, or\n' +
        'add a justified, time-boxed entry to tools/scan-licenses.allowlist.json.\n',
    );
    process.exit(1);
  }
}

main();
