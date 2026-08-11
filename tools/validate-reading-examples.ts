import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { lintReading } from '../packages/interpret/src/reading-lint.ts';

/**
 * Offline V1 narration-spec validator. It checks that the shipped examples model the
 * default delivery surface: natural prose with terms, mechanisms and implications,
 * while source traces remain explicitly internal. It cannot prove host-model semantics.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const refDir = join(root, 'skills', 'xuan-ji-yu-heng', 'references');
const skillMdPath = join(root, 'skills', 'xuan-ji-yu-heng', 'SKILL.md');
const stylePath = join(refDir, 'reading-style.md');

const EXAMPLE_FILES = ['examples-career.md', 'examples-love.md', 'examples-wealth.md'];
const FATE_WORDS = ['注定在一起', '必分手', '必然分手', '一定分手', '必然结婚', '一定结婚'];
const TERM_RE = /月令|日主|官杀|中天|MC|官禄宫|夫妻宫|第七宫主星|日支|财星|劫财|财帛宫|金星/;

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}
const checks: Check[] = [];
const add = (name: string, ok: boolean, detail?: string): void => {
  checks.push(detail === undefined ? { name, ok } : { name, ok, detail });
};

function sectionAfter(md: string, heading: string): string {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^#{2,3} ${heading}$`).test(line));
  if (start < 0) return '';
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    if (/^#{2,3} /.test(lines[index]!)) {
      end = index;
      break;
    }
  }
  return lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
}

for (const file of EXAMPLE_FILES) {
  const path = join(refDir, file);
  const exists = existsSync(path);
  add(`example exists: references/${file}`, exists);
  if (!exists) continue;

  const md = readFileSync(path, 'utf8');
  const input = sectionAfter(md, '输入事实');
  const delivery = sectionAfter(md, '可交付示例');
  const trace = sectionAfter(md, '内部来源（默认不展示）');

  add(`${file}: 输入事实存在`, input.length > 0);
  add(`${file}: 可交付示例存在`, delivery.length > 0);
  add(`${file}: 内部来源存在`, trace.length > 0);
  add(`${file}: 正文保留至少一个专业术语`, TERM_RE.test(delivery));
  add(`${file}: 内部来源含 chart facts`, /chart facts:/.test(trace));
  add(`${file}: 内部来源含规则或限制`, /rules:|limitations:/.test(trace));

  const lint = lintReading(delivery, { channel: 'topic' });
  const errors = lint.violations.filter((v) => v.severity === 'error');
  add(
    `${file}: 默认交付面通过 lint-reading`,
    errors.length === 0,
    errors.map((v) => `${v.term}@${v.line}`).join('、'),
  );

  const fate = FATE_WORDS.filter((word) => delivery.includes(word));
  add(`${file}: 无命定关系断言`, fate.length === 0, fate.join('、'));
}

if (existsSync(stylePath)) {
  const style = readFileSync(stylePath, 'utf8');
  add('reading-style.md 标注 V1', style.includes('自然叙述规范 v1'));
  add('reading-style.md 要求术语自然落地', style.includes('术语要自然落地'));
  add('reading-style.md 明确来源默认不展示', style.includes('默认不展示'));
  add('reading-style.md 禁止固定页脚', style.includes('固定免责声明页脚'));
  add('reading-style.md 不再强制七步报告', !style.includes('固定 7 步顺序'));
}

if (existsSync(skillMdPath)) {
  const skill = readFileSync(skillMdPath, 'utf8');
  add('SKILL.md 引用 V1 写作规范', skill.includes('自然叙述规范 v1'));
  add(
    'SKILL.md 不要求默认追问菜单',
    !skill.includes('Close with a single one-line follow-up entry'),
  );
}

const leak = lintReading('**引擎警告**\nTIME_UNKNOWN');
add(
  'self-test: 交付面检查器抓到后台标签',
  !leak.ok && leak.violations.some((v) => v.category === '交付面'),
);
const natural = lintReading(
  '官杀在这里较集中，指向规则和责任会更容易成为工作主题；目标清楚时，它更容易变成持续投入的动力。',
);
add('self-test: 术语与现实含义自然连写可以通过', natural.ok);

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  const mark = check.ok ? 'PASS' : 'FAIL';
  const detail = check.detail ? ` (${check.detail})` : '';
  process.stdout.write(`[${mark}] ${check.name}${detail}\n`);
}
process.stdout.write(
  `\n${checks.length - failed.length}/${checks.length} reading-example checks passed.\n`,
);
process.stdout.write(
  'Note: static checks prove delivery shape and source traces, not host-model semantic correctness.\n',
);
if (failed.length > 0) process.exit(1);
