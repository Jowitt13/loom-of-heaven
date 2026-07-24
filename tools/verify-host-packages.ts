import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANDIDATE_DIR, CANDIDATE_RELEASE_VERSION, HOSTS } from './lib/host-config.ts';
import { assertSingleTopDir, buildZip, extractZip, listZipEntries } from './lib/zip.ts';

/**
 * Verify the CANDIDATE host release bundles by inspecting the REAL zip archives (not the
 * staging folders): list zip entries, assert a single top-level directory with no
 * double-nesting, extract to a temp dir, and run doctor/verify/calculate from the
 * EXTRACTED path — proving the shipped structure is importable and that its engine is
 * byte-identical to the canonical engine. Includes a negative self-test so the structure
 * checker is proven non-trivial (an old double-nested layout must FAIL).
 *
 * Reads `releases/<CANDIDATE_DIR>/` (gitignored). Exits non-zero on any failure.
 * Requires `pnpm run package:hosts` first.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const srcSkill = join(root, 'skills', 'calculate-birth-charts');
const candidateDir = join(root, 'releases', CANDIDATE_DIR);
const FIXED_NOW = '2026-01-01T00:00:00Z';

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}
const checks: Check[] = [];
const add = (name: string, ok: boolean, detail?: string): void => {
  checks.push(detail === undefined ? { name, ok } : { name, ok, detail });
};

function runNode(cwd: string, args: string[]): { code: number; stdout: string } {
  const res = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
  return { code: res.status ?? -1, stdout: res.stdout ?? '' };
}

const REF_RE = /(?:scripts|references|assets)\/[A-Za-z0-9._\-/]+/g;
const ABS_PATH_RE = /(?:[A-Za-z]:\\Users\\|\/Users\/|\/home\/)/;
const KNOWN_COMMANDS = ['doctor', 'normalize', 'calculate', 'interpret', 'synastry', 'verify'];

function selfTest(): void {
  const pkg = 'calculate-birth-charts';
  const good = [`${pkg}/SKILL.md`, `${pkg}/scripts/ming-chart.mjs`];
  const bad = [`${pkg}/${pkg}/SKILL.md`, `${pkg}/${pkg}/scripts/ming-chart.mjs`];
  add('[self-test] 单层结构通过', assertSingleTopDir(good, pkg).ok === true);
  add('[self-test] 双层目录被拒(负例)', assertSingleTopDir(bad, pkg).ok === false);
  // Round-trip a synthesized double-nested zip through listZipEntries -> must be rejected.
  const badZip = buildZip([{ name: `${pkg}/${pkg}/SKILL.md`, data: Buffer.from('x') }]);
  add(
    '[self-test] 双层 ZIP 经 listZipEntries 被拒',
    assertSingleTopDir(listZipEntries(badZip), pkg).ok === false,
    assertSingleTopDir(listZipEntries(badZip), pkg).error,
  );
}

function main(): void {
  if (!existsSync(candidateDir)) {
    process.stderr.write(`${candidateDir} missing. Run \`pnpm run package:hosts\` first.\n`);
    process.exit(1);
  }

  selfTest();

  const tmpRoots: string[] = [];
  for (const h of HOSTS) {
    const asset = h.releaseAsset ?? `${h.packageName}.zip`;
    const zipPath = join(candidateDir, h.id, asset);
    add(`[${h.id}] zip exists`, existsSync(zipPath), zipPath);
    if (!existsSync(zipPath)) continue;

    // 1-4. Real ZIP structure: single top dir == packageName, packageName/SKILL.md, no double-nest.
    const zipBuf = readFileSync(zipPath);
    const entries = listZipEntries(zipBuf);
    const struct = assertSingleTopDir(entries, h.packageName);
    add(`[${h.id}] ZIP 单一顶层目录且无双层`, struct.ok, struct.error);
    add(
      `[${h.id}] ZIP 含 ${h.packageName}/SKILL.md`,
      entries.includes(`${h.packageName}/SKILL.md`),
    );
    if (h.capability !== 'reading-lite') {
      add(
        `[${h.id}] ZIP 含 ${h.packageName}/scripts/ming-chart.mjs`,
        entries.includes(`${h.packageName}/scripts/ming-chart.mjs`),
      );
      add(
        `[${h.id}] ZIP 含 ${h.packageName}/scripts/dist/engine.mjs`,
        entries.includes(`${h.packageName}/scripts/dist/engine.mjs`),
      );
    }
    // No leaked source/tests/node_modules/.git anywhere in the archive.
    const leaked = entries.find((e) =>
      /(^|\/)(node_modules|packages|\.git|tests?)(\/|$)/.test(e.slice(h.packageName.length + 1)),
    );
    add(`[${h.id}] ZIP 无 node_modules/packages/.git/tests`, leaked === undefined, leaked);

    // 5. Extract the REAL zip to a temp dir and work from the extracted path.
    const tmp = mkdtempSync(join(tmpdir(), `ming-verify-${h.id}-`));
    tmpRoots.push(tmp);
    extractZip(zipBuf, tmp);
    const pkgRoot = join(tmp, h.packageName);
    add(`[${h.id}] 解压后 ${h.packageName}/ 存在`, existsSync(pkgRoot));

    // SKILL.md + metadata from the EXTRACTED files.
    const skillMd = join(pkgRoot, 'SKILL.md');
    const md = existsSync(skillMd) ? readFileSync(skillMd, 'utf8') : '';
    const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    const name = fm?.[1]?.match(/(^|\n)name:\s*(.+)/)?.[2]?.trim() ?? '';
    add(
      `[${h.id}] SKILL.md name 符合 Qoder 约束`,
      /^[a-z0-9-]+$/.test(name) && name.length <= 64,
      name,
    );
    const bmPath = join(pkgRoot, 'BUILD_MANIFEST.json');
    if (existsSync(bmPath)) {
      const m = JSON.parse(readFileSync(bmPath, 'utf8')) as Record<string, unknown>;
      add(
        `[${h.id}] BUILD_MANIFEST 有 engineVersion+releaseVersion+capability`,
        typeof m.engineVersion === 'string' &&
          typeof m.releaseVersion === 'string' &&
          m.capability === h.capability,
      );
    } else {
      add(`[${h.id}] BUILD_MANIFEST.json 存在`, false);
    }

    // Required runtime files present in the extracted package.
    const requiredFiles =
      h.capability === 'reading-lite'
        ? ['LICENSE', 'INSTALL.md']
        : ['scripts/ming-chart.mjs', 'scripts/dist/engine.mjs', 'LICENSE', 'INSTALL.md'];
    for (const f of requiredFiles) add(`[${h.id}] 解压后含 ${f}`, existsSync(join(pkgRoot, f)));

    // 8. Every SKILL.md-referenced file exists in the extracted package.
    const refs = Array.from(new Set(md.match(REF_RE) ?? []));
    const missing = refs.filter((r) => !existsSync(join(pkgRoot, r)));
    add(`[${h.id}] SKILL.md 引用文件均存在`, missing.length === 0, missing.join(', '));

    add(`[${h.id}] SKILL.md 无非 Windows 安全路径`, !ABS_PATH_RE.test(md));

    const installMd = existsSync(join(pkgRoot, 'INSTALL.md'))
      ? readFileSync(join(pkgRoot, 'INSTALL.md'), 'utf8')
      : '';
    add(
      `[${h.id}] INSTALL.md 提到真实命令`,
      KNOWN_COMMANDS.some((c) => installMd.includes(c)),
    );
    if (h.capability !== 'reading-lite') {
      // A full package's INSTALL.md must NOT carry reading-lite wording.
      const liteLeak = [
        'reading-lite',
        '需外部 facts',
        '不能自行排盘',
        'reading-lite-input.md',
      ].filter((w) => installMd.includes(w));
      add(`[${h.id}] full 包 INSTALL.md 无 lite 文案`, liteLeak.length === 0, liteLeak.join(','));
    }

    if (h.id === 'qoder') {
      // Round 13: the shipped Qoder INSTALL.md must describe an Agent FILE-install to
      // ~/.qoder/skills — NO command-line install path — with the full safe sequence.
      const cliTerms = [
        /qodercli/i,
        /Qoder\s*CLI/i,
        /Skills\s*CLI/i,
        /npx\s+skills/i,
        /@qoder-ai/i,
        /方式一[（(]命令行/,
        /\/skills\s*安装/,
      ];
      const cliHit = cliTerms.filter((re) => re.test(installMd)).map((re) => re.source);
      add(`[qoder] ZIP INSTALL.md 无 CLI 文案`, cliHit.length === 0, cliHit.join(' | '));
      add(
        `[qoder] ZIP INSTALL.md 以 Agent 写入 ~/.qoder/skills 为首选`,
        installMd.includes('~/.qoder/skills') &&
          (installMd.includes('仅替换') || installMd.includes('只替换')),
      );
      add(`[qoder] ZIP INSTALL.md 声明 Node.js ≥ 22`, /Node(\.js)?\s*[>≥]=?\s*22/.test(installMd));
      const seqMiss = ['下载', 'SHA-256', '临时', '替换'].filter((s) => !installMd.includes(s));
      const singleLayer = installMd.includes('单层') || installMd.includes('顶层目录');
      const refresh = installMd.includes('刷新') || installMd.includes('重启');
      const hasVerify = installMd.includes('verify') || installMd.includes('自检');
      add(
        `[qoder] ZIP INSTALL.md 含完整安装顺序(下载→SHA→单层→临时→仅替换→刷新/重启→verify)`,
        seqMiss.length === 0 && singleLayer && refresh && hasVerify,
        `missing:${seqMiss.join(',')} singleLayer=${singleLayer} refresh=${refresh} verify=${hasVerify}`,
      );
      add(`[qoder] ZIP INSTALL.md 失败不覆盖旧版`, installMd.includes('失败不覆盖'));
    }

    if ((h.id === 'qoder' || h.id === 'workbuddy') && h.capability !== 'reading-lite') {
      // Round 13.1: the shipped INSTALL.md must document the deterministic version check and
      // the online-manifest migrate-update protocol (read manifest -> download+SHA -> migrate
      // -> before/after), verified against the REAL zip so stale RC packages can be replaced.
      add(
        `[${h.id}] ZIP INSTALL.md 有 version 版本检查命令`,
        /ming-chart\.mjs version/.test(installMd),
      );
      add(
        `[${h.id}] ZIP INSTALL.md 更新读线上 install-manifest.json`,
        installMd.includes('install-manifest.json'),
      );
      add(`[${h.id}] ZIP INSTALL.md 更新用 migrate 迁移替换`, /migrate/.test(installMd));
      add(
        `[${h.id}] ZIP INSTALL.md 更新回报 before→after`,
        installMd.includes('before→after') ||
          (installMd.includes('before') && installMd.includes('after')),
      );
      add(
        `[${h.id}] ZIP INSTALL.md 更新清理 legacy RC 双层`,
        installMd.includes('legacy') && (installMd.includes('双层') || installMd.includes('回滚')),
      );
    }

    if (h.capability === 'reading-lite') {
      add(
        `[${h.id}] reading-lite 不含 engine.mjs`,
        !existsSync(join(pkgRoot, 'scripts', 'dist', 'engine.mjs')),
      );
      add(
        `[${h.id}] reading-lite SKILL.md 拒绝自排盘`,
        /不能.*排盘|reading-lite|需.*facts/i.test(md),
      );
    } else {
      // 6/7. Run doctor + verify + calculate FROM THE EXTRACTED zip; facts == canonical.
      const doctor = runNode(pkgRoot, ['scripts/ming-chart.mjs', 'doctor']);
      add(`[${h.id}] 解压后 doctor exit 0`, doctor.code === 0);
      const verify = runNode(pkgRoot, ['scripts/ming-chart.mjs', 'verify']);
      add(`[${h.id}] 解压后 verify ok`, verify.code === 0 && /"ok":\s*true/.test(verify.stdout));
      const calcArgs = [
        'scripts/ming-chart.mjs',
        'calculate',
        '--input-file',
        'scripts/fixtures/smoke.json',
        '--systems',
        'all',
        '--now',
        FIXED_NOW,
      ];
      const fromPkg = runNode(pkgRoot, calcArgs);
      const fromSrc = runNode(srcSkill, calcArgs);
      add(`[${h.id}] 解压后 calculate exit 0`, fromPkg.code === 0);
      add(
        `[${h.id}] 解压后 facts 与 canonical byte-identical`,
        fromPkg.stdout.length > 0 && fromPkg.stdout === fromSrc.stdout,
      );

      // Round 13.1: the deterministic `version` command reads the packaged BUILD_MANIFEST and
      // reports the REAL installed version (not guessed) — no legacy schema, no double-nesting.
      const ver = runNode(pkgRoot, ['scripts/ming-chart.mjs', 'version']);
      let vj: Record<string, unknown> = {};
      try {
        vj = JSON.parse(ver.stdout) as Record<string, unknown>;
      } catch {
        /* leave empty; the assertion below fails with the raw stdout detail */
      }
      add(
        `[${h.id}] 解压后 version 报真实已装版本(ok, releaseVersion=${CANDIDATE_RELEASE_VERSION}, 非 legacy, 无双层)`,
        ver.code === 0 &&
          vj.ok === true &&
          vj.releaseVersion === CANDIDATE_RELEASE_VERSION &&
          vj.legacy === false &&
          vj.doubleNested === false,
        ver.stdout.slice(0, 200),
      );
    }
  }

  for (const t of tmpRoots) rmSync(t, { recursive: true, force: true });

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    process.stdout.write(
      `[${c.ok ? 'PASS' : 'FAIL'}] ${c.name}${c.detail ? ` (${c.detail})` : ''}\n`,
    );
  }
  process.stdout.write(
    `\n${checks.length - failed.length}/${checks.length} host-package checks passed.\n`,
  );
  if (failed.length > 0) process.exit(1);
}

try {
  main();
} catch (err: unknown) {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
}
