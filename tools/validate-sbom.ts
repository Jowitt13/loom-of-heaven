import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeBundleClosure,
  npmPurl,
  spdxKind,
  type BundlePackage,
} from './lib/bundle-closure.ts';

/**
 * Reverse gate for the CycloneDX + SPDX SBOMs shipped with the Skill.
 *
 * The `build` step derives both SBOMs from the esbuild metafile via
 * `computeBundleClosure`. This tool runs a fresh esbuild pass, recomputes the
 * closure independently, and asserts that BOTH committed SBOMs describe
 * EXACTLY that closure: no missing packages, no extra packages, per-package
 * name/version/purl/license match, and the two SBOMs match each other.
 *
 * It also re-serializes each SBOM and requires the result to be byte-identical
 * to disk, so a hand-edit that breaks reproducibility is caught here too.
 *
 * Flags (used by tests):
 *   --metafile <file>   read a captured esbuild metafile JSON instead of
 *                        spawning a fresh build. Purely for offline unit tests.
 *   --root <dir>        override the repo root (default: parent of this file).
 *   --sbom-cdx <file>   path to CycloneDX SBOM (default:
 *                        skills/xuan-ji-yu-heng/sbom.cdx.json).
 *   --sbom-spdx <file>  path to SPDX SBOM (default:
 *                        skills/xuan-ji-yu-heng/sbom.spdx.json).
 *
 * There is a documented exceptions file (tools/validate-sbom.exceptions.json)
 * — currently absent; if ever present it must be a JSON array of
 * { name, version, reason, expires: YYYY-MM-DD } and the expires date must be
 * a real calendar date at or after today (fail-closed otherwise).
 */

const here = dirname(fileURLToPath(import.meta.url));

// --- Arg parsing --------------------------------------------------------------
const argv = process.argv.slice(2);
const getFlag = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const rootArg = getFlag('--root');
const root = rootArg
  ? rootArg.startsWith('.')
    ? join(process.cwd(), rootArg)
    : rootArg
  : join(here, '..');
const metafileArg = getFlag('--metafile');
const sbomCdxArg = getFlag('--sbom-cdx');
const sbomSpdxArg = getFlag('--sbom-spdx');
const APP_NAME = 'xuan-ji-yu-heng';

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

/** Real-date check identical to scan-deps.ts's isRealDate. */
function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d!));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === (m ?? 1) - 1 && dt.getUTCDate() === d;
}

interface Exception {
  name: string;
  version: string;
  reason: string;
  expires: string;
}
function loadExceptions(): Exception[] {
  const p = join(root, 'tools', 'validate-sbom.exceptions.json');
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, 'utf8'));
  if (!Array.isArray(raw)) throw new Error(`${p}: exceptions must be a JSON array`);
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set<string>();
  for (const [i, e] of raw.entries()) {
    if (typeof e !== 'object' || e === null || Array.isArray(e)) {
      throw new Error(`${p}: exceptions[${i}] is not an object`);
    }
    const en = e as Record<string, unknown>;
    if (typeof en.name !== 'string' || en.name.trim().length === 0)
      throw new Error(`${p}: exceptions[${i}].name missing`);
    if (typeof en.version !== 'string' || en.version.trim().length === 0)
      throw new Error(`${p}: exceptions[${i}].version missing`);
    if (typeof en.reason !== 'string' || en.reason.trim().length === 0)
      throw new Error(`${p}: exceptions[${i}].reason missing/empty`);
    if (typeof en.expires !== 'string' || !isRealDate(en.expires))
      throw new Error(`${p}: exceptions[${i}].expires not a real YYYY-MM-DD date`);
    if (en.expires < today)
      throw new Error(`${p}: exceptions[${i}] "${en.name}@${en.version}" expired on ${en.expires}`);
    const key = `${en.name}@${en.version}`;
    if (seen.has(key)) throw new Error(`${p}: duplicate exception ${key}`);
    seen.add(key);
  }
  return raw as Exception[];
}

// --- SBOM shapes we consume --------------------------------------------------
interface CdxLicense {
  license?: { id?: string };
  expression?: string;
}
interface CdxComponent {
  type?: string;
  name?: string;
  version?: string;
  purl?: string;
  licenses?: CdxLicense[];
}
interface CdxSbom {
  metadata?: { component?: { name?: string; version?: string } };
  components?: CdxComponent[];
}

interface SpdxPackage {
  name?: string;
  SPDXID?: string;
  versionInfo?: string;
  licenseConcluded?: string;
  licenseDeclared?: string;
  externalRefs?: { referenceType?: string; referenceLocator?: string }[];
}
interface SpdxSbom {
  packages?: SpdxPackage[];
}

/** Read a CycloneDX SBOM and normalise the third-party components.
 *  `form` records HOW the license was written: `id` (license.id), `expression`
 *  (SPDX expression field) or `none`. validate-sbom uses it to reject SBOMs
 *  that smuggle an SPDX expression into `license.id`. */
function extractCdxPackages(
  sbom: CdxSbom,
): Map<
  string,
  { version: string; purl: string; license: string; form: 'id' | 'expression' | 'none' }
> {
  const out = new Map<
    string,
    { version: string; purl: string; license: string; form: 'id' | 'expression' | 'none' }
  >();
  for (const c of sbom.components ?? []) {
    if (c.type !== 'library') continue;
    if (typeof c.name !== 'string' || typeof c.version !== 'string' || typeof c.purl !== 'string')
      continue;
    const lic = c.licenses?.[0];
    const form: 'id' | 'expression' | 'none' =
      lic?.expression !== undefined ? 'expression' : lic?.license?.id !== undefined ? 'id' : 'none';
    const license = lic?.expression ?? lic?.license?.id ?? '';
    out.set(c.name, { version: c.version, purl: c.purl, license, form });
  }
  return out;
}

/** Read an SPDX SBOM and normalise the third-party packages (excluding the application). */
function extractSpdxPackages(
  sbom: SpdxSbom,
): Map<string, { version: string; purl: string; license: string }> {
  const out = new Map<string, { version: string; purl: string; license: string }>();
  for (const p of sbom.packages ?? []) {
    if (typeof p.name !== 'string') continue;
    if (p.name === APP_NAME) continue;
    const purl = p.externalRefs?.find((r) => r.referenceType === 'purl')?.referenceLocator ?? '';
    out.set(p.name, {
      version: p.versionInfo ?? '',
      purl,
      license: p.licenseConcluded ?? p.licenseDeclared ?? '',
    });
  }
  return out;
}

// --- Closure source ----------------------------------------------------------
async function computeTruthClosure(): Promise<BundlePackage[]> {
  let metafile: { inputs: Record<string, unknown> };
  if (metafileArg) {
    const p = join(root, metafileArg);
    metafile = JSON.parse(readFileSync(p, 'utf8')) as {
      inputs: Record<string, unknown>;
    };
  } else {
    const result = await build({
      entryPoints: [join(root, 'packages', 'orchestrator', 'src', 'engine-entry.ts')],
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node22',
      write: false,
      metafile: true,
      logLevel: 'silent',
    });
    metafile = result.metafile;
  }
  return computeBundleClosure(metafile, { root }).packages;
}

/**
 * Re-serialize a JSON object with the exact same formatting the build tool
 * uses (`JSON.stringify(x, null, 2) + '\n'`), so byte-comparison against the
 * on-disk file catches hand edits or non-deterministic tooling.
 */
function reserialize(obj: unknown): string {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

// --- Assertions -------------------------------------------------------------
export interface ValidateSbomInputs {
  closure: BundlePackage[];
  cdxText: string;
  spdxText: string;
  exceptions: Exception[];
  cdxPath: string;
  spdxPath: string;
}
export function validateSbom(inputs: ValidateSbomInputs): Check[] {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail?: string): void => {
    checks.push(detail === undefined ? { name, ok } : { name, ok, detail });
  };

  const cdx: CdxSbom = JSON.parse(inputs.cdxText);
  const spdx: SpdxSbom = JSON.parse(inputs.spdxText);
  const cdxMap = extractCdxPackages(cdx);
  const spdxMap = extractSpdxPackages(spdx);
  const truthByName = new Map<string, BundlePackage>();
  for (const p of inputs.closure) truthByName.set(p.name, p);
  const exemptedNames = new Set(inputs.exceptions.map((e) => e.name));

  // 0. Duplicate-name detection: any SBOM that lists the same third-party
  //    package name more than once is malformed. Previous code used Map.set
  //    which silently overwrote duplicates; now we fail-closed.
  const cdxLibNames = (cdx.components ?? [])
    .filter((c) => c.type === 'library')
    .map((c) => c.name)
    .filter((n): n is string => typeof n === 'string');
  const cdxDups = [...new Set(cdxLibNames.filter((n, i) => cdxLibNames.indexOf(n) !== i))];
  for (const d of cdxDups) {
    add(`cyclonedx no duplicate library component: ${d}`, false, 'appears more than once');
  }
  const spdxPkgNames = (spdx.packages ?? [])
    .filter((p) => typeof p.name === 'string' && p.name !== APP_NAME)
    .map((p) => p.name as string);
  const spdxDups = [...new Set(spdxPkgNames.filter((n, i) => spdxPkgNames.indexOf(n) !== i))];
  for (const d of spdxDups) {
    add(`spdx no duplicate third-party package: ${d}`, false, 'appears more than once');
  }

  // 0b. Structural completeness: every CycloneDX library component must carry
  //     all required identity fields. A component that lacks any of these was
  //     silently skipped by the old extract-and-Map logic; now it's a hard FAIL.
  for (const [i, c] of (cdx.components ?? []).entries()) {
    if (c.type !== 'library') continue;
    if (typeof c.name !== 'string' || c.name === '')
      add(`cyclonedx component[${i}] has name`, false, 'missing or empty');
    if (typeof c.version !== 'string' || c.version === '')
      add(`cyclonedx component[${i}] has version`, false, 'missing or empty');
    if (typeof c.purl !== 'string' || c.purl === '')
      add(`cyclonedx component[${i}] has purl`, false, 'missing or empty');
    const lic = c.licenses?.[0];
    if (!lic || (lic.license?.id === undefined && lic.expression === undefined))
      add(`cyclonedx component[${i}] has license`, false, 'no license.id or expression');
  }

  // 0c. Structural completeness for SPDX third-party packages.
  for (const [i, p] of (spdx.packages ?? []).entries()) {
    if (typeof p.name !== 'string') {
      add(`spdx package[${i}] has name`, false, 'missing');
      continue;
    }
    if (p.name === APP_NAME) continue;
    if (!p.versionInfo)
      add(`spdx package[${i}] "${p.name}" has versionInfo`, false, 'missing or empty');
    const purl = p.externalRefs?.find((r) => r.referenceType === 'purl')?.referenceLocator;
    if (!purl) add(`spdx package[${i}] "${p.name}" has purl`, false, 'no purl in externalRefs');
    if (!p.licenseConcluded && !p.licenseDeclared)
      add(
        `spdx package[${i}] "${p.name}" has license`,
        false,
        'no licenseConcluded or licenseDeclared',
      );
  }

  // 1. Every truth-set package must exist in both SBOMs with matching fields.
  //    Purls are checked against the CANONICAL form recomputed here from
  //    (name, version) via the shared npmPurl — not merely string-equality
  //    with the closure — so a systematically wrong purl generator can never
  //    self-certify. CycloneDX license FORM is checked against spdxKind so an
  //    expression can never masquerade as `license.id`.
  for (const p of inputs.closure) {
    const canonicalPurl = npmPurl(p.name, p.version);
    const expectedForm = spdxKind(p.license); // throws on unrecognized license (fail-closed)
    const c = cdxMap.get(p.name);
    add(
      `cyclonedx has ${p.name}`,
      c !== undefined,
      c === undefined ? 'missing' : `${c.version} ${c.license}`,
    );
    if (c) {
      add(
        `cyclonedx version matches: ${p.name}`,
        c.version === p.version,
        `sbom=${c.version} closure=${p.version}`,
      );
      add(
        `cyclonedx purl is canonical: ${p.name}`,
        c.purl === canonicalPurl,
        `sbom=${c.purl} canonical=${canonicalPurl}`,
      );
      add(
        `cyclonedx license matches: ${p.name}`,
        c.license === p.license,
        `sbom=${c.license} closure=${p.license}`,
      );
      add(
        `cyclonedx license form is correct: ${p.name}`,
        c.form === expectedForm,
        `sbom-form=${c.form} expected=${expectedForm}`,
      );
    }
    const s = spdxMap.get(p.name);
    add(
      `spdx has ${p.name}`,
      s !== undefined,
      s === undefined ? 'missing' : `${s.version} ${s.license}`,
    );
    if (s) {
      add(
        `spdx version matches: ${p.name}`,
        s.version === p.version,
        `sbom=${s.version} closure=${p.version}`,
      );
      add(
        `spdx purl is canonical: ${p.name}`,
        s.purl === canonicalPurl,
        `sbom=${s.purl} canonical=${canonicalPurl}`,
      );
      add(
        `spdx license matches: ${p.name}`,
        s.license === p.license,
        `sbom=${s.license} closure=${p.license}`,
      );
    }
  }

  // 2. Both SBOMs must not carry extra packages that are not in the truth set,
  //    unless there is an active documented exception.
  for (const [name, entry] of cdxMap) {
    if (truthByName.has(name)) continue;
    if (exemptedNames.has(name)) {
      // exceptions apply to a specific (name, version) pair.
      const ok = inputs.exceptions.some((e) => e.name === name && e.version === entry.version);
      add(
        `cyclonedx extra allowed: ${name}@${entry.version}`,
        ok,
        ok ? 'documented exception' : 'name allowlisted but version mismatch',
      );
      continue;
    }
    add(
      `cyclonedx has no ghost package: ${name}`,
      false,
      `${entry.version} ${entry.license} — not in bundle closure`,
    );
  }
  for (const [name, entry] of spdxMap) {
    if (truthByName.has(name)) continue;
    if (exemptedNames.has(name)) {
      const ok = inputs.exceptions.some((e) => e.name === name && e.version === entry.version);
      add(
        `spdx extra allowed: ${name}@${entry.version}`,
        ok,
        ok ? 'documented exception' : 'name allowlisted but version mismatch',
      );
      continue;
    }
    add(
      `spdx has no ghost package: ${name}`,
      false,
      `${entry.version} ${entry.license} — not in bundle closure`,
    );
  }

  // 3. The two SBOMs must agree on the third-party set (name+version+purl+license).
  const cdxKeys = new Set<string>(
    [...cdxMap.entries()].map(([n, v]) => `${n}|${v.version}|${v.purl}|${v.license}`),
  );
  const spdxKeys = new Set<string>(
    [...spdxMap.entries()].map(([n, v]) => `${n}|${v.version}|${v.purl}|${v.license}`),
  );
  const onlyInCdx = [...cdxKeys].filter((k) => !spdxKeys.has(k));
  const onlyInSpdx = [...spdxKeys].filter((k) => !cdxKeys.has(k));
  add(
    'cyclonedx set equals spdx set',
    onlyInCdx.length === 0 && onlyInSpdx.length === 0,
    `only-cdx=${onlyInCdx.length} only-spdx=${onlyInSpdx.length}`,
  );

  // 4. Application component identity must agree between both SBOMs.
  const cdxApp = cdx.metadata?.component;
  const spdxApp = spdx.packages?.find((p) => p.name === APP_NAME);
  add(
    `cyclonedx application component is ${APP_NAME}`,
    cdxApp?.name === APP_NAME,
    `got ${cdxApp?.name ?? '(missing)'}`,
  );
  add(
    `spdx application package is ${APP_NAME}`,
    spdxApp?.name === APP_NAME,
    `got ${spdxApp?.name ?? '(missing)'}`,
  );
  add(
    'application version matches across both SBOMs',
    cdxApp?.version !== undefined && cdxApp.version === spdxApp?.versionInfo,
    `cdx=${cdxApp?.version ?? '?'} spdx=${spdxApp?.versionInfo ?? '?'}`,
  );

  // 5. Byte-stability: re-serialize and compare with disk. This catches
  //    non-deterministic writers and hand edits that break reproducibility.
  add(
    'cyclonedx SBOM is byte-stable (reserialization matches disk)',
    reserialize(cdx) === inputs.cdxText,
    `path=${relative(root, inputs.cdxPath)}`,
  );
  add(
    'spdx SBOM is byte-stable (reserialization matches disk)',
    reserialize(spdx) === inputs.spdxText,
    `path=${relative(root, inputs.spdxPath)}`,
  );

  return checks;
}

// --- Runner ------------------------------------------------------------------
async function main(): Promise<void> {
  const cdxPath = sbomCdxArg
    ? sbomCdxArg.startsWith('.')
      ? join(root, sbomCdxArg)
      : sbomCdxArg
    : join(root, 'skills', 'xuan-ji-yu-heng', 'sbom.cdx.json');
  const spdxPath = sbomSpdxArg
    ? sbomSpdxArg.startsWith('.')
      ? join(root, sbomSpdxArg)
      : sbomSpdxArg
    : join(root, 'skills', 'xuan-ji-yu-heng', 'sbom.spdx.json');
  if (!existsSync(cdxPath)) {
    process.stdout.write(`[FAIL] cyclonedx SBOM not found: ${relative(root, cdxPath)}\n`);
    process.exit(1);
  }
  if (!existsSync(spdxPath)) {
    process.stdout.write(`[FAIL] spdx SBOM not found: ${relative(root, spdxPath)}\n`);
    process.exit(1);
  }
  const cdxText = readFileSync(cdxPath, 'utf8');
  const spdxText = readFileSync(spdxPath, 'utf8');
  const exceptions = loadExceptions();
  const closure = await computeTruthClosure();
  const checks = validateSbom({ closure, cdxText, spdxText, exceptions, cdxPath, spdxPath });

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    process.stdout.write(
      `[${c.ok ? 'PASS' : 'FAIL'}] ${c.name}${c.detail ? ` (${c.detail})` : ''}\n`,
    );
  }
  process.stdout.write(
    `\n${checks.length - failed.length}/${checks.length} sbom validation checks passed.\n`,
  );
  if (failed.length > 0) {
    process.stdout.write(
      'The committed SBOMs do not accurately describe the actual esbuild bundle closure.\n' +
        'Rebuild with `pnpm run build` and commit the regenerated sbom.cdx.json / sbom.spdx.json,\n' +
        'or add a documented, time-boxed entry to tools/validate-sbom.exceptions.json.\n',
    );
    process.exit(1);
  }
}

const invokedAsScript =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedAsScript) {
  main().catch((err: unknown) => {
    process.stdout.write(`[FAIL] validate-sbom crashed: ${(err as Error).message}\n`);
    process.exit(1);
  });
}
