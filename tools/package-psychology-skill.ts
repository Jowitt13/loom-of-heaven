import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildZip, collectFiles, normalizeZipEntryData, verifyZip } from './lib/zip.ts';

/** Package only the standalone P9 Skill; it never enters the chart-host release assets. */
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const name = 'psychology-self-assessment';
const source = join(root, 'skills', name);
const dist = join(root, 'dist');
const stage = join(dist, name);

function main(): void {
  if (!existsSync(join(source, 'scripts', 'dist', 'psychology-engine.mjs'))) {
    throw new Error(
      'psychology engine bundle missing; run `pnpm run build:psychology-skill` first',
    );
  }
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  cpSync(source, stage, {
    recursive: true,
    filter: (path) => !/[\\/]\.tmp([\\/]|$)/.test(path),
  });
  const files = collectFiles(stage, stage).map((file) => ({
    name: `${name}/${file.name}`,
    data: normalizeZipEntryData(file.name, file.data),
  }));
  const zip = buildZip(files);
  if (!verifyZip(zip, files)) throw new Error('psychology zip self-verification failed');
  const zipPath = join(dist, `${name}.zip`);
  writeFileSync(zipPath, zip);
  const sha256 = createHash('sha256').update(zip).digest('hex');
  writeFileSync(join(dist, `${name}.sha256`), `${sha256}  ${name}.zip\n`, 'utf8');
  process.stdout.write(`Packaged ${files.length} files: dist/${name}.zip (${zip.length} bytes)\n`);
  process.stdout.write(`SHA-256: ${sha256}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
}
