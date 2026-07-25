import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { lintReading } from '../packages/interpret/src/reading-lint.ts';

/**
 * Offline, no-network, no-LLM static validator for the topic example libraries and the
 * output-narration spec (ADR 0010). It proves the SPEC + SAMPLES are structurally complete
 * (7-step 优秀 cases, no absolutist words in the good examples, timeline shows both sides,
 * facts↔evidence correspondence). It canNOT prove that a host model will follow the style
 * 100% of the time — that limitation is stated in docs/VALIDATION.md. Exit non-zero on failure.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const skillDir = join(root, 'skills', 'calculate-birth-charts');
const refDir = join(skillDir, 'references');
const skillMdPath = join(skillDir, 'SKILL.md');

const EXAMPLE_FILES = ['examples-career.md', 'examples-love.md', 'examples-wealth.md'];
const BANNED = [
  '天生不能',
  '注定',
  '必须创业',
  '必分手',
  '必结婚',
  '必发财',
  '稳赚',
  '一定会',
  '必婚',
  '必分',
  '一定发财',
];
const SEVEN_STEPS = [
  '30秒看懂',
  '现实中会怎么表现',
  '最可能出现的具体场景',
  '时间线',
  '可以怎么做',
  '专业依据',
  '信息可靠性与声明',
];
const SCENE_WORDS = ['例如', '可能表现为', '常见场景是'];

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}
const checks: Check[] = [];
const add = (name: string, ok: boolean, detail?: string): void => {
  checks.push(detail === undefined ? { name, ok } : { name, ok, detail });
};

/** The end-to-end 优秀 block: from a `### …✅…` heading to the next 3-hash `### ` heading. */
function goodBlock(md: string): string {
  const lines = md.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^###\s+.*✅/.test(lines[i]!)) {
      start = i;
      break;
    }
  }
  if (start < 0) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^###\s/.test(lines[i]!)) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** Good-example scope for the banned-word check: the 优秀 block + every 局部改写 `✅` line. */
function goodContent(md: string): string {
  const block = goodBlock(md);
  const rewriteGood = md
    .split(/\r?\n/)
    .filter((l) => /^\s*[-*]\s*✅/.test(l))
    .join('\n');
  return `${block}\n${rewriteGood}`;
}

/** The `### 输入事实` section text (up to the next 3-hash heading). */
function sectionAfter(md: string, headingRe: RegExp): string {
  const lines = md.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headingRe.test(lines[i]!)) {
      start = i;
      break;
    }
  }
  if (start < 0) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^###?\s/.test(lines[i]!)) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

/** ref:/ruleId: tokens declared in a facts section. */
function refTokens(text: string): string[] {
  const out: string[] = [];
  const re = /(?:ref|ruleId):\s*([^\s|、，)）]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1]!);
  return out;
}

// --- Per-file structural checks ---------------------------------------------------
for (const file of EXAMPLE_FILES) {
  const p = join(refDir, file);
  const ok = existsSync(p);
  add(`example file exists: references/${file}`, ok);
  if (!ok) continue;
  const md = readFileSync(p, 'utf8');

  add(`${file}: has 输入事实`, /###\s+输入事实/.test(md));
  add(`${file}: has ❌ 错误表达`, /###\s+❌/.test(md));
  add(`${file}: has 错在哪里`, /###\s+错在哪里/.test(md));
  add(`${file}: has ✅ 优秀表达`, /###\s+.*✅/.test(md));
  add(`${file}: has 对照检查`, /###\s+对照检查/.test(md));
  add(`${file}: has 输出自检清单`, /##\s+输出自检清单/.test(md));

  const block = goodBlock(md);
  const missingSteps = SEVEN_STEPS.filter((s) => !block.includes(s));
  add(`${file}: 优秀案例含 7 个步骤`, missingSteps.length === 0, missingSteps.join('、'));

  const good = goodContent(md);
  const hitBanned = BANNED.filter((w) => good.includes(w));
  add(`${file}: 优秀表达无绝对化词`, hitBanned.length === 0, hitBanned.join('、'));

  // ADR 0011: the user-visible narration is a no-term zone. lint-reading exempts the
  // 专业依据/声明 sections, so the end-to-end 优秀正文 (steps 1-5) must be term-free, and
  // every 局部改写 `✅ 用户可见表达` line (checked in strict/simple mode) must be term-free too.
  const lintMain = lintReading(block, { channel: 'topic' });
  add(
    `${file}: 优秀正文无命理术语/黑话 (lint-reading)`,
    lintMain.ok,
    lintMain.violations
      .filter((v) => v.severity === 'error')
      .map((v) => `${v.term}@${v.section}`)
      .join('、'),
  );
  const visibleRewrite = md
    .split(/\r?\n/)
    .filter((l) => /✅\s*用户可见/.test(l))
    .join('\n');
  const lintRewrite = lintReading(visibleRewrite, { channel: 'topic', simple: true });
  add(
    `${file}: 局部改写 ✅用户可见 无术语`,
    lintRewrite.ok,
    lintRewrite.violations
      .filter((v) => v.severity === 'error')
      .map((v) => v.term)
      .join('、'),
  );

  add(
    `${file}: 优秀表达含现实场景词`,
    SCENE_WORDS.some((w) => block.includes(w)),
  );
  add(`${file}: 时间线含有利+风险两路`, block.includes('有利') && block.includes('风险'));
  add(`${file}: 免责(非科学预测)在优秀报告出现`, block.includes('非科学预测'));

  const inputRefs = refTokens(sectionAfter(md, /###\s+输入事实/));
  const linkedRef = inputRefs.find((r) => block.includes(r));
  add(
    `${file}: facts↔优秀表达 evidence/ref 对应`,
    linkedRef !== undefined,
    linkedRef ?? 'no ref overlap',
  );
}

// --- SKILL.md references the three files + double-channel (no unconditional full display) ---
if (existsSync(skillMdPath)) {
  const skill = readFileSync(skillMdPath, 'utf8');
  for (const file of EXAMPLE_FILES) {
    add(`SKILL.md references ${file}`, skill.includes(file));
  }
  add(
    'SKILL.md 声明主题不前置全盘（双通道）',
    skill.includes('Channel A') &&
      skill.includes('Channel B') &&
      skill.includes('never front-load the three raw charts into a topic report'),
  );
}

// --- Self-test: the banned-word detector must flag a bad ✅ and pass a clean one ------
const synthBad = '#### 1. 30秒看懂\n你注定发不了财。';
const synthGood = '#### 1. 30秒看懂\n例如你可能表现为按部就班、稳步推进。';
add(
  'self-test: 检测器能抓到坏示例中的绝对化词',
  BANNED.some((w) => synthBad.includes(w)),
);
add('self-test: 干净示例不误报', !BANNED.some((w) => synthGood.includes(w)));

// --- Self-test: lint-reading must flag 正文 terms and pass a clean plain 正文 ----------
const lintBad = lintReading('#### 1. 30秒看懂\n你食伤生财、官杀藏而不透、甲戌大运偏中性。');
const lintClean = lintReading('#### 1. 30秒看懂\n你更适合把一门本事练扎实，慢慢让别人看见。');
add('self-test: lint-reading 抓到正文命理术语', !lintBad.ok);
add('self-test: lint-reading 干净口语正文通过', lintClean.ok);

// --- Report ---
const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  const mark = c.ok ? 'PASS' : 'FAIL';
  const detail = c.detail ? ` (${c.detail})` : '';
  process.stdout.write(`[${mark}] ${c.name}${detail}\n`);
}
process.stdout.write(
  `\n${checks.length - failed.length}/${checks.length} reading-example checks passed.\n`,
);
process.stdout.write(
  `Note: static checks prove spec/sample structure, not 100% host-model style compliance.\n`,
);
if (failed.length > 0) process.exit(1);
