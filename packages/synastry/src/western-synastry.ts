import type { ChartBundle, SynastryFinding, WesternChartResult } from '@ming/contracts';

/**
 * Western synastry: cross-aspects between the two charts' relationship-relevant points
 * (Sun/Moon/Venus/Mars/Mercury + Ascendant/Descendant). Deterministic geometry only,
 * mirroring the natal ruleset's orb table. Harmonious aspects (trine/sextile) lean 吉,
 * hard aspects (square/opposition) lean 张力/凶, conjunction is intense/中性.
 */

const ASPECTS: ReadonlyArray<{
  type: string;
  angle: number;
  orb: number;
  polarity: '吉' | '凶' | '中性';
}> = [
  { type: '合相(conjunction)', angle: 0, orb: 8, polarity: '中性' },
  { type: '六分相(sextile)', angle: 60, orb: 4, polarity: '吉' },
  { type: '刑相(square)', angle: 90, orb: 7, polarity: '凶' },
  { type: '拱相(trine)', angle: 120, orb: 8, polarity: '吉' },
  { type: '冲相(opposition)', angle: 180, orb: 8, polarity: '凶' },
];

const REL_BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars'];

interface Pt {
  body: string;
  lon: number;
}

function separation(a: number, b: number): number {
  const raw = (((a - b) % 360) + 360) % 360;
  return raw > 180 ? 360 - raw : raw;
}

function points(w: WesternChartResult): Pt[] {
  const out: Pt[] = [];
  for (const p of w.planets)
    if (REL_BODIES.includes(p.body)) out.push({ body: p.body, lon: p.longitudeDeg });
  if (w.angles) {
    out.push({ body: '上升(ASC)', lon: w.angles.ascendant.longitudeDeg });
    out.push({ body: '下降(DSC)', lon: w.angles.descendant.longitudeDeg });
  }
  return out;
}

export function westernSynastryFindings(a: ChartBundle, b: ChartBundle): SynastryFinding[] {
  const wa = a.western;
  const wb = b.western;
  if (!wa || !wb) return [];
  const pa = points(wa);
  const pb = points(wb);
  const out: SynastryFinding[] = [];
  const src = { text: 'astronomy-engine/VSOP87+NOVAS', chapter: 'synastry cross-aspects' } as const;

  for (const x of pa) {
    for (const y of pb) {
      const sep = separation(x.lon, y.lon);
      for (const def of ASPECTS) {
        if (Math.abs(sep - def.angle) <= def.orb) {
          out.push({
            system: 'western',
            code: `western/${x.body}-${y.body}/${def.type}`,
            claim: `甲方${x.body} 与 乙方${y.body} 成${def.type}（差 ${Math.abs(sep - def.angle).toFixed(1)}°）`,
            polarity: def.polarity,
            reason:
              def.polarity === '吉'
                ? '和谐相位，主此两股能量之间容易顺畅、彼此欣赏。'
                : def.polarity === '凶'
                  ? '张力相位，主此处易有摩擦或推拉，需要磨合，非注定不合。'
                  : '合相能量强烈、双面：既强吸引也易彼此放大，视星体而定。',
            source: src,
          });
          break; // nearest single aspect per pair
        }
      }
    }
  }
  return out;
}
