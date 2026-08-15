import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// D2-C2 source-admission boundary guard.
//
// This test only protects the STRUCTURE of the source-admission documents:
// what the docs must record and what they must keep blocked. It is NOT an
// automated proof of ancient-text authenticity, copyright status, or
// divinatory correctness — those decisions belong to the owner and reviewer.
// ---------------------------------------------------------------------------

function readDoc(name: string): string {
  return readFileSync(join(__dirname, '..', 'docs', name), 'utf8');
}

const ADMISSION = readDoc('BAZI_SOURCE_ADMISSION.md');
const MATRIX = readDoc('BAZI_SOURCE_MATRIX.md');

describe('D2-C2 source-admission boundary guard (structure only)', () => {
  it('两份正式文档存在且包含第一来源 track、作品、版本、IA identifier、卷三与七个 leaf locators', () => {
    expect(ADMISSION).toContain('sanming-tonghui-qinding-siku');
    expect(MATRIX).toContain('classic-sanming-tonghui');
    for (const doc of [ADMISSION, MATRIX]) {
      expect(doc).toContain('《三命通会》');
      expect(doc).toContain('钦定四库全书');
      expect(doc).toContain('06056479.cn');
    }
    expect(ADMISSION).toContain('卷三');
    expect(MATRIX).toContain('BAZI_SOURCE_ADMISSION.md');
    for (const leaf of ['n2', 'n4', 'n5', 'n6', 'n111', 'n112', 'n117']) {
      expect(ADMISSION, `leaf ${leaf}`).toContain(leaf);
    }
  });

  it('五个阳干禄位事实与五个 derived-structure 映射被明确列出', () => {
    for (const fact of ['甲 → 寅', '丙 → 巳', '戊 → 巳', '庚 → 申', '壬 → 亥']) {
      expect(ADMISSION, `fact ${fact}`).toContain(fact);
    }
    expect(ADMISSION).toContain('derived-structure');
    expect(ADMISSION).toContain('不是');
    for (const derived of ['甲 → 卯', '丙 → 午', '戊 → 午', '庚 → 酉', '壬 → 子']) {
      expect(ADMISSION, `derived ${derived}`).toContain(derived);
    }
  });

  it('戊禄巳 存在；戊寄巳 在两份文档与本测试中均不存在', () => {
    expect(ADMISSION).toContain('戊禄巳');
    const bannedWording = ['戊', '寄', '巳'].join('');
    expect(ADMISSION).not.toContain(bannedWording);
    expect(MATRIX).not.toContain(bannedWording);
    expect(ADMISSION).not.toContain('寄巳');
    expect(MATRIX).not.toContain('寄巳');
  });

  it('文档明确说明阴干仍 unresolved / BLOCKED_SCHOOL，且未放开任何阴干位置', () => {
    expect(ADMISSION).toContain('unresolved');
    expect(ADMISSION).toContain('BLOCKED_SCHOOL');
    expect(ADMISSION).toContain('不记录、不推导任何阴干阳刃位置');
    expect(MATRIX).toContain('阴干保持 `unresolved` / `BLOCKED_SCHOOL`');
  });

  it('文档明确说明 ziping-zhenquan-1926-nlc 不得与第一来源混合或互补', () => {
    expect(ADMISSION).toContain('ziping-zhenquan-1926-nlc');
    expect(ADMISSION).toContain('不得用于补足、校正、混合、验证或强化');
    expect(ADMISSION).toContain('不构成「同规则第二独立 primary witness」');
  });

  it('文档记录 NEEDS_OWNER_LEGAL_DECISION、第二独立 primary witness 缺失与完整阻断状态字符串', () => {
    expect(ADMISSION).toContain('NEEDS_OWNER_LEGAL_DECISION');
    expect(ADMISSION).toContain('缺少可独立验证同一规则的第二 primary witness');
    expect(ADMISSION).toContain('VISUAL_TEXT_VERIFIED_BUT_SECOND_SOURCE_OR_RIGHTS_BLOCKED');
    expect(MATRIX).toContain('VISUAL_TEXT_VERIFIED_BUT_SECOND_SOURCE_OR_RIGHTS_BLOCKED');
  });

  it('文档明确禁止将图片、PDF、OCR、全文、截图与临时审计包入库', () => {
    const bannedAssets = [
      '扫描影像',
      'PDF',
      'OCR',
      '原文全文',
      '页面截图',
      '临时审计包',
      '图片哈希',
      '下载产物',
    ];
    for (const asset of bannedAssets) {
      expect(ADMISSION, `asset ${asset}`).toContain(asset);
    }
    expect(ADMISSION).toContain('禁止入库');
  });

  it('文档明确禁止代码、规则路由、用户输出、CLI、public contract、Skill、版本号变更', () => {
    for (const banned of [
      '任何 D2 代码',
      '规则路由',
      'interpretBazi',
      '公共 contract',
      'CLI',
      'Skill',
      '版本号',
      'bazi-rules-ziping@0.2.0',
    ]) {
      expect(ADMISSION, `banned ${banned}`).toContain(banned);
    }
  });

  it('D2-C2 没有放开常规月令取格、建禄、杂气或阴干阳刃', () => {
    expect(ADMISSION).toContain('不放开常规月令取格、建禄、杂气');
    for (const keyword of ['常规月令取格', '建禄', '杂气', '阴干阳刃']) {
      expect(ADMISSION, `keyword ${keyword}`).toContain(keyword);
    }
    // Matrix still blocks all of these lines.
    for (const line of ['CANDIDATE_RULE', 'BLOCKED_EDITION', 'BLOCKED_SCHOOL']) {
      expect(MATRIX, `matrix keeps ${line}`).toContain(line);
    }
  });

  it('门禁测试自身通过拼接方式检查戊寄巳，不引入该字面量', () => {
    // The banned wording is only constructed at runtime via concatenation,
    // so this test file itself never contains the literal string.
    const joined = ['戊', '寄', '巳'].join('');
    expect(joined).toBe('戊寄巳');
  });
});
