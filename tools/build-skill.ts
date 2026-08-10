import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { ENGINE_VERSION } from '../packages/contracts/src/version.ts';
import {
  computeBundleClosure,
  cycloneDxLicenses,
  type BundlePackage,
} from './lib/bundle-closure.ts';

/**
 * Bundle the deterministic engine into the Skill as a single self-contained ESM
 * file (scripts/dist/engine.mjs) and emit a CycloneDX SBOM plus an SPDX 2.3
 * SBOM. The bundle inlines every runtime dependency into engine.mjs, so the
 * published Skill has no dependency on the repo's packages/ or on
 * `npm install` (handoff §3.1, §12).
 *
 * The two SBOMs are derived from the esbuild metafile's `inputs` list via
 * `computeBundleClosure` (see tools/lib/bundle-closure.ts). There is no
 * hand-maintained package list here — if a new third-party package ends up in
 * the bundle, both SBOMs pick it up automatically; conversely, if a package
 * disappears from the bundle, both SBOMs drop it. The closure derivation is
 * fail-closed on missing / unresolvable license metadata, so an unaudited
 * dependency cannot silently ship.
 *
 * Byte-stability: components and packages are sorted by name; the SPDX
 * `created` timestamp is pinned to a fixed value so committed SBOM artifacts
 * are byte-identical across rebuilds. `pnpm run validate:sbom` later verifies
 * this end-to-end against a fresh esbuild pass.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const skillDir = join(root, 'skills', 'xuan-ji-yu-heng');
const entry = join(root, 'packages', 'orchestrator', 'src', 'engine-entry.ts');
const outfile = join(skillDir, 'scripts', 'dist', 'engine.mjs');

const APP_NAME = 'xuan-ji-yu-heng';
const APP_VERSION = ENGINE_VERSION;
// SPDX requires creationInfo.created; a wall-clock value would break the
// v0.1.2 byte-reproducibility of committed build artifacts, so this is a
// FIXED deterministic build timestamp (not the real build instant — the
// pinned dependency versions in `components` are the record).
const SPDX_FIXED_CREATED = '2026-01-01T00:00:00Z';

interface CycloneDxComponent {
  type: 'library';
  name: string;
  version: string;
  purl: string;
  licenses: unknown[];
}

async function main(): Promise<void> {
  mkdirSync(dirname(outfile), { recursive: true });

  const result = await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    // Unminified on purpose: the published engine must stay auditable.
    minify: false,
    legalComments: 'none',
    metafile: true,
    logLevel: 'info',
  });

  const bytes = statSync(outfile).size;
  console.log(`engine.mjs bundled: ${(bytes / 1024).toFixed(1)} KiB`);

  // --- Derive the actual third-party runtime closure from esbuild metafile ---
  const closure = computeBundleClosure(result.metafile, { root });
  console.log(
    `bundle closure: ${closure.packages.length} third-party package(s); ` +
      `ignored ${closure.ignored.repoInternal.length} repo-internal, ` +
      `${closure.ignored.nodeBuiltin.length} node builtin, ` +
      `${closure.ignored.virtual.length} virtual input(s).`,
  );

  const components: CycloneDxComponent[] = closure.packages.map((p: BundlePackage) => ({
    type: 'library',
    name: p.name,
    version: p.version,
    purl: p.purl,
    licenses: cycloneDxLicenses(p.license),
  }));

  const sbomCdx = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      // No wall-clock timestamp: the SBOM is a COMMITTED build artifact and
      // must stay byte-stable across rebuilds/machines (v0.1.2
      // reproducibility). The pinned dependency versions below are the
      // authoritative record.
      component: {
        type: 'application',
        name: APP_NAME,
        version: APP_VERSION,
      },
      tools: [{ name: 'ming-build-skill', version: APP_VERSION }],
    },
    components,
  };

  writeFileSync(join(skillDir, 'sbom.cdx.json'), `${JSON.stringify(sbomCdx, null, 2)}\n`, 'utf8');
  console.log(
    `sbom.cdx.json written (${closure.packages.map((p) => `${p.name} ${p.version}`).join(', ')})`,
  );

  // --- SPDX 2.3 SBOM from the SAME closure (Phase 6: second standard format) ---
  const spdxPackages = closure.packages.map((p) => ({
    name: p.name,
    SPDXID: `SPDXRef-Package-${p.name.replace(/[^A-Za-z0-9.-]/g, '-')}`,
    versionInfo: p.version,
    downloadLocation: 'NOASSERTION',
    filesAnalyzed: false,
    licenseConcluded: p.license,
    licenseDeclared: p.license,
    externalRefs: [
      {
        referenceCategory: 'PACKAGE-MANAGER',
        referenceType: 'purl',
        referenceLocator: p.purl,
      },
    ],
  }));
  const sbomSpdx = {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: `${APP_NAME}-${APP_VERSION}`,
    documentNamespace: `https://github.com/Jowitt13/ming-engine/spdx/${APP_NAME}-${APP_VERSION}`,
    creationInfo: {
      created: SPDX_FIXED_CREATED,
      creators: [`Tool: ming-build-skill-${APP_VERSION}`],
      comment:
        'Deterministic committed artifact: created is a fixed build timestamp, not the real build instant.',
    },
    packages: [
      {
        name: APP_NAME,
        SPDXID: `SPDXRef-Package-${APP_NAME}`,
        versionInfo: APP_VERSION,
        downloadLocation: 'NOASSERTION',
        filesAnalyzed: false,
        licenseConcluded: 'MIT',
        licenseDeclared: 'MIT',
      },
      ...spdxPackages,
    ],
    relationships: [
      {
        spdxElementId: 'SPDXRef-DOCUMENT',
        relationshipType: 'DESCRIBES',
        relatedSpdxElement: `SPDXRef-Package-${APP_NAME}`,
      },
      ...spdxPackages.map((p) => ({
        spdxElementId: `SPDXRef-Package-${APP_NAME}`,
        relationshipType: 'DEPENDS_ON',
        relatedSpdxElement: p.SPDXID,
      })),
    ],
  };
  writeFileSync(join(skillDir, 'sbom.spdx.json'), `${JSON.stringify(sbomSpdx, null, 2)}\n`, 'utf8');
  console.log(`sbom.spdx.json written (SPDX 2.3, ${spdxPackages.length} dependency packages)`);

  const outputs = Object.keys(result.metafile.outputs);
  console.log(`build outputs: ${outputs.join(', ')}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
