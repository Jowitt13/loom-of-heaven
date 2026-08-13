import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { format } from 'prettier';
import {
  IPIP_NEO_120_INSTRUMENT,
  IPIP_NEO_120_SOURCE,
} from '../packages/personality-assessment/src/skill-entry.ts';
import {
  computeBundleClosure,
  cycloneDxLicenses,
  type BundlePackage,
} from './lib/bundle-closure.ts';

/** Build the independently releasable, nonclinical P9 Skill. */
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const skillDir = join(root, 'skills', 'psychology-self-assessment');
const entry = join(root, 'packages', 'personality-assessment', 'src', 'skill-entry.ts');
const outfile = join(skillDir, 'scripts', 'dist', 'psychology-engine.mjs');
const APP_NAME = 'psychology-self-assessment';
const APP_VERSION = '0.1.0';
const SPDX_FIXED_CREATED = '2026-01-01T00:00:00Z';

interface CycloneDxComponent {
  type: 'library';
  name: string;
  version: string;
  purl: string;
  licenses: unknown[];
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const formatted = await format(JSON.stringify(value, null, 2), {
    parser: 'json',
    printWidth: 100,
    endOfLine: 'lf',
  });
  writeFileSync(path, `${formatted.trimEnd()}\n`, 'utf8');
}

function writeCanonicalJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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
    minify: false,
    legalComments: 'none',
    metafile: true,
    logLevel: 'info',
  });
  // esbuild preserves a few whitespace-only lines from bundled dependency comments.
  // Normalize them before hashing and committing so `git diff --check` remains a release gate.
  writeFileSync(outfile, readFileSync(outfile, 'utf8').replace(/[\t ]+$/gm, ''), 'utf8');
  const closure = computeBundleClosure(result.metafile, { root });
  const components: CycloneDxComponent[] = closure.packages.map((pkg: BundlePackage) => ({
    type: 'library',
    name: pkg.name,
    version: pkg.version,
    purl: pkg.purl,
    licenses: cycloneDxLicenses(pkg.license),
  }));
  const sbomCdx = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      component: { type: 'application', name: APP_NAME, version: APP_VERSION },
      tools: [{ name: 'loom-build-psychology-skill', version: APP_VERSION }],
    },
    components,
  };
  const spdxPackages = closure.packages.map((pkg) => ({
    name: pkg.name,
    SPDXID: `SPDXRef-Package-${pkg.name.replace(/[^A-Za-z0-9.-]/g, '-')}`,
    versionInfo: pkg.version,
    downloadLocation: 'NOASSERTION',
    filesAnalyzed: false,
    licenseConcluded: pkg.license,
    licenseDeclared: pkg.license,
    externalRefs: [
      {
        referenceCategory: 'PACKAGE-MANAGER',
        referenceType: 'purl',
        referenceLocator: pkg.purl,
      },
    ],
  }));
  const sbomSpdx = {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: `${APP_NAME}-${APP_VERSION}`,
    documentNamespace: `https://github.com/Jowitt13/loom-of-heaven/spdx/${APP_NAME}-${APP_VERSION}`,
    creationInfo: {
      created: SPDX_FIXED_CREATED,
      creators: [`Tool: loom-build-psychology-skill-${APP_VERSION}`],
      comment: 'Deterministic committed artifact: created is a fixed build timestamp.',
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
      ...spdxPackages.map((pkg) => ({
        spdxElementId: `SPDXRef-Package-${APP_NAME}`,
        relationshipType: 'DEPENDS_ON',
        relatedSpdxElement: pkg.SPDXID,
      })),
    ],
  };
  const engineSha256 = createHash('sha256').update(readFileSync(outfile)).digest('hex');
  const sourceManifest = {
    instrument: IPIP_NEO_120_INSTRUMENT,
    rights: IPIP_NEO_120_SOURCE.rights,
    citation: IPIP_NEO_120_SOURCE.citation,
    sources: IPIP_NEO_120_SOURCE.sources,
    excludedFields: ['gender', 'age', 'email'],
    productBoundary: [
      'nonclinical-self-report-only',
      'no-diagnosis',
      'no-population-norms-or-percentiles',
      'no-chart-input-or-automatic-mapping',
    ],
  };
  const buildManifest = {
    skill: APP_NAME,
    product: 'loom-of-heaven',
    releaseVersion: APP_VERSION,
    status: 'unpublished',
    runtime: 'node >=22',
    engine: { file: 'scripts/dist/psychology-engine.mjs', sha256: engineSha256 },
    capabilities: [
      'doctor',
      'instruments',
      'items',
      'start',
      'answer',
      'resume',
      'cancel',
      'score',
      'export',
      'delete',
      'verify',
      'version',
    ],
    exclusions: ['all-clinical-screening', 'chart-personality-cross-check', 'raw-response-export'],
    sourceManifest: 'references/ipip-neo-120-source-manifest.json',
  };
  writeCanonicalJson(join(skillDir, 'sbom.cdx.json'), sbomCdx);
  writeCanonicalJson(join(skillDir, 'sbom.spdx.json'), sbomSpdx);
  await writeJson(
    join(skillDir, 'references', 'ipip-neo-120-source-manifest.json'),
    sourceManifest,
  );
  await writeJson(join(skillDir, 'BUILD_MANIFEST.json'), buildManifest);
  process.stdout.write(
    `psychology-engine.mjs bundled: ${(statSync(outfile).size / 1024).toFixed(1)} KiB; ${closure.packages.length} third-party package(s)\n`,
  );
}

main().catch((err: unknown) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
});
