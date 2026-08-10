// Flat ESLint config — architecture boundary enforcement only.
//
// Intentionally minimal (Phase 6 hardening; see docs/VALIDATION.md). It loads the TypeScript
// parser purely so the core `no-restricted-imports` rule can read import/export specifiers, and
// encodes the two invariants from docs/ARCHITECTURE.md ("Dependency direction"):
//
//   1. `@loom/interpret` (cross-system interpretation layer, handoff §8 layer 2) may be consumed
//      ONLY by the `@loom/orchestrator` facade. No calculation package may reverse-depend on it,
//      so the deterministic compute core never points "up" into interpretation.
//   2. The calculation core is offline and deterministic: it must never import a network/transport
//      module, an AI model-provider ("vendor") SDK, or a prompt/LLM module.
//
// Violations fail `pnpm run lint`, which runs inside `pnpm run verify:all` and CI.

import tsParser from '@typescript-eslint/parser';

// AI model-provider ("vendor") SDKs. The engine emits deterministic facts for a *host* LLM; it
// never talks to a model provider itself.
const vendorSdkModules = [
  'openai',
  '@anthropic-ai/sdk',
  '@google/generative-ai',
  '@google-cloud/vertexai',
  '@azure/openai',
  '@aws-sdk/client-bedrock-runtime',
  'cohere-ai',
  '@mistralai/mistralai',
  '@huggingface/inference',
  'replicate',
  'ai',
  'langchain',
];

// Network / transport modules. The engine performs no network at runtime (docs/ARCHITECTURE.md,
// docs/PRIVACY.md); all ephemeris / TZDB / calendar data is bundled.
const networkModules = [
  'http',
  'https',
  'http2',
  'net',
  'tls',
  'dns',
  'dgram',
  'node:http',
  'node:https',
  'node:http2',
  'node:net',
  'node:tls',
  'node:dns',
  'node:dgram',
  'axios',
  'node-fetch',
  'undici',
  'got',
  'ky',
  'superagent',
  'request',
  'ws',
];

const OFFLINE_MESSAGE =
  'Calculation core is offline & deterministic: no network, AI model-provider SDK, or prompt/LLM module (docs/ARCHITECTURE.md).';

const INTERPRET_MESSAGE =
  '@loom/interpret may be imported only by @loom/orchestrator; calculation packages must not reverse-depend on it (docs/ARCHITECTURE.md).';

// Offline guard (network / vendor SDK / prompt) — applied to every package, including orchestrator.
const offlinePaths = [...networkModules, ...vendorSdkModules].map((name) => ({
  name,
  message: OFFLINE_MESSAGE,
}));

const offlinePatterns = [
  { group: ['@langchain/*', '@ai-sdk/*'], message: OFFLINE_MESSAGE },
  { group: ['*prompt*', '*prompt*/*', '**/prompts', '**/prompts/*'], message: OFFLINE_MESSAGE },
];

// Interpret-boundary guard — added on top of the offline guard for calculation packages.
const interpretPaths = [{ name: '@loom/interpret', message: INTERPRET_MESSAGE }];
const interpretPatterns = [{ group: ['@loom/interpret/*'], message: INTERPRET_MESSAGE }];

export default [
  {
    ignores: [
      '**/node_modules/**',
      'dist/**',
      'examples/**',
      'coverage/**',
      '.tmp/**',
      'skills/**/scripts/dist/**',
    ],
  },
  // Every calculation / rules / interpretation package: offline core AND no reverse dependency
  // on @loom/interpret.
  {
    files: ['packages/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [...offlinePaths, ...interpretPaths],
          patterns: [...offlinePatterns, ...interpretPatterns],
        },
      ],
    },
  },
  // The orchestrator facade is the ONLY package allowed to import @loom/interpret; it stays bound
  // by the offline (network / vendor SDK / prompt) guard.
  {
    files: ['packages/orchestrator/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: offlinePaths,
          patterns: offlinePatterns,
        },
      ],
    },
  },
];
