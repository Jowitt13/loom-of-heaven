// Offline tests for tools/validate-sbom.ts.
// Every case builds synthetic `closure` + synthetic SBOM strings entirely in
// memory. Nothing on disk is read or written; no real SBOM is touched.
import { describe, expect, it } from 'vitest';
import { validateSbom, type ValidateSbomInputs } from './validate-sbom.ts';
import type { BundlePackage } from './lib/bundle-closure.ts';

/** Build a canonical BundlePackage; individual tests can override fields. */
function pkg(name: string, version: string, license = 'MIT'): BundlePackage {
  return {
    name,
    version,
    license,
    purl: `pkg:npm/${name}@${version}`,
    packageRoot: `/fake/${name}`,
    inputs: [`node_modules/${name}/index.js`],
  };
}

const APP_NAME = 'calculate-birth-charts';
const APP_VERSION = '0.1.0';

function cdx(
  components: {
    name: string;
    version: string;
    purl?: string;
    license?: string;
    expression?: string;
    type?: string;
  }[],
) {
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      component: { type: 'application', name: APP_NAME, version: APP_VERSION },
      tools: [{ name: 'ming-build-skill', version: '0.1.0' }],
    },
    components: components.map((c) => ({
      type: c.type ?? 'library',
      name: c.name,
      version: c.version,
      purl: c.purl ?? `pkg:npm/${c.name}@${c.version}`,
      licenses: c.expression
        ? [{ expression: c.expression }]
        : [{ license: { id: c.license ?? 'MIT' } }],
    })),
  };
}

function spdx(components: { name: string; version: string; purl?: string; license?: string }[]) {
  const spdxPackages = components.map((c) => ({
    name: c.name,
    SPDXID: `SPDXRef-Package-${c.name.replace(/[^A-Za-z0-9.-]/g, '-')}`,
    versionInfo: c.version,
    downloadLocation: 'NOASSERTION',
    filesAnalyzed: false,
    licenseConcluded: c.license ?? 'MIT',
    licenseDeclared: c.license ?? 'MIT',
    externalRefs: [
      {
        referenceCategory: 'PACKAGE-MANAGER',
        referenceType: 'purl',
        referenceLocator: c.purl ?? `pkg:npm/${c.name}@${c.version}`,
      },
    ],
  }));
  return {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: `${APP_NAME}-${APP_VERSION}`,
    documentNamespace: `https://github.com/Jowitt13/ming-engine/spdx/${APP_NAME}-${APP_VERSION}`,
    creationInfo: {
      created: '2026-01-01T00:00:00Z',
      creators: ['Tool: ming-build-skill-0.1.0'],
      comment: 'test fixture',
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
}

/** Serialize as the build tool does: `JSON.stringify(x, null, 2) + '\n'`. */
function ser(obj: unknown): string {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

/** Build a valid triple (closure + matching CycloneDX + matching SPDX). */
function goodTriple(): ValidateSbomInputs {
  const closure = [pkg('zod', '4.4.3'), pkg('moment', '2.30.1')];
  const cdxObj = cdx(closure.map((p) => ({ name: p.name, version: p.version })));
  const spdxObj = spdx(closure.map((p) => ({ name: p.name, version: p.version })));
  return {
    closure,
    cdxText: ser(cdxObj),
    spdxText: ser(spdxObj),
    exceptions: [],
    cdxPath: '/mem/sbom.cdx.json',
    spdxPath: '/mem/sbom.spdx.json',
  };
}

function failedNames(input: ValidateSbomInputs): string[] {
  return validateSbom(input)
    .filter((c) => !c.ok)
    .map((c) => c.name);
}

describe('validate-sbom (offline synthetic)', () => {
  it('1. clean triple -> zero failures', () => {
    expect(failedNames(goodTriple())).toEqual([]);
  });

  it('2. metafile has an extra package that SBOM does not list -> FAIL both cyclonedx and spdx has X', () => {
    const t = goodTriple();
    t.closure.push(pkg('astronomy-engine', '2.1.19'));
    const failed = failedNames(t);
    expect(failed).toContain('cyclonedx has astronomy-engine');
    expect(failed).toContain('spdx has astronomy-engine');
  });

  it('3. SBOMs list a ghost package not in closure -> FAIL', () => {
    const t = goodTriple();
    const cdxObj = cdx([
      ...t.closure.map((p) => ({ name: p.name, version: p.version })),
      { name: 'ghost', version: '1.0.0' },
    ]);
    const spdxObj = spdx([
      ...t.closure.map((p) => ({ name: p.name, version: p.version })),
      { name: 'ghost', version: '1.0.0' },
    ]);
    t.cdxText = ser(cdxObj);
    t.spdxText = ser(spdxObj);
    const failed = failedNames(t);
    expect(failed).toContain('cyclonedx has no ghost package: ghost');
    expect(failed).toContain('spdx has no ghost package: ghost');
  });

  it('4. CycloneDX version differs from SPDX for the same package -> FAIL', () => {
    const t = goodTriple();
    const cdxObj = cdx([
      { name: 'zod', version: '4.4.3' },
      { name: 'moment', version: '2.30.1' },
    ]);
    const spdxObj = spdx([
      { name: 'zod', version: '4.4.99' },
      { name: 'moment', version: '2.30.1' },
    ]);
    t.cdxText = ser(cdxObj);
    t.spdxText = ser(spdxObj);
    const failed = failedNames(t);
    expect(failed).toContain('spdx version matches: zod');
    expect(failed).toContain('cyclonedx set equals spdx set');
  });

  it('5. license mismatch vs closure -> FAIL both formats', () => {
    const t = goodTriple();
    const cdxObj = cdx([
      { name: 'zod', version: '4.4.3', license: 'Apache-2.0' },
      { name: 'moment', version: '2.30.1' },
    ]);
    t.cdxText = ser(cdxObj);
    const failed = failedNames(t);
    expect(failed).toContain('cyclonedx license matches: zod');
    expect(failed).toContain('cyclonedx set equals spdx set');
  });

  it('6. purl not equal to name@version -> FAIL', () => {
    const t = goodTriple();
    const cdxObj = cdx([
      { name: 'zod', version: '4.4.3', purl: 'pkg:npm/zod@9.9.9' },
      { name: 'moment', version: '2.30.1' },
    ]);
    t.cdxText = ser(cdxObj);
    const failed = failedNames(t);
    expect(failed).toContain('cyclonedx purl matches: zod');
  });

  it('7. application component name drift -> FAIL', () => {
    const t = goodTriple();
    const cdxObj: {
      metadata?: { component?: { name?: string; version?: string } };
    } = JSON.parse(t.cdxText);
    if (cdxObj.metadata?.component) cdxObj.metadata.component.name = 'other-app';
    t.cdxText = ser(cdxObj);
    const failed = failedNames(t);
    expect(failed).toContain(`cyclonedx application component is ${APP_NAME}`);
  });

  it('8. byte-instability: extra whitespace on disk -> FAIL byte-stable check', () => {
    const t = goodTriple();
    // Prepend a whitespace character so the disk bytes do not match a re-serialization.
    t.cdxText = '\n' + t.cdxText;
    const failed = failedNames(t);
    expect(failed).toContain('cyclonedx SBOM is byte-stable (reserialization matches disk)');
  });

  it('9. same closure package present via multiple inputs -> not double-counted', () => {
    const t = goodTriple();
    // Duplicate the closure entry as if two different metafile inputs mapped
    // to it. The dedupe happens upstream in computeBundleClosure; here we
    // simply assert validate-sbom does not emit spurious extra "has X" FAILs.
    // For robustness we also add a second copy with a different `packageRoot`
    // but the same name/version/license (which validate-sbom is agnostic to).
    const dup = { ...pkg('zod', '4.4.3'), packageRoot: '/fake/zod-dup' };
    t.closure.push(dup);
    const failed = failedNames(t);
    // Validate-sbom builds a Map by name; the duplicate is idempotent.
    expect(failed.filter((n) => n.startsWith('cyclonedx has zod'))).toEqual([]);
    expect(failed.filter((n) => n.startsWith('spdx has zod'))).toEqual([]);
  });

  it('10. documented exception permits a non-closure package with matching version', () => {
    const t = goodTriple();
    // Both SBOMs list a package that is not in the closure but the exceptions
    // file permits it explicitly. The gate should pass.
    const cdxObj = cdx([
      ...t.closure.map((p) => ({ name: p.name, version: p.version })),
      { name: 'legacy-tool', version: '0.0.1' },
    ]);
    const spdxObj = spdx([
      ...t.closure.map((p) => ({ name: p.name, version: p.version })),
      { name: 'legacy-tool', version: '0.0.1' },
    ]);
    t.cdxText = ser(cdxObj);
    t.spdxText = ser(spdxObj);
    t.exceptions = [
      {
        name: 'legacy-tool',
        version: '0.0.1',
        reason: 'documented ship of hand-audited fixture',
        expires: '2099-12-31',
      },
    ];
    const failed = failedNames(t);
    // 'has no ghost' checks turn into 'extra allowed' PASSes.
    expect(failed).not.toContain('cyclonedx has no ghost package: legacy-tool');
    expect(failed).not.toContain('spdx has no ghost package: legacy-tool');
  });

  it('10b. exception name matches but version differs -> FAIL (still catches drift)', () => {
    const t = goodTriple();
    const cdxObj = cdx([
      ...t.closure.map((p) => ({ name: p.name, version: p.version })),
      { name: 'legacy-tool', version: '0.0.2' },
    ]);
    const spdxObj = spdx([
      ...t.closure.map((p) => ({ name: p.name, version: p.version })),
      { name: 'legacy-tool', version: '0.0.2' },
    ]);
    t.cdxText = ser(cdxObj);
    t.spdxText = ser(spdxObj);
    t.exceptions = [
      { name: 'legacy-tool', version: '0.0.1', reason: 'doc', expires: '2099-12-31' },
    ];
    const failed = failedNames(t);
    expect(failed).toContain('cyclonedx extra allowed: legacy-tool@0.0.2');
    expect(failed).toContain('spdx extra allowed: legacy-tool@0.0.2');
  });

  it('11. only CycloneDX has a package (SPDX missing it) -> set-mismatch FAIL', () => {
    const t = goodTriple();
    const cdxObj = cdx(t.closure.map((p) => ({ name: p.name, version: p.version })));
    // Remove `moment` from SPDX.
    const spdxObj = spdx([{ name: 'zod', version: '4.4.3' }]);
    t.cdxText = ser(cdxObj);
    t.spdxText = ser(spdxObj);
    const failed = failedNames(t);
    expect(failed).toContain('spdx has moment');
    expect(failed).toContain('cyclonedx set equals spdx set');
  });
});
