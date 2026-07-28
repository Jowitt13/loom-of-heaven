import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

/**
 * Derive the third-party runtime dependency closure of a bundle from an esbuild
 * metafile. The result is what `sbom.cdx.json` and `sbom.spdx.json` MUST
 * describe: every third-party npm package whose source ended up in
 * `scripts/dist/engine.mjs`.
 *
 * The function is pure over `(metafile, root, readPackageJson)` — no filesystem
 * writes, no network. Callers inject `readPackageJson` in tests so nothing on
 * disk is touched. The real build wires the default disk reader.
 *
 * Fail-closed policy:
 *   - Any third-party input path whose containing package cannot be resolved
 *     (missing package.json, missing `name` or `version`, ambiguous package
 *     layout, `.pnpm` hash directory misidentified as a package root, same
 *     name resolved to two different versions) causes a hard throw.
 *   - Any package with a license that cannot be resolved into an SPDX id or
 *     SPDX-`OR` expression (`UNLICENSED`, `SEE LICENSE IN LICENSE`, missing)
 *     causes a hard throw.
 *   - Path types we intentionally exclude are collected in `ignored` for
 *     observability but never silently discarded.
 *
 * The returned `packages` array is sorted by `name`; each package's `inputs`
 * array is sorted lexicographically. Same metafile in → byte-identical
 * `JSON.stringify(packages)` out.
 */

export interface BundlePackage {
  /** Full npm package name, including `@scope/` for scoped packages. */
  name: string;
  /** Exact version read from the package's `package.json`. */
  version: string;
  /**
   * SPDX license id (`"MIT"`) or an OR expression built from a legacy
   * `licenses` array (`"(MIT OR Apache-2.0)"`). Never `undefined`.
   */
  license: string;
  /** Package URL derived from `name` and `version`. */
  purl: string;
  /** Absolute directory containing the package's `package.json`. */
  packageRoot: string;
  /**
   * All metafile input paths (relative to `root`) that resolved into this
   * package, sorted lexicographically. Useful for diagnostics.
   */
  inputs: string[];
}

export interface BundleClosureResult {
  packages: BundlePackage[];
  ignored: {
    repoInternal: string[];
    nodeBuiltin: string[];
    virtual: string[];
  };
}

export interface ComputeBundleClosureOptions {
  root: string;
  /**
   * Read the package.json at the given absolute directory, returning its
   * parsed JSON value or `null` if not present. Default: read from disk.
   */
  readPackageJson?: (dir: string) => unknown;
}

/** Parse a package.json value into a bare `{ name, version, license }` triple. */
interface RawPackageJson {
  name?: unknown;
  version?: unknown;
  license?: unknown;
  licenses?: unknown;
}

function defaultReadPackageJson(dir: string): unknown {
  const p = join(dir, 'package.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Extract an SPDX id or an SPDX-OR expression from a `package.json` license
 * field. Fail-closed on anything unresolvable.
 */
export function extractLicense(pkg: RawPackageJson): string {
  const bad = (why: string): never => {
    throw new Error(`unresolvable license: ${why}`);
  };

  // Modern SPDX form.
  if (typeof pkg.license === 'string') {
    const v = pkg.license.trim();
    if (v === '' || /^UNLICENSED$/i.test(v) || /^SEE LICENSE IN /i.test(v)) {
      bad(`license string "${pkg.license}"`);
    }
    return v;
  }
  // Legacy single-object form: { license: { type: "MIT" } }.
  if (
    pkg.license !== null &&
    typeof pkg.license === 'object' &&
    typeof (pkg.license as { type?: unknown }).type === 'string'
  ) {
    const t = ((pkg.license as { type: string }).type ?? '').trim();
    if (t === '') bad('empty license.type');
    return t;
  }
  // Legacy array form: { licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] }.
  if (Array.isArray(pkg.licenses)) {
    const ids: string[] = [];
    for (const entry of pkg.licenses) {
      if (
        entry !== null &&
        typeof entry === 'object' &&
        typeof (entry as { type?: unknown }).type === 'string'
      ) {
        const t = ((entry as { type: string }).type ?? '').trim();
        if (t === '') bad('empty licenses[i].type');
        ids.push(t);
      } else {
        bad('malformed licenses[] entry');
      }
    }
    if (ids.length === 0) bad('empty licenses[]');
    if (ids.length === 1) return ids[0]!;
    return `(${ids.join(' OR ')})`;
  }
  bad('no license or licenses field');
  // Unreachable; `bad` throws.
  return '';
}

/**
 * Canonical npm Package URL (purl) per the purl spec
 * (https://github.com/package-url/purl-spec): for scoped packages the scope
 * is the purl namespace and its `@` MUST be percent-encoded, e.g.
 *   pkg:npm/%40scope/name@1.2.3
 * Unscoped packages keep the plain form:
 *   pkg:npm/name@1.2.3
 *
 * This is the ONLY place npm purls are generated — build-skill, validate-sbom
 * and test fixtures all call this function so no caller can hand-write a
 * divergent (non-canonical) purl string.
 */
export function npmPurl(name: string, version: string): string {
  if (name.startsWith('@')) {
    const slash = name.indexOf('/');
    if (slash <= 1 || slash === name.length - 1) {
      throw new Error(`invalid scoped npm package name: ${name}`);
    }
    const scope = name.slice(1, slash); // without the leading '@'
    const rest = name.slice(slash + 1);
    return `pkg:npm/%40${scope}/${rest}@${version}`;
  }
  return `pkg:npm/${name}@${version}`;
}

/** One bare SPDX id: letters, digits, dot, dash, optional trailing `+`. */
const SPDX_ID_RE = /^[A-Za-z0-9.-]+\+?$/;

/**
 * Distinguish a single SPDX license id from an SPDX license expression.
 *
 *   'MIT'                    -> 'id'
 *   'Apache-2.0'             -> 'id'
 *   'GPL-2.0+'               -> 'id'
 *   'MIT OR Apache-2.0'      -> 'expression'   (no parens required!)
 *   '(MIT OR Apache-2.0)'    -> 'expression'
 *   'A AND B', 'A WITH e'    -> 'expression'
 *   anything else            -> throw (fail-closed; arbitrary prose is never
 *                               silently treated as an SPDX id)
 */
export function spdxKind(license: string): 'id' | 'expression' {
  const t = license.trim();
  if (t === '') throw new Error('empty SPDX license');
  if (SPDX_ID_RE.test(t)) return 'id';
  // Candidate expression: strip parens, tokenize, and require a well-formed
  // alternation of SPDX ids and OR/AND/WITH operators.
  const tokens = t
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .filter((x) => x.length > 0);
  const isOp = (x: string): boolean => /^(OR|AND|WITH)$/i.test(x);
  const ops = tokens.filter(isOp);
  const operands = tokens.filter((x) => !isOp(x));
  if (ops.length >= 1 && operands.length >= 2 && operands.every((x) => SPDX_ID_RE.test(x))) {
    return 'expression';
  }
  throw new Error(`unrecognized SPDX license form: "${license}"`);
}

/**
 * Build the CycloneDX `licenses` array for one component. Single SPDX ids go
 * into `{ license: { id } }`; every expression (with or without outer parens)
 * goes into `{ expression }`. Unrecognized forms throw via spdxKind.
 */
export function cycloneDxLicenses(license: string): unknown[] {
  const t = license.trim();
  return spdxKind(t) === 'id' ? [{ license: { id: t } }] : [{ expression: t }];
}

/**
 * Classify a metafile input path into one of four categories, or 'unknown'
 * if the path cannot be safely attributed. The classifier uses
 * PATH-SEGMENT precise matching, never a substring `includes()`, so a
 * third-party package with its own `packages/` subdirectory (a very common
 * pattern in monorepo-shipped packages) is not silently swept into the
 * repo-internal category.
 *
 * Order matters:
 *   1. virtual (esbuild synthetic inputs like `<define:...>` and `<runtime>`)
 *   2. nodeBuiltin (`node:` prefixed identifiers)
 *   3. thirdParty (ANY path with `node_modules` as a real path segment) —
 *      even when the path contains later segments named `packages`.
 *   4. repoInternal (path whose FIRST segment is exactly `packages`) — the
 *      workspace's own `packages/<workspace>/…` source files.
 *   5. unknown — anything that does not match the above. Callers must treat
 *      this as a hard error rather than a silent skip.
 */
type Category =
  | { kind: 'virtual' }
  | { kind: 'nodeBuiltin' }
  | { kind: 'repoInternal' }
  | { kind: 'thirdParty' }
  | { kind: 'unknown' };

function classifyInput(input: string): Category {
  // esbuild emits synthetic entries like `<define:X>` and `<runtime>`.
  if (input.startsWith('<') || input.includes('\x00')) return { kind: 'virtual' };
  if (input.startsWith('node:')) return { kind: 'nodeBuiltin' };
  // Normalise BOTH backslashes and the OS separator to `/` so segment
  // matching works uniformly on Windows, POSIX and any mixed-separator input
  // that a metafile might carry.
  const norm = input.replace(/\\/g, '/');
  const parts = norm.split('/').filter((p) => p.length > 0);

  // PRIORITY: a path with `node_modules` as a real path SEGMENT is
  // third-party — even if a later segment happens to be named `packages/`.
  // Substring matching (`.includes('/packages/')`) would false-positive on
  // `node_modules/foo/packages/runtime/index.js`.
  if (parts.includes('node_modules')) return { kind: 'thirdParty' };

  // repoInternal: only when the FIRST segment is exactly `packages`.
  if (parts[0] === 'packages') return { kind: 'repoInternal' };

  // Anything else cannot be safely attributed — fail-closed at the caller.
  return { kind: 'unknown' };
}

/**
 * Walk up from a metafile input's absolute path, looking for the containing
 * package.json. Returns the package root and its parsed JSON. Fail-closed if
 * the path is not truly inside a valid npm package layout.
 */
function resolvePackageRoot(
  inputAbs: string,
  opts: { root: string; readPackageJson: (dir: string) => unknown },
): { dir: string; json: RawPackageJson } {
  let cur = dirname(inputAbs);
  const stopAt = opts.root;
  while (cur.length >= stopAt.length) {
    const parsed = opts.readPackageJson(cur);
    if (parsed !== null && parsed !== undefined && typeof parsed === 'object') {
      const pkg = parsed as RawPackageJson;
      if (typeof pkg.name === 'string' && typeof pkg.version === 'string') {
        // Verify layout: the directory containing package.json must live
        // directly under a node_modules dir (allowing `@scope/name`).
        const rel = relative(opts.root, cur).split(sep).join('/');
        const parts = rel.split('/');
        const nmIdx = parts.lastIndexOf('node_modules');
        if (nmIdx < 0) {
          throw new Error(
            `package.json at ${rel} is not under node_modules; refusing to attribute input ${relative(opts.root, inputAbs)}`,
          );
        }
        const after = parts.slice(nmIdx + 1);
        // Either ['name'] or ['@scope', 'name'].
        const expected =
          after.length === 1
            ? after[0]
            : after.length === 2 && after[0]!.startsWith('@')
              ? `${after[0]}/${after[1]}`
              : null;
        if (expected === null || expected !== pkg.name) {
          throw new Error(
            `package layout mismatch for input ${relative(opts.root, inputAbs)}: package.json name "${pkg.name}" but directory tail "${after.join('/')}"`,
          );
        }
        return { dir: cur, json: pkg };
      }
    }
    const next = dirname(cur);
    if (next === cur) break;
    cur = next;
  }
  throw new Error(`could not resolve package root for input ${relative(opts.root, inputAbs)}`);
}

/** Sort a string array in place with a stable, locale-independent comparator. */
function sortAscii(xs: string[]): string[] {
  xs.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return xs;
}

export function computeBundleClosure(
  metafile: { inputs: Record<string, unknown> },
  opts: ComputeBundleClosureOptions,
): BundleClosureResult {
  const readPackageJson = opts.readPackageJson ?? defaultReadPackageJson;
  if (!isAbsolute(opts.root)) {
    throw new Error(`root must be absolute, got ${opts.root}`);
  }

  const ignored: BundleClosureResult['ignored'] = {
    repoInternal: [],
    nodeBuiltin: [],
    virtual: [],
  };
  /** Package root dir -> aggregated data. Keyed by absolute dir. */
  const byRoot = new Map<string, BundlePackage>();

  const inputs = Object.keys(metafile.inputs);
  for (const raw of inputs) {
    const c = classifyInput(raw);
    if (c.kind === 'virtual') {
      ignored.virtual.push(raw);
      continue;
    }
    if (c.kind === 'nodeBuiltin') {
      ignored.nodeBuiltin.push(raw);
      continue;
    }
    if (c.kind === 'repoInternal') {
      ignored.repoInternal.push(raw);
      continue;
    }
    if (c.kind === 'unknown') {
      // Fail-closed: any metafile input that is neither obviously virtual,
      // a Node built-in, a repo `packages/*` source, nor located under a
      // real `node_modules` path segment is refused. Silently sweeping such
      // paths into repoInternal (the pre-fix behaviour) hid third-party
      // inputs whose paths happened to include a `packages/` subdirectory.
      throw new Error(`could not classify metafile input: ${raw}`);
    }
    // Third-party. Resolve to an absolute path relative to root, then walk up.
    const abs = isAbsolute(raw) ? raw : join(opts.root, raw);
    const { dir, json } = resolvePackageRoot(abs, {
      root: opts.root,
      readPackageJson,
    });
    const license = extractLicense(json);
    const name = json.name as string;
    const version = json.version as string;
    const existing = byRoot.get(dir);
    if (existing) {
      if (existing.version !== version || existing.license !== license) {
        throw new Error(
          `package ${name} resolved to conflicting metadata at ${dir}: ` +
            `${existing.version}/${existing.license} vs ${version}/${license}`,
        );
      }
      existing.inputs.push(relative(opts.root, abs).split(sep).join('/'));
      continue;
    }
    // Also fail-closed if a *different* dir maps to the *same* package name
    // but a different version — we detect this later via the flattened list.
    byRoot.set(dir, {
      name,
      version,
      license,
      purl: npmPurl(name, version),
      packageRoot: dir,
      inputs: [relative(opts.root, abs).split(sep).join('/')],
    });
  }

  // Detect name-collision-across-roots after aggregation.
  const packages = [...byRoot.values()];
  const byName = new Map<string, BundlePackage>();
  for (const p of packages) {
    const seen = byName.get(p.name);
    if (seen && (seen.version !== p.version || seen.license !== p.license)) {
      throw new Error(
        `package ${p.name} resolved to multiple versions in the bundle: ` +
          `${seen.version}/${seen.license} at ${seen.packageRoot} and ` +
          `${p.version}/${p.license} at ${p.packageRoot}`,
      );
    }
    if (!seen) byName.set(p.name, p);
  }

  for (const p of packages) sortAscii(p.inputs);
  packages.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  sortAscii(ignored.repoInternal);
  sortAscii(ignored.nodeBuiltin);
  sortAscii(ignored.virtual);

  return { packages, ignored };
}
