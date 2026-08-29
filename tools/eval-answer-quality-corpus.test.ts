import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  IQ0B_EXPECTED_CASE_IDS,
  readCommittedAnswerQualityCorpus,
  verifyAnswerQualityCorpus,
  type AnswerQualityCorpusInputs,
} from './eval/verify-answer-quality-corpus.ts';

const root = join(__dirname, '..');
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function corpusInputs(): AnswerQualityCorpusInputs {
  const committed = readCommittedAnswerQualityCorpus();
  return {
    corpus: copy(committed.corpus),
    evidenceBundle: copy(committed.evidenceBundle),
    visibleArtifacts: new Map(
      [...committed.visibleArtifacts].map(([path, artifact]) => [path, copy(artifact)]),
    ),
    reviewLinkageFixture: copy(committed.reviewLinkageFixture),
  };
}

function verify(inputs: AnswerQualityCorpusInputs = corpusInputs()) {
  return verifyAnswerQualityCorpus(inputs);
}

function issueCodes(result: ReturnType<typeof verify>) {
  return result.issues.map((issue) => issue.code);
}

describe('IQ-0B public synthetic career corpus', () => {
  it('accepts the committed candidate-only corpus and repeats byte-identically', () => {
    const result = verify();
    expect(result).toEqual({
      ok: true,
      developmentCaseCount: 20,
      adversarialCaseCount: 6,
      visibleArtifactCount: 26,
      reviewRecordsVerified: 3,
      issues: [],
    });
    expect(verify()).toEqual(result);
  });

  it('locks the exact public split, case sequence, and all frozen challenge/failure coverage', () => {
    const inputs = corpusInputs();
    const corpus = inputs.corpus as { cases: Array<{ caseId: string }> };
    expect(corpus.cases.map((entry) => entry.caseId)).toEqual(IQ0B_EXPECTED_CASE_IDS);
    expect(corpus.cases.slice(0, 20)).toHaveLength(20);
    expect(corpus.cases.slice(20)).toHaveLength(6);

    corpus.cases.splice(3, 1);
    expect(issueCodes(verify(inputs))).toContain('COVERAGE');
  });

  it('fails closed when a candidate artifact no longer matches the case-bound digest', () => {
    const inputs = corpusInputs();
    const [path, artifact] = [...inputs.visibleArtifacts][0] as [string, { visibleText: string }];
    artifact.visibleText = `${artifact.visibleText}\n新增的未绑定文本。`;
    (inputs.visibleArtifacts as Map<string, unknown>).set(path, artifact);

    expect(issueCodes(verify(inputs))).toContain('DIGEST_LINKAGE');
  });

  it('rejects acceptance status, forbidden raw fields, and default-output headings', () => {
    const statusDrift = corpusInputs();
    (statusDrift.corpus as { mode: string }).mode = 'accepted-reference';
    expect(issueCodes(verify(statusDrift))).toContain('CANDIDATE_BOUNDARY');

    const privacyDrift = corpusInputs();
    (privacyDrift.corpus as Record<string, unknown>).rawPrompt = 'not permitted';
    expect(issueCodes(verify(privacyDrift))).toContain('PRIVACY');

    const headingDrift = corpusInputs();
    const [path, artifact] = [...headingDrift.visibleArtifacts].find(([path]) =>
      path.includes('/iq0b-dev-'),
    ) as [string, { visibleText: string }];
    artifact.visibleText = `${artifact.visibleText}\n声明`;
    (headingDrift.visibleArtifacts as Map<string, unknown>).set(path, artifact);
    expect(issueCodes(verify(headingDrift))).toContain('CANDIDATE_BOUNDARY');
  });

  it('keeps synthetic review linkage structural-only and rejects self-reconciliation', () => {
    const inputs = corpusInputs();
    const reviewFixture = inputs.reviewLinkageFixture as {
      mode: string;
      reviewRecords: Array<{ reviewId: string; sourceReviewIds: string[] }>;
    };
    expect(reviewFixture.mode).toBe('structural-linkage-only-not-human-review');
    reviewFixture.reviewRecords[2].sourceReviewIds = [reviewFixture.reviewRecords[2].reviewId];

    expect(issueCodes(verify(inputs))).toContain('REVIEW_LINKAGE');
  });

  it('keeps adversarial samples out of development candidate acceptance claims', () => {
    const inputs = corpusInputs();
    const corpus = inputs.corpus as {
      cases: Array<{ split: string; answerArtifact: { repoPath: string } }>;
    };
    const adversarial = corpus.cases.filter((entry) => entry.split === 'adversarial');
    expect(adversarial).toHaveLength(6);
    for (const entry of adversarial) {
      const artifact = inputs.visibleArtifacts.get(entry.answerArtifact.repoPath) as {
        exclusionPolicy: string[];
      };
      expect(artifact.exclusionPolicy).toContain('adversarial-candidate-not-production-output');
    }
  });

  it('keeps corpus machinery out of runtime and network paths', () => {
    const runtimeEntrypoints = [
      'packages/bazi-rules/src/index.ts',
      'packages/interpret/src/build.ts',
      'packages/contracts/src/index.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
      'package.json',
    ];
    for (const path of runtimeEntrypoints) {
      expect(readFileSync(join(root, path), 'utf8'), path).not.toContain(
        'verify-answer-quality-corpus',
      );
    }
    const verifierSource = readFileSync(
      join(root, 'tools/eval/verify-answer-quality-corpus.ts'),
      'utf8',
    );
    for (const forbiddenFragment of ['fetch(', 'https://', 'child_process', 'openai']) {
      expect(verifierSource).not.toContain(forbiddenFragment);
    }
  });
});
