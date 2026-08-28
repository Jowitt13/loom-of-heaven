import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Supply-chain dependency vulnerability gate (Phase 6 hardening).
 *
 * Validates a `pnpm audit --prod --json` document over the workspace's
 * PRODUCTION dependency tree — the code that actually ships in the Skill
 * bundle — and fails the gate (non-zero exit) when an advisory at or above
 * the configured severity is found. This tool never spawns a process and
 * never reads npm_execpath: the pnpm invocation lives only in the static,
 * variable-free `scan:deps` script (`pnpm audit --prod --json` piped into
 * `--audit-stdin`), and this tool owns parsing and judgment only. It adds NO
 * runtime dependency.
 *
 * Behaviour:
 *   - advisory >= --level found            -> [FAIL], exit 1
 *   - clean                                -> [PASS], exit 0
 *   - advisory service unreachable/offline -> [WARN], exit 0 in local
 *     non-strict mode, so offline dev workflows stay usable for diagnostics.
 *     Pass `--strict` (or set env `DEPENDENCY_AUDIT_STRICT=1`, which the CI
 *     verify job does) to turn an unreachable service into a hard failure.
 *     The fail-closed guarantee comes from that strict flag alone; the tool
 *     makes no assumption about network availability in CI or after any
 *     particular install step.
 *
 * Flags:
 *   --level <info|low|moderate|high|critical>  minimum severity to fail on (default: low)
 *   --strict                                   treat an unreachable service as a failure
 *   --audit-json <file>                        read a pre-captured `pnpm audit --json`
 *                                              document from a file (deterministic
 *                                              testing / CI debug)
 *   --audit-stdin                              read the `pnpm audit --json` document
 *                                              from stdin (the scan:deps script pipes it)
 *   --allowlist <file>                         override the default allowlist path
 *                                              (default: tools/scan-deps.allowlist.json).
 *                                              Used by isolated tests so they never write
 *                                              into the real repo path.
 *
 * Optional allowlist (tools/scan-deps.allowlist.json):
 *   [{ "id": <advisory id | GHSA-… | CVE-…>, "reason": "…", "expires": "YYYY-MM-DD" }]
 *   A matching, non-expired entry downgrades that advisory to a note (for issues
 *   with no available fix) so the gate can stay green without being disabled.
 *
 *   Expiry semantics are inclusive: an entry whose `expires` equals today (UTC,
 *   `YYYY-MM-DD`) is still valid; only entries whose `expires` is strictly before
 *   today are treated as expired. Expired entries are ignored — the advisory
 *   re-blocks — and are reported. Under --strict, expired entries fail the gate.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const SEVERITY_ORDER = ['info', 'low', 'moderate', 'high', 'critical'] as const;
type Severity = (typeof SEVERITY_ORDER)[number];
const rank = (s: string): number => {
  const i = SEVERITY_ORDER.indexOf(s.toLowerCase() as Severity);
  return i < 0 ? 0 : i;
};

// --- Args ---
const argv = process.argv.slice(2);
const getFlag = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const strict = argv.includes('--strict') || process.env.DEPENDENCY_AUDIT_STRICT === '1';
const levelArg = (getFlag('--level') ?? 'low').toLowerCase();
if (!SEVERITY_ORDER.includes(levelArg as Severity)) {
  process.stderr.write(
    `[FAIL] unknown --level "${levelArg}" (expected one of ${SEVERITY_ORDER.join(', ')})\n`,
  );
  process.exit(1);
}
const level = levelArg as Severity;
const auditJsonFile = getFlag('--audit-json');
const auditStdin = argv.includes('--audit-stdin');
const allowlistArg = getFlag('--allowlist');

// --- Audit input: a captured document (testing) or a live `pnpm audit` run. ---
interface Advisory {
  id?: number | string;
  github_advisory_id?: string;
  module_name?: string;
  severity?: string;
  title?: string;
  url?: string;
  vulnerable_versions?: string;
  cves?: string[];
}
interface AuditReport {
  advisories?: Record<string, Advisory> | Advisory[];
  metadata?: { vulnerabilities?: Record<string, number> };
}

/** Shared strict input parsing for the audit document (file or stdin). */
function parseAuditDocument(
  raw: string,
  source: string,
): { report?: AuditReport; error?: string; fatal?: boolean } {
  if (raw.trim().length === 0) {
    return { error: `${source} was empty or whitespace-only`, fatal: true };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: `${source} was not parseable JSON`, fatal: true };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      error: `${source} is not a pnpm audit JSON document (expected an object)`,
      fatal: true,
    };
  }
  return { report: parsed as AuditReport };
}

function loadAudit(): { report?: AuditReport; error?: string; fatal?: boolean } {
  if (auditJsonFile && auditStdin) {
    return {
      error: 'choose exactly one audit input: --audit-json or --audit-stdin',
      fatal: true,
    };
  }
  if (auditJsonFile) {
    const p =
      auditJsonFile.startsWith('/') || /^[A-Za-z]:/.test(auditJsonFile)
        ? auditJsonFile
        : join(root, auditJsonFile);
    if (!existsSync(p)) return { error: `--audit-json file not found: ${relative(root, p)}` };
    return parseAuditDocument(readFileSync(p, 'utf8'), `--audit-json file ${relative(root, p)}`);
  }
  if (!auditStdin) {
    return {
      error:
        'no audit input — run this tool through the scan:deps script (which pipes ' +
        '`pnpm audit --prod --json` into --audit-stdin) or pass --audit-json <file>',
      fatal: true,
    };
  }
  // `pnpm audit` exits non-zero when advisories are found but still prints the
  // full JSON document, so the piped verifier — not the pnpm exit code — owns
  // the final gate decision. Empty, whitespace-only, non-JSON, and structurally
  // invalid stdin all fail closed in every mode; no raw input is echoed.
  let raw: string;
  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    return { error: 'could not read the audit document from stdin', fatal: true };
  }
  return parseAuditDocument(raw, 'stdin');
}

// --- Allowlist (optional) ---
interface AllowEntry {
  id: number | string;
  reason?: string;
  expires?: string;
}
const today = new Date().toISOString().slice(0, 10);

/** Resolve the allowlist file path. --allowlist wins over the default; a value that
 *  is not an absolute path is resolved relative to repo root (same rule as --audit-json). */
function resolveAllowlistPath(): string {
  if (allowlistArg) {
    return allowlistArg.startsWith('/') || /^[A-Za-z]:/.test(allowlistArg)
      ? allowlistArg
      : join(root, allowlistArg);
  }
  return join(root, 'tools', 'scan-deps.allowlist.json');
}

/** True iff `s` is a syntactically well-formed YYYY-MM-DD AND a real calendar date.
 *  E.g. rejects `2025-13-01` and `2025-02-30`. */
function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function loadAllowlist(): AllowEntry[] {
  const p = resolveAllowlistPath();
  const label = relative(root, p) || p;
  if (!existsSync(p)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    if (strict) {
      process.stdout.write(`[FAIL] ${label} is not valid JSON.\n`);
      process.exit(1);
    }
    process.stdout.write(`[WARN] ${label} is not valid JSON; ignoring it.\n`);
    return [];
  }
  if (!Array.isArray(parsed)) {
    if (strict) {
      process.stdout.write(`[FAIL] ${label} must be a JSON array.\n`);
      process.exit(1);
    }
    process.stdout.write(`[WARN] ${label} is not an array; ignoring it.\n`);
    return [];
  }
  // Strict validation of each entry.
  //
  // Expiry semantics are inclusive of today: `expires === today` is still valid;
  // only `expires < today` (both YYYY-MM-DD, so ordinary lexicographic string
  // comparison is a correct date comparison) is expired. Tests exercise the
  // today-boundary and today-minus-one-day cases explicitly.
  if (strict) {
    const seenIds = new Set<string>();
    for (let i = 0; i < parsed.length; i++) {
      const e = parsed[i] as Record<string, unknown>;
      if (typeof e !== 'object' || e === null || Array.isArray(e)) {
        process.stdout.write(`[FAIL] allowlist entry [${i}] is not an object.\n`);
        process.exit(1);
      }
      // String id 必须 trim 后仍非空——纯空白当作缺失 id。整数 number 保持不变。
      const idOk =
        (typeof e.id === 'string' && e.id.trim().length > 0) ||
        (typeof e.id === 'number' && Number.isInteger(e.id));
      if (!idOk) {
        process.stdout.write(`[FAIL] allowlist entry [${i}] missing or invalid "id".\n`);
        process.exit(1);
      }
      if (typeof e.reason !== 'string' || e.reason.trim().length === 0) {
        process.stdout.write(`[FAIL] allowlist entry [${i}] missing or empty "reason".\n`);
        process.exit(1);
      }
      if (typeof e.expires !== 'string' || !isRealDate(e.expires)) {
        process.stdout.write(
          `[FAIL] allowlist entry [${i}] missing or malformed "expires" (need real YYYY-MM-DD date).\n`,
        );
        process.exit(1);
      }
      const idKey = String(e.id);
      if (seenIds.has(idKey)) {
        process.stdout.write(`[FAIL] allowlist has duplicate id "${idKey}".\n`);
        process.exit(1);
      }
      seenIds.add(idKey);
      if (e.expires < today) {
        process.stdout.write(
          `[FAIL] allowlist entry "${idKey}" expired on ${e.expires as string}; strict mode rejects expired entries.\n`,
        );
        process.exit(1);
      }
    }
  }
  return parsed as AllowEntry[];
}
function allowMatch(adv: Advisory, allow: AllowEntry[]): AllowEntry | undefined {
  const ids = [adv.id, adv.github_advisory_id, ...(adv.cves ?? [])]
    .filter((v): v is string | number => v !== undefined)
    .map(String);
  // Inclusive today: `expires === today` still matches; only `expires < today`
  // is considered expired and no longer suppresses the advisory.
  return allow.find((e) => {
    if (!ids.includes(String(e.id))) return false;
    if (e.expires && e.expires < today) return false;
    return true;
  });
}

// --- Run ---
process.stdout.write(
  strict
    ? '[STRICT] Dependency audit (fail-closed mode).\n'
    : '[LOCAL DIAGNOSTIC] Dependency audit (offline-safe mode).\n',
);
const { report, error, fatal } = loadAudit();

if (!report) {
  const msg = error ?? 'unknown audit failure';
  if (strict || fatal) {
    process.stdout.write(`[FAIL] dependency audit could not run: ${msg}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `[WARN] dependency audit could not run: ${msg}\n` +
      '       Skipping the vulnerability gate for this LOCAL diagnostic run.\n' +
      '       CI runs with `DEPENDENCY_AUDIT_STRICT=1`, so an unreachable\n' +
      '       advisory service is a hard failure there — the fail-closed\n' +
      '       guarantee is the strict env, not an implicit "CI has network".\n',
  );
  process.exit(0);
}

const rawAdvisories = report.advisories ?? {};
const advisories: Advisory[] = Array.isArray(rawAdvisories)
  ? rawAdvisories
  : Object.values(rawAdvisories);
const allow = loadAllowlist();

const blocking: Advisory[] = [];
const allowed: { adv: Advisory; entry: AllowEntry }[] = [];
const expiredAllows: AllowEntry[] = [];

for (const adv of advisories) {
  if (rank(adv.severity ?? 'info') < rank(level)) continue; // below the gate threshold
  const match = allowMatch(adv, allow);
  if (match) {
    allowed.push({ adv, entry: match });
  } else {
    // Report an expired allow entry that WOULD have matched, for visibility.
    const ids = [adv.id, adv.github_advisory_id, ...(adv.cves ?? [])].filter(Boolean).map(String);
    const expired = allow.find((e) => ids.includes(String(e.id)) && e.expires && e.expires < today);
    if (expired) expiredAllows.push(expired);
    blocking.push(adv);
  }
}

// --- Report ---
const counts = report.metadata?.vulnerabilities ?? {};
const countStr = SEVERITY_ORDER.map((s) => `${s} ${counts[s] ?? 0}`).join(', ');
process.stdout.write(`Dependency audit (pnpm audit --prod), fail level: ${level}.\n`);
process.stdout.write(`Advisory counts: ${countStr}.\n`);

const describe = (a: Advisory): string =>
  `${a.module_name ?? '?'} — ${a.severity ?? '?'} — ${a.title ?? 'advisory'}` +
  `${a.github_advisory_id ? ` (${a.github_advisory_id})` : ''}` +
  `${a.vulnerable_versions ? ` [${a.vulnerable_versions}]` : ''}`;

for (const { adv, entry } of allowed) {
  process.stdout.write(
    `[NOTE] allowlisted (${entry.reason ?? 'no reason given'}): ${describe(adv)}\n`,
  );
}
for (const e of expiredAllows) {
  process.stdout.write(
    `[WARN] allowlist entry for "${e.id}" expired on ${e.expires}; it no longer suppresses the advisory.\n`,
  );
}
for (const adv of blocking) {
  process.stdout.write(`[FAIL] ${describe(adv)}\n`);
  if (adv.url) process.stdout.write(`       ${adv.url}\n`);
}

if (blocking.length > 0) {
  process.stdout.write(
    `\n${blocking.length} blocking advisory(ies) at or above "${level}". ` +
      'Update or remove the affected production dependency, or add a justified,\n' +
      'time-boxed entry to tools/scan-deps.allowlist.json if there is no fix yet.\n',
  );
  process.exit(1);
}

process.stdout.write(
  `\n[PASS] no production advisories at or above "${level}"` +
    `${allowed.length > 0 ? ` (${allowed.length} allowlisted)` : ''}.\n`,
);
