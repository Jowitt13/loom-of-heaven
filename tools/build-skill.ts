import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

/**
 * Bundle the deterministic engine into the Skill as a single self-contained ESM
 * file (scripts/dist/engine.mjs) and emit a CycloneDX SBOM. The bundle inlines
 * zod + moment-timezone (including its packed TZDB), so the published Skill has
 * no dependency on the repo's packages/ or on `npm install` (handoff §3.1, §12).
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const skillDir = join(root, 'skills', 'calculate-birth-charts');
const entry = join(root, 'packages', 'orchestrator', 'src', 'engine-entry.ts');
const outfile = join(skillDir, 'scripts', 'dist', 'engine.mjs');

function resolveVersion(name: string, fromPkgJson: string): { version: string; dir: string } {
  // Resolve the package entry point, then walk up to package.json (some packages
  // don't export './package.json' in their "exports" map — e.g. tyme4ts).
  const requireFrom = createRequire(fromPkgJson);
  const entryPath = requireFrom.resolve(name);
  // Walk up from the resolved entry to find the package root.
  let current = dirname(entryPath);
  while (!existsSync(join(current, 'package.json'))) {
    const parent = dirname(current);
    if (parent === current) throw new Error(`Cannot find package root for ${name}`);
    current = parent;
  }
  const pkgPath = join(current, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };
  return { version: pkg.version, dir: current };
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

  // --- CycloneDX SBOM from the actual bundled runtime dependencies ---
  const timeLocPkg = join(root, 'packages', 'time-location', 'package.json');
  const baziPkg = join(root, 'packages', 'bazi', 'package.json');
  const ziweiPkg = join(root, 'packages', 'ziwei', 'package.json');
  const westernPkg = join(root, 'packages', 'western', 'package.json');
  const zod = resolveVersion('zod', timeLocPkg);
  const momentTz = resolveVersion('moment-timezone', timeLocPkg);
  const moment = resolveVersion('moment', join(momentTz.dir, 'package.json'));
  const tyme = resolveVersion('tyme4ts', baziPkg);
  const iztro = resolveVersion('iztro', ziweiPkg);
  const astroEngine = resolveVersion('astronomy-engine', westernPkg);

  const components = [
    { name: 'zod', version: zod.version, license: 'MIT' },
    { name: 'moment-timezone', version: momentTz.version, license: 'MIT' },
    { name: 'moment', version: moment.version, license: 'MIT' },
    { name: 'tyme4ts', version: tyme.version, license: 'MIT' },
    { name: 'iztro', version: iztro.version, license: 'MIT' },
    { name: 'astronomy-engine', version: astroEngine.version, license: 'MIT' },
  ].map((c) => ({
    type: 'library',
    name: c.name,
    version: c.version,
    purl: `pkg:npm/${c.name}@${c.version}`,
    licenses: [{ license: { id: c.license } }],
  }));

  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      // No wall-clock timestamp: the SBOM is a COMMITTED build artifact and must stay
      // byte-stable across rebuilds/machines (v0.1.2 reproducibility). The pinned dependency
      // versions below are the authoritative record.
      component: {
        type: 'application',
        name: 'calculate-birth-charts',
        version: '0.1.0',
      },
      tools: [{ name: 'ming-build-skill', version: '0.1.0' }],
    },
    components,
  };

  writeFileSync(join(skillDir, 'sbom.cdx.json'), `${JSON.stringify(sbom, null, 2)}\n`, 'utf8');
  console.log(
    `sbom.cdx.json written (zod ${zod.version}, moment-timezone ${momentTz.version}, moment ${moment.version}, tyme4ts ${tyme.version}, iztro ${iztro.version}, astronomy-engine ${astroEngine.version})`,
  );

  const outputs = Object.keys(result.metafile.outputs);
  console.log(`build outputs: ${outputs.join(', ')}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
