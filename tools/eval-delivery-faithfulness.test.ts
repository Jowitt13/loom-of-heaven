import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  readCommittedDeliveryFaithfulnessArtifact,
  verifyDeliveryFaithfulnessArtifact,
} from './eval/verify-delivery-faithfulness.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

type JsonRecord = Record<string, unknown>;

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function fixture(): JsonRecord {
  return copy(readCommittedDeliveryFaithfulnessArtifact().artifact as JsonRecord);
}

function list(source: JsonRecord, key: string): JsonRecord[] {
  return source[key] as JsonRecord[];
}

describe('IQ-2B transient delivery faithfulness artifact', () => {
  it('accepts the committed synthetic artifact with complete paragraph, claim and condition links', () => {
    const result = verifyDeliveryFaithfulnessArtifact(readCommittedDeliveryFaithfulnessArtifact());
    expect(result).toEqual({
      ok: true,
      paragraphIds: ['paragraph-1', 'paragraph-2'],
      assertionIds: [
        'assertion:synthetic:iq2b-bazi-iteration',
        'assertion:synthetic:iq2b-western-adjustment',
      ],
      issues: [],
    });
    expect(JSON.stringify(result)).not.toContain('score');
  });

  it('is byte-identical for the same synthetic transient artifact', () => {
    const first = verifyDeliveryFaithfulnessArtifact(readCommittedDeliveryFaithfulnessArtifact());
    const second = verifyDeliveryFaithfulnessArtifact(readCommittedDeliveryFaithfulnessArtifact());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('rejects a trace whose visible text does not exactly match its delivery span', () => {
    const input = fixture();
    const paragraphs = list(input, 'paragraphs');
    (paragraphs[0]!.trace as JsonRecord).visibleText = '不存在的交付段落。';
    const result = verifyDeliveryFaithfulnessArtifact({ artifact: input });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'PARAGRAPH_LINKAGE',
      path: '$.artifact.paragraphs[0].trace',
    });
  });

  it('rejects non-whitespace prose outside the ordered paragraph coverage', () => {
    const input = fixture();
    input.visibleText = `${input.visibleText as string}额外结论。`;
    const result = verifyDeliveryFaithfulnessArtifact({ artifact: input });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'PARAGRAPH_LINKAGE',
      path: '$.artifact.paragraphs',
    });
  });

  it('rejects an assertion that is not linked to an approved claim', () => {
    const input = fixture();
    list(input, 'assertionSpans')[0]!.claimId = 'approved-claim:fact-999';
    const result = verifyDeliveryFaithfulnessArtifact({ artifact: input });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'FACTUAL_ASSERTION_UNSUPPORTED',
      path: '$.artifact.assertionSpans[0]',
    });
  });

  it('rejects a wrong-system assertion even when its approved claim id exists', () => {
    const input = fixture();
    list(input, 'assertionSpans')[0]!.assertedSystem = 'western';
    const result = verifyDeliveryFaithfulnessArtifact({ artifact: input });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'FACTUAL_ASSERTION_CONTRADICTED',
      path: '$.artifact.assertionSpans[0]',
    });
  });

  it('rejects a professional mechanism that neither the claim nor trace admits', () => {
    const input = fixture();
    list(input, 'assertionSpans')[0]!.mechanismRef = 'bazi-rule/synthetic/invented-term';
    const result = verifyDeliveryFaithfulnessArtifact({ artifact: input });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'PROFESSIONAL_TERM_UNSUPPORTED',
      path: '$.artifact.assertionSpans[0]',
    });
  });

  it('requires one delivery span for every trace-bound material condition', () => {
    const input = fixture();
    input.conditionSpans = [];
    const result = verifyDeliveryFaithfulnessArtifact({ artifact: input });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'MATERIAL_CONDITION_OMITTED',
      path: '$.artifact.paragraphs.paragraph-1.trace',
    });
  });

  it('rejects forbidden default footer leakage from the final visible delivery text', () => {
    const input = fixture();
    input.visibleText = `${input.visibleText as string}\n\n声明：合成文字。`;
    const result = verifyDeliveryFaithfulnessArtifact({ artifact: input });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'FORBIDDEN_FOOTER_LEAKAGE',
      path: '$.artifact.visibleText',
    });
  });

  it('fails closed on private-field drift without echoing the value', () => {
    const input = fixture();
    input.rawUserPrompt = 'IQ2B-PRIVATE-SENTINEL';
    const result = verifyDeliveryFaithfulnessArtifact({ artifact: input });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({ code: 'PRIVACY', path: '$.artifact.rawUserPrompt' });
    expect(result.issues).toContainEqual({ code: 'ARTIFACT_SHAPE', path: '$.artifact' });
    expect(JSON.stringify(result)).not.toContain('IQ2B-PRIVATE-SENTINEL');
  });

  it('keeps the schema strict, synthetic-only, transient and free of aggregate metric fields', () => {
    const schema = JSON.parse(
      readFileSync(
        join(root, 'evals/contracts/delivery-faithfulness-artifact.schema.json'),
        'utf8',
      ),
    ) as JsonRecord;
    expect(schema.$id).toBe('loom:eval/delivery-faithfulness-artifact/v1');
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual([
      'contractVersion',
      'artifactId',
      'fixtureKind',
      'mode',
      'topic',
      'transient',
      'regenerable',
      'visibleText',
      'approvedClaims',
      'paragraphs',
      'assertionSpans',
      'conditionSpans',
      'exclusionPolicy',
    ]);
    const properties = schema.properties as JsonRecord;
    expect((properties.fixtureKind as JsonRecord).const).toBe('synthetic-technical');
    expect((properties.transient as JsonRecord).const).toBe(true);
    for (const key of Object.keys(properties)) {
      expect(/score|weight|percent|confidence|accuracy/i.test(key), key).toBe(false);
    }
  });

  it('keeps the verifier outside runtime, Skill, network and process-launch paths', () => {
    const verifier = readFileSync(join(root, 'tools/eval/verify-delivery-faithfulness.ts'), 'utf8');
    for (const forbidden of ['fetch(', 'child_process', 'spawn', 'openai', 'https://']) {
      expect(verifier, forbidden).not.toContain(forbidden);
    }
    for (const relative of [
      'packages/interpret/src/index.ts',
      'packages/orchestrator/src/interpret.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
      'package.json',
      'packages/contracts/src/index.ts',
    ]) {
      expect(readFileSync(join(root, relative), 'utf8'), relative).not.toContain(
        'verify-delivery-faithfulness',
      );
    }
  });
});
