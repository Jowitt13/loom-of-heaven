import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Supply-chain secret-leak gate (Phase 6 hardening).
 *
 * A dependency-free, fully offline scanner: it introduces no runtime or tooling
 * dependency and runs identically in local `verify:all` and in CI. It walks the
 * repository's git-tracked and not-yet-ignored files (so it honours .gitignore
 * exactly like the rest of the gate) and fails (non-zero exit) when a line
 * matches a high-confidence credential pattern, or a secret-named assignment
 * carries a high-entropy value.
 *
 * A dependency-free scanner is intentionally less exhaustive than gitleaks, so
 * two escape hatches keep it precise without disabling it:
 *   - a line containing `scan-secrets:ignore` (or `gitleaks:allow`) is skipped;
 *   - tools/scan-secrets.allowlist.json lists { path, rule?, reason } entries to
 *     silence a known, reviewed false positive.
 *
 * Flags:
 *   --all   also scan generated/lock artifacts that are skipped by default.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const scanAll = process.argv.slice(2).includes('--all');

// Machine-generated / vendored text that is noisy and never a place for a real
// credential. Skipped by default (override with --all). node_modules, dist and
// .tmp are already git-ignored, so they never reach the scanner.
const SKIP_FILES = new Set(
  ['pnpm-lock.yaml', 'tools/scan-secrets.ts', 'tools/scan-secrets.allowlist.json'].map((p) =>
    p.split('/').join(sep),
  ),
);
const SKIP_DIR_SEGMENTS = ['node_modules', '.git', 'dist', 'coverage', '.tmp'];

interface Rule {
  id: string;
  re: RegExp;
}
// High-confidence provider credentials — a match is almost certainly a real key.
const PATTERN_RULES: Rule[] = [
  { id: 'private-key', re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/ },
  { id: 'aws-access-key-id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'gcp-api-key', re: /\bAIza[0-9A-Za-z_\-]{35}\b/ },
  { id: 'github-token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{36}\b/ },
  { id: 'github-fine-grained-pat', re: /\bgithub_pat_[0-9A-Za-z_]{82}\b/ },
  { id: 'slack-token', re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
  {
    id: 'slack-webhook',
    re: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/,
  },
  { id: 'stripe-secret-key', re: /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}\b/ },
  { id: 'npm-token', re: /\bnpm_[0-9A-Za-z]{36}\b/ },
  { id: 'openai-key', re: /\bsk-(?:proj-)?[A-Za-z0-9_\-]{20,}\b/ },
  { id: 'google-oauth-token', re: /\bya29\.[0-9A-Za-z_\-]{20,}/ },
  { id: 'jwt', re: /\beyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/ },
];

// Generic "<secret-name> = <value>" assignment; the value is only flagged when
// it is long and high-entropy and does not look like a placeholder.
const KEY_VALUE_RE =
  /(?<key>pass(?:word|wd)?|secret|token|api[_-]?key|access[_-]?key|auth[_-]?token|credential|client[_-]?secret|private[_-]?key)["']?\s*[:=]\s*["'](?<val>[^"'\n]{20,200})["']/gi;
const PLACEHOLDER_RE =
  /(example|changeme|change[_-]?me|placeholder|redacted|your[_-]?|dummy|sample|fake|xxxx+|<[^>]+>|\{\{|%[a-z0-9_]+%|\$\{|\bnull\b|\bnone\b|\bunset\b)/i;

const shannon = (s: string): number => {
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of freq.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
};
const looksSecret = (v: string): boolean => {
  if (PLACEHOLDER_RE.test(v)) return false;
  if (/^[.\/~]|\s\//.test(v) || v.split('/').length > 3) return false; // path-ish
  if (/^\d+(\.\d+)+([-+].+)?$/.test(v)) return false; // version/semver
  if (/^[0-9a-f]{7,40}$/i.test(v) && v.length <= 40) return false; // short git sha / hex id
  return shannon(v) >= 3.5;
};

const redact = (s: string): string => {
  const t = s.length > 80 ? `${s.slice(0, 77)}…` : s;
  if (t.length <= 8) return `${t[0] ?? ''}****`;
  return `${t.slice(0, 4)}…${t.slice(-2)} (${s.length} chars)`;
};

// --- Allowlist (optional) ---
interface AllowEntry {
  path: string;
  rule?: string;
  reason?: string;
}
function loadAllowlist(): AllowEntry[] {
  const p = join(root, 'tools', 'scan-secrets.allowlist.json');
  if (!existsSync(p)) return [];
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8'));
    return Array.isArray(parsed) ? (parsed as AllowEntry[]) : [];
  } catch {
    process.stdout.write(
      '[WARN] tools/scan-secrets.allowlist.json is not valid JSON; ignoring it.\n',
    );
    return [];
  }
}
const allow = loadAllowlist();
const isAllowed = (relPath: string, rule: string): boolean =>
  allow.some((e) => e.path.split('/').join(sep) === relPath && (!e.rule || e.rule === rule));

// --- File list: git-tracked + untracked-not-ignored, else a filtered walk. ---
function listFiles(): string[] {
  const res = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status === 0 && typeof res.stdout === 'string') {
    return res.stdout.split('\0').filter((f) => f.length > 0);
  }
  process.stdout.write(
    '[WARN] `git ls-files` unavailable; falling back to a filtered directory walk.\n',
  );
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIR_SEGMENTS.includes(entry.name)) walk(join(dir, entry.name));
      } else if (entry.isFile()) {
        out.push(relative(root, join(dir, entry.name)).split(sep).join('/'));
      }
    }
  };
  walk(root);
  return out;
}

const isBinary = (buf: Buffer): boolean => {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
};

interface Finding {
  path: string;
  line: number;
  rule: string;
  preview: string;
}
const findings: Finding[] = [];
let scanned = 0;

for (const relPathRaw of listFiles()) {
  const relPath = relPathRaw.split('/').join(sep);
  const abs = join(root, relPath);
  if (!scanAll && SKIP_FILES.has(relPath)) continue;
  if (SKIP_DIR_SEGMENTS.some((d) => relPath.split(sep).includes(d))) continue;
  if (!existsSync(abs)) continue; // listed-but-deleted (git --others edge cases)

  let buf: Buffer;
  try {
    if (statSync(abs).size > 4 * 1024 * 1024) continue; // skip very large blobs
    buf = readFileSync(abs);
  } catch {
    continue;
  }
  if (isBinary(buf)) continue;
  scanned++;

  const posix = relPathRaw.split(sep).join('/');
  const lines = buf.toString('utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/scan-secrets:ignore|gitleaks:allow/.test(line)) continue;

    for (const rule of PATTERN_RULES) {
      const m = rule.re.exec(line);
      if (m && !isAllowed(posix, rule.id)) {
        findings.push({ path: posix, line: i + 1, rule: rule.id, preview: redact(m[0]) });
      }
    }

    KEY_VALUE_RE.lastIndex = 0;
    let gm: RegExpExecArray | null;
    while ((gm = KEY_VALUE_RE.exec(line)) !== null) {
      const val = gm.groups?.val ?? '';
      if (looksSecret(val) && !isAllowed(posix, 'high-entropy-assignment')) {
        findings.push({
          path: posix,
          line: i + 1,
          rule: 'high-entropy-assignment',
          preview: `${gm.groups?.key ?? 'secret'}=${redact(val)}`,
        });
      }
    }
  }
}

// --- Report ---
process.stdout.write(`Secret scan: inspected ${scanned} text file(s).\n`);
for (const f of findings) {
  process.stdout.write(`[FAIL] ${f.path}:${f.line} — ${f.rule}: ${f.preview}\n`);
}
if (findings.length > 0) {
  process.stdout.write(
    `\n${findings.length} potential secret(s) found. Remove the credential and rotate it,\n` +
      'or — if it is a reviewed false positive — add `scan-secrets:ignore` to the line or an\n' +
      'entry to tools/scan-secrets.allowlist.json.\n',
  );
  process.exit(1);
}
process.stdout.write('\n[PASS] no secrets detected in tracked files.\n');
