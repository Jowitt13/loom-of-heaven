import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractZipFileSafe } from './lib/zip.ts';

/**
 * Privacy incident scanner (permanent gate). Detects any occurrence of the incident's leaked PII
 * fields across tracked text, built/candidate ZIPs, the releases build dir, and — with --history —
 * every reachable Git blob. It is PRIVACY-SAFE BY CONSTRUCTION: the forbidden tokens are NEVER
 * committed. They are read at runtime from a gitignored local file `.tmp/incident-tokens.txt`
 * (one token per line). If that file is absent the scan FAILS CLOSED (never fail-open). Output is
 * limited to file paths + hit counts + a TOTAL; the matched values are NEVER printed.
 *
 * Usage:
 *   node tools/scan-incident.ts            # tracked text + release ZIPs + releases/ build dir
 *   node tools/scan-incident.ts --history  # every reachable Git blob (post-history-rewrite check)
 * Exit code is non-zero on any hit (or on a fail-closed missing token file).
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const TOKENS_FILE = join(root, '.tmp', 'incident-tokens.txt');
const TEXT_EXT = /\.(md|markdown|json|jsonc|ya?ml|js|mjs|cjs|ts|tsx|html?|txt|csv|svg|xml|toml)$/i;

interface Hit {
  path: string;
  count: number;
}

function loadTokens(): Buffer[] {
  if (!existsSync(TOKENS_FILE)) return [];
  return readFileSync(TOKENS_FILE, 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Buffer.from(s, 'utf8'));
}

/** Count total occurrences of every token in a buffer. Never returns or logs the matched bytes. */
function countHits(content: Buffer, tokens: Buffer[]): number {
  let n = 0;
  for (const t of tokens) {
    let i = content.indexOf(t);
    while (i !== -1) {
      n++;
      i = content.indexOf(t, i + t.length);
    }
  }
  return n;
}

function scanTracked(tokens: Buffer[]): Hit[] {
  const out: Hit[] = [];
  const ls = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
  for (const f of (ls.stdout ?? '').split(/\r?\n/).filter(Boolean)) {
    if (!TEXT_EXT.test(f)) continue;
    const abs = join(root, f);
    if (!existsSync(abs)) continue;
    const c = countHits(readFileSync(abs), tokens);
    if (c > 0) out.push({ path: f, count: c });
  }
  return out;
}

function walkText(dir: string, label: string, base: string, tokens: Buffer[], out: Hit[]): void {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) walkText(abs, label, base, tokens, out);
    else if (e.isFile() && TEXT_EXT.test(e.name)) {
      const c = countHits(readFileSync(abs), tokens);
      if (c > 0)
        out.push({ path: `${label}:${relative(base, abs).replace(/\\/g, '/')}`, count: c });
    }
  }
}

function scanZips(tokens: Buffer[]): Hit[] {
  const out: Hit[] = [];
  const relDir = join(root, 'releases');
  if (!existsSync(relDir)) return out;
  const zips: string[] = [];
  const findZips = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const abs = join(d, e.name);
      if (e.isDirectory()) findZips(abs);
      else if (e.name.endsWith('.zip')) zips.push(abs);
    }
  };
  findZips(relDir);
  for (const z of zips) {
    const tmp = mkdtempSync(join(tmpdir(), 'incident-zip-'));
    try {
      extractZipFileSafe(z, join(tmp, 'payload'));
      walkText(
        join(tmp, 'payload'),
        relative(root, z).replace(/\\/g, '/'),
        join(tmp, 'payload'),
        tokens,
        out,
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  return out;
}

/** Stream every reachable text-path blob via one `git cat-file --batch`; binary-safe buffer scan. */
function scanHistory(tokens: Buffer[]): Hit[] {
  const out: Hit[] = [];
  const objs = spawnSync('git', ['rev-list', '--objects', '--all'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  }).stdout;
  const wanted: { sha: string; path: string }[] = [];
  for (const line of (objs ?? '').split(/\r?\n/).filter(Boolean)) {
    const sp = line.indexOf(' ');
    if (sp < 0) continue;
    const path = line.slice(sp + 1);
    if (TEXT_EXT.test(path)) wanted.push({ sha: line.slice(0, sp), path });
  }
  if (wanted.length === 0) return out;
  const res = spawnSync('git', ['cat-file', '--batch'], {
    cwd: root,
    input: `${wanted.map((w) => w.sha).join('\n')}\n`,
    maxBuffer: 1 << 30,
  });
  const buf = res.stdout as Buffer;
  let pos = 0;
  let idx = 0;
  while (pos < buf.length && idx < wanted.length) {
    const nl = buf.indexOf(0x0a, pos);
    if (nl < 0) break;
    const header = buf.toString('utf8', pos, nl).split(' ');
    pos = nl + 1;
    if (header.length < 3) {
      idx++;
      continue;
    }
    const size = Number.parseInt(header[2]!, 10);
    if (Number.isNaN(size)) {
      idx++;
      continue;
    }
    const c = countHits(buf.subarray(pos, pos + size), tokens);
    if (c > 0)
      out.push({ path: `history:${wanted[idx]!.sha.slice(0, 12)}:${wanted[idx]!.path}`, count: c });
    pos += size + 1;
    idx++;
  }
  return out;
}

function main(): void {
  const historyMode = process.argv.includes('--history');
  const tokens = loadTokens();
  if (tokens.length === 0) {
    process.stderr.write(
      '[scan-incident] FAIL-CLOSED: .tmp/incident-tokens.txt not found or empty — privacy scan cannot run.\n',
    );
    process.exit(1);
  }

  const sections: { label: string; hits: Hit[] }[] = historyMode
    ? [{ label: 'git history (all reachable text blobs)', hits: scanHistory(tokens) }]
    : [
        { label: 'tracked text', hits: scanTracked(tokens) },
        { label: 'release/candidate ZIPs (extracted)', hits: scanZips(tokens) },
        { label: 'releases/ build dir', hits: [] as Hit[] },
      ];
  if (!historyMode)
    walkText(join(root, 'releases'), 'releases', join(root, 'releases'), tokens, sections[2]!.hits);

  let total = 0;
  for (const s of sections) {
    const n = s.hits.reduce((a, h) => a + h.count, 0);
    total += n;
    process.stdout.write(`[scan-incident] ${s.label}: ${n} hit(s) in ${s.hits.length} file(s)\n`);
    for (const h of s.hits) process.stdout.write(`   - ${h.path}: ${h.count}\n`);
  }
  process.stdout.write(
    `\n[scan-incident] TOTAL: ${total} hit(s); ${tokens.length} tokens loaded. (matched values never shown)\n`,
  );
  if (total > 0) process.exit(1);
}

main();
