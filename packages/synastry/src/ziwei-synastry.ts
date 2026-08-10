import type { ChartBundle, SynastryFinding, ZiweiChartResult } from '@loom/contracts';
import { crossBranchRelation } from '@loom/bazi-rules';

/**
 * Zi Wei 合婚: cross-overlay of the two charts' key palaces by earthly branch —
 * A's 夫妻宫 vs B's 命宫 (and the reverse), and 命宫 vs 命宫. A 六合/三合(半合) overlay
 * leans 吉 (契合), 六冲/刑 leans 张力. Star-name overlap between one's 命宫 and the other's
 * 夫妻宫 is a resonance. 四化互涉: one person's 生年四化 star (化禄/权/科/忌, as tagged by iztro)
 * landing in the other's 命宫/夫妻宫. Built on iztro's per-person palaces; no iztro internals leak.
 */

function palaceBranch(z: ZiweiChartResult, name: string): string | undefined {
  return findPalace(z, name)?.earthlyBranch;
}
function palaceStars(z: ZiweiChartResult, name: string): string[] {
  const p = findPalace(z, name);
  if (!p) return [];
  return [...p.majorStars, ...p.minorStars, ...p.adjectiveStars].map((s) => s.name);
}

// iztro labels the soul palace "命宫" (with 宫) but the rest bare ("夫妻"/"迁移"/…);
// match tolerantly by stripping a trailing 宫 on both sides.
function findPalace(z: ZiweiChartResult, name: string) {
  const strip = (s: string) => s.replace(/宫$/, '');
  const target = strip(name);
  return z.palaces.find((p) => strip(p.name) === target);
}

/** A chart's 生年四化 stars (化禄/权/科/忌), as tagged by iztro on each star's `mutagen`. */
function mutagenStars(z: ZiweiChartResult): Array<{ mutagen: string; name: string }> {
  const out: Array<{ mutagen: string; name: string }> = [];
  for (const p of z.palaces) {
    for (const s of [...p.majorStars, ...p.minorStars, ...p.adjectiveStars]) {
      if (s.mutagen) out.push({ mutagen: s.mutagen, name: s.name });
    }
  }
  return out;
}

const MUTAGEN_POLARITY: Record<string, '吉' | '凶'> = { 禄: '吉', 权: '吉', 科: '吉', 忌: '凶' };

function overlay(
  out: SynastryFinding[],
  label: string,
  branchA: string | undefined,
  branchB: string | undefined,
): void {
  if (!branchA || !branchB) return;
  const rel = crossBranchRelation(branchA, branchB);
  if (!rel) return;
  const good = rel.polarity === '吉';
  out.push({
    system: 'ziwei',
    code: `ziwei/${label}`,
    claim: `${label}：${branchA} 与 ${branchB} 相${rel.kind}（${rel.note}）`,
    polarity: rel.polarity,
    reason: `宫位地支相${rel.kind}${good ? '，主该层面契合、易共识' : '，主该层面易有张力、需协调'}。`,
    source: { text: '紫微斗数', chapter: '合婚/宫位互涉' },
  });
}

/** 四化互涉: fromZ's 生年四化 star landing in toZ's 命宫/夫妻宫. */
function crossMutagen(
  out: SynastryFinding[],
  fromLabel: string,
  toLabel: string,
  fromZ: ZiweiChartResult,
  toZ: ZiweiChartResult,
): void {
  const flying = mutagenStars(fromZ);
  for (const palaceName of ['命宫', '夫妻宫']) {
    const stars = new Set(palaceStars(toZ, palaceName));
    for (const m of flying) {
      if (!stars.has(m.name)) continue;
      const polarity = MUTAGEN_POLARITY[m.mutagen] ?? '中性';
      out.push({
        system: 'ziwei',
        code: `ziwei/mutagen/${m.mutagen}/${palaceName}`,
        claim: `四化互涉：${fromLabel}生年${m.name}化${m.mutagen}落入${toLabel}${palaceName}`,
        polarity,
        reason:
          polarity === '吉'
            ? `${fromLabel}的生年四化(化${m.mutagen})正落在${toLabel}的${palaceName}，主${fromLabel}为${toLabel}在该宫层面带来助力与缘分牵引，感情联系较深。`
            : `${fromLabel}的生年化忌落在${toLabel}的${palaceName}，主${fromLabel}易牵动${toLabel}此宫的执著与纠葛，宜留意付出/消耗的平衡（牵绊深非等于不合）。`,
        source: { text: '紫微斗数', chapter: '合婚/四化互涉' },
      });
    }
  }
}

export function ziweiSynastryFindings(a: ChartBundle, b: ChartBundle): SynastryFinding[] {
  const za = a.ziwei;
  const zb = b.ziwei;
  if (!za || !zb) return [];
  const out: SynastryFinding[] = [];

  overlay(out, '甲方夫妻宫↔乙方命宫', palaceBranch(za, '夫妻宫'), palaceBranch(zb, '命宫'));
  overlay(out, '乙方夫妻宫↔甲方命宫', palaceBranch(zb, '夫妻宫'), palaceBranch(za, '命宫'));
  overlay(out, '双方命宫', palaceBranch(za, '命宫'), palaceBranch(zb, '命宫'));
  // 迁移宫 互看 (主外出/相遇缘分与同行共处).
  overlay(out, '甲方迁移宫↔乙方命宫', palaceBranch(za, '迁移宫'), palaceBranch(zb, '命宫'));
  overlay(out, '乙方迁移宫↔甲方命宫', palaceBranch(zb, '迁移宫'), palaceBranch(za, '命宫'));
  overlay(out, '双方迁移宫', palaceBranch(za, '迁移宫'), palaceBranch(zb, '迁移宫'));

  // Star resonance: one's 命宫 major star also sits in the other's 夫妻宫.
  const soulA = palaceStars(za, '命宫');
  const spouseB = palaceStars(zb, '夫妻宫');
  const shared = soulA.filter((s) => spouseB.includes(s));
  if (shared.length > 0) {
    out.push({
      system: 'ziwei',
      code: 'ziwei/star-resonance',
      claim: `星曜呼应：甲方命宫与乙方夫妻宫共见 ${shared.join('、')}`,
      polarity: '吉',
      reason: '一方命宫主星现于另一方夫妻宫，主对方视其为"良配"般的存在，缘分感较强。',
      source: { text: '紫微斗数', chapter: '合婚/宫位互涉' },
    });
  }

  // 四化互涉 (both directions): 生年四化 flying into the other's 命宫/夫妻宫.
  crossMutagen(out, '甲方', '乙方', za, zb);
  crossMutagen(out, '乙方', '甲方', zb, za);

  return out;
}
