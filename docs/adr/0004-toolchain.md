# ADR 0004: Toolchain — TypeScript 5.9, pnpm workspace, esbuild, Zod 4, Vitest

- Status: Accepted
- Date: 2026-07-21

## Context

Handoff §3.1 mandates TypeScript strict, current Node LTS, pnpm workspace, Zod, Vitest, an
esbuild-style bundle, and self-contained ESM scripts. Exact versions are time-sensitive and
were checked against the live registry at project start.

## Decision

- **Node 24 LTS** runtime. Source files use explicit `.ts` import extensions so Node's native
  type-stripping runs the tools directly and esbuild/tsc resolve identically
  (`allowImportingTsExtensions` + `moduleResolution: Bundler`, `noEmit`).
- **TypeScript `~5.9.3`** (Apache-2.0). The registry `latest` is `7.0.2` (the native compiler),
  but for a determinism-focused engine we pin the mature 5.9 line to avoid new-major surprises;
  revisit once TS 7 has soaked.
- **pnpm workspace** with isolated `node_modules`. Runtime deps (`zod`, `moment-timezone`) live
  in the packages that use them; the engine bundle inlines them.
- **esbuild `^0.28.1`** (MIT) bundles `orchestrator/src/engine-entry.ts` to one ESM file,
  unminified for auditability.
- **Zod `^4.4.3`** (MIT) for schemas. Nested object defaults use `.prefault({})` (Zod 4 applies
  `.default()` against the output type). `z.strictObject` rejects unknown input keys.
- **Vitest `^4.1.10`** (MIT) runs TS tests directly. `strict` + `noUnusedLocals` etc. are the
  lint gate for now.
- Formatting via **Prettier `^3.9.6`**. ESLint is deferred to a later hardening phase and noted
  in STATUS.

## Consequences

- One import style works across Node runtime, esbuild and tsc.
- `verbatimModuleSyntax` was dropped in favor of `esModuleInterop` because the one CJS dep
  (moment-timezone) is default-imported; `import type` discipline is kept for isolatedModules.
- CI-equivalent gate: `typecheck → test → build → validate:skill → smoke`.
