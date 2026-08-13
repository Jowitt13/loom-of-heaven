/**
 * Candidate-only publishing model for the standalone nonclinical personality Skill.
 *
 * This intentionally does not reuse the chart Skill's root manifest or release constants:
 * the P9 Skill has its own version line and must be released independently. Everything
 * generated from this config is written below the ignored `releases/` directory until an
 * explicitly authorized P9 release creates an immutable tag and assets.
 */

export type PsychologyHostId = 'codex' | 'qoder' | 'workbuddy' | 'doubao';

export interface PsychologyHostConfig {
  id: PsychologyHostId;
  label: string;
  format: string;
  packageName: string;
  releaseAsset: string;
  needsUserAuth: boolean;
  /** Candidate packages are not proof of an actual host installation. */
  realDeviceVerified: boolean;
  runtime: string;
}

export const PSYCHOLOGY_SKILL_NAME = 'psychology-self-assessment';
export const PSYCHOLOGY_PRODUCT = 'loom-of-heaven';
export const PSYCHOLOGY_REPO_URL = 'https://github.com/Jowitt13/loom-of-heaven';

/** This is the source Skill version, not a root engine release version. */
export const PSYCHOLOGY_RELEASE_VERSION = '0.1.0';
/** Reserved immutable tag name for the first separately authorized P9 release. */
export const PSYCHOLOGY_CANDIDATE_TAG = 'psychology-self-assessment-v0.1.0';
/** Gitignored candidate output. The suffix makes its unpublished state obvious on disk. */
export const PSYCHOLOGY_CANDIDATE_DIR = 'psychology-self-assessment-v0.1.0-candidate';
export const PSYCHOLOGY_RUNTIME = 'Node.js >=22';
export const PSYCHOLOGY_ENGINE_SELF_CHECK = 'node scripts/psychology.mjs verify';

/** There is deliberately no published P9 tag or manifest promotion yet. */
export const PUBLISHED_PSYCHOLOGY_RELEASE_TAG: string | null = null;

export const PSYCHOLOGY_HOSTS: readonly PsychologyHostConfig[] = [
  {
    id: 'codex',
    label: 'Codex（及任何读取 SKILL.md 的兼容宿主）',
    format: 'Skill 文件夹或单层 ZIP',
    packageName: PSYCHOLOGY_SKILL_NAME,
    releaseAsset: 'psychology-self-assessment-codex.zip',
    needsUserAuth: false,
    realDeviceVerified: false,
    runtime: PSYCHOLOGY_RUNTIME,
  },
  {
    id: 'qoder',
    label: 'Qoder / Qoder CN',
    format: '标准 SKILL.md 单层 ZIP，由内置 Agent 导入',
    packageName: PSYCHOLOGY_SKILL_NAME,
    releaseAsset: 'psychology-self-assessment-qoder.zip',
    needsUserAuth: true,
    realDeviceVerified: false,
    runtime: PSYCHOLOGY_RUNTIME,
  },
  {
    id: 'workbuddy',
    label: '腾讯 WorkBuddy（OpenClaw）',
    format: 'OpenClaw Skill 单层 ZIP',
    packageName: PSYCHOLOGY_SKILL_NAME,
    releaseAsset: 'psychology-self-assessment-workbuddy.zip',
    needsUserAuth: true,
    realDeviceVerified: false,
    runtime: PSYCHOLOGY_RUNTIME,
  },
  {
    id: 'doubao',
    label: '豆包电脑版',
    format: '可导入 Skill 文件夹或单层 ZIP',
    packageName: PSYCHOLOGY_SKILL_NAME,
    releaseAsset: 'psychology-self-assessment-doubao.zip',
    needsUserAuth: true,
    realDeviceVerified: false,
    runtime: PSYCHOLOGY_RUNTIME,
  },
];

export function assertPsychologyCandidateBoundary(
  candidateTag: string = PSYCHOLOGY_CANDIDATE_TAG,
  publishedTag: string | null = PUBLISHED_PSYCHOLOGY_RELEASE_TAG,
): { ok: boolean; error?: string } {
  if (!/^psychology-self-assessment-v\d+\.\d+\.\d+$/.test(candidateTag)) {
    return { ok: false, error: `invalid P9 candidate tag: ${candidateTag}` };
  }
  if (publishedTag !== null && candidateTag === publishedTag) {
    return {
      ok: false,
      error: `P9 candidate tag "${candidateTag}" must differ from the published tag`,
    };
  }
  return { ok: true };
}
