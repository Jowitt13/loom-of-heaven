import { canonicalJsonPretty } from '@loom/contracts';
import type {
  BaziChartResult,
  ChartBundle,
  EngineWarning,
  WesternAngle,
  WesternChartResult,
  ZiweiChartResult,
  ZiweiHoroscopeItem,
  ZiweiHoroscopeResult,
} from '@loom/contracts';

export interface RenderOptions {
  /**
   * Optional HTML shell containing the tokens {{TITLE}} and {{REPORT_BODY}}.
   * The shell only themes the page; all content is engine-generated and escaped,
   * so the report can never carry a second computation path (handoff §7.2).
   */
  template?: string;
}

/** Escape text for safe interpolation into HTML text/attribute contexts. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** Built-in self-contained shell: no CDN, no remote fonts, no scripts, strict CSP. */
const DEFAULT_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<title>{{TITLE}}</title>
<style>
:root { color-scheme: light dark; }
body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 1.5rem; line-height: 1.5; background: #0f1115; color: #e6e6e6; }
main { max-width: 60rem; margin: 0 auto; }
h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
h2 { font-size: 1.05rem; margin: 1.5rem 0 .5rem; border-bottom: 1px solid #333; padding-bottom: .25rem; }
.sub { color: #9aa0a6; font-size: .85rem; margin: 0 0 1rem; }
table { border-collapse: collapse; width: 100%; font-size: .9rem; }
th, td { text-align: left; padding: .35rem .5rem; border-bottom: 1px solid #262a31; vertical-align: top; }
th { color: #9aa0a6; font-weight: 600; width: 14rem; }
.warn { border-left: 3px solid #d0a215; padding: .35rem .6rem; margin: .35rem 0; background: #1a1c22; font-size: .88rem; }
.warn.info { border-left-color: #3b82f6; }
.badge { display: inline-block; font-size: .7rem; padding: .1rem .4rem; border-radius: .3rem; background: #262a31; color: #9aa0a6; margin-left: .35rem; }
pre { background: #0b0d11; border: 1px solid #262a31; padding: .75rem; overflow: auto; font-size: .8rem; border-radius: .4rem; }
.disclaimer { font-size: .8rem; color: #9aa0a6; margin-top: 1.5rem; border-top: 1px solid #333; padding-top: .75rem; }
svg { max-width: 320px; display: block; margin: .5rem 0; }
</style>
</head>
<body><main>{{REPORT_BODY}}</main></body>
</html>`;

function renderWarnings(warnings: EngineWarning[]): string {
  if (warnings.length === 0) return '<p class="sub">No warnings.</p>';
  return warnings
    .map(
      (w) =>
        `<div class="warn ${w.severity === 'info' ? 'info' : ''}"><strong>${escapeHtml(w.code)}</strong> <span class="badge">${escapeHtml(w.system)}</span><br>${escapeHtml(w.message)}</div>`,
    )
    .join('\n');
}

function row(label: string, value: string | undefined): string {
  if (value === undefined) return '';
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
}

/** A small decorative SVG "wheel" carrying the normalized time in the center. */
function renderWheelSvg(bundle: ChartBundle): string {
  const nt = bundle.normalizedTime;
  const sectors = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * 2 * Math.PI - Math.PI / 2;
    const x1 = 160 + 120 * Math.cos(angle);
    const y1 = 160 + 120 * Math.sin(angle);
    return `<line x1="160" y1="160" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="#33373f" stroke-width="1"/>`;
  }).join('');
  return `<svg viewBox="0 0 320 320" role="img" aria-label="Chart placeholder wheel">
<circle cx="160" cy="160" r="120" fill="none" stroke="#4b5563" stroke-width="2"/>
<circle cx="160" cy="160" r="72" fill="none" stroke="#33373f" stroke-width="1"/>
${sectors}
<text x="160" y="150" text-anchor="middle" fill="#e6e6e6" font-size="11">${escapeHtml(nt.timezone)}</text>
<text x="160" y="168" text-anchor="middle" fill="#9aa0a6" font-size="10">${escapeHtml(nt.utcInstant)}</text>
<text x="160" y="184" text-anchor="middle" fill="#9aa0a6" font-size="9">${escapeHtml(nt.apparentSolarTime ?? 'time unknown')}</text>
</svg>`;
}

/** Render the BaZi four-pillar table when present (all values escaped). */
function renderBazi(bazi: BaziChartResult): string {
  const pillars = [
    { label: 'Year 年', p: bazi.pillars.year },
    { label: 'Month 月', p: bazi.pillars.month },
    { label: 'Day 日', p: bazi.pillars.day },
    { label: 'Hour 时', p: bazi.pillars.hour },
  ];
  const header = pillars.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
  const cell = (v: string | undefined): string =>
    `<td>${v === undefined ? '&mdash;' : escapeHtml(v)}</td>`;
  const line = (get: (p: BaziChartResult['pillars']['year']) => string): string =>
    pillars.map((c) => (c.p ? cell(get(c.p)) : cell(undefined))).join('');

  const luck = bazi.luckCycle;
  const luckLine = luck
    ? `<p class="sub">Luck cycle (大运): ${luck.forward ? 'forward' : 'reverse'}, starts after ${luck.startAfter.years}y ${luck.startAfter.months}m ${luck.startAfter.days}d (${escapeHtml(luck.startSolarDate)}). ` +
      escapeHtml(
        luck.majorCycles.map((m) => `${m.stem}${m.branch}(${m.startAge}-${m.endAge})`).join(' '),
      ) +
      `</p>`
    : `<p class="sub">Luck cycle not computed (needs a known time and gender rule).</p>`;

  return [
    `<h2>BaZi 八字 (Four Pillars)</h2>`,
    `<p class="sub">Day master ${escapeHtml(bazi.dayMaster.stem)} (${escapeHtml(bazi.dayMaster.element)}, ${escapeHtml(bazi.dayMaster.yinYang)}) · ruleset ${escapeHtml(bazi.rulesetId)} · time base ${escapeHtml(bazi.solarTimeApplied)} · ${escapeHtml(bazi.dayBoundaryApplied)}</p>`,
    `<table>`,
    `<tr><th></th>${header}</tr>`,
    `<tr><th>Pillar 干支</th>${line((p) => p.stem + p.branch)}</tr>`,
    `<tr><th>Ten god 十神</th>${line((p) => p.tenGod ?? '日主')}</tr>`,
    `<tr><th>Na yin 纳音</th>${line((p) => p.naYin)}</tr>`,
    `<tr><th>Hidden 藏干</th>${line((p) => p.hiddenStems.map((h) => `${h.stem} ${h.tenGod}`).join(' / '))}</tr>`,
    `</table>`,
    luckLine,
  ].join('\n');
}

/** Render the Zi Wei natal summary + twelve palaces when present (all escaped). */
function renderZiwei(ziwei: ZiweiChartResult): string {
  const rows = ziwei.palaces
    .map((palace) => {
      const stars = [...palace.majorStars, ...palace.minorStars]
        .map((s) => escapeHtml(s.name + (s.mutagen ? `(${s.mutagen})` : '')))
        .join(' ');
      const flags = [palace.isSoulPalace ? '命' : '', palace.isBodyPalace ? '身' : '']
        .filter(Boolean)
        .join('/');
      return `<tr><th>${escapeHtml(palace.name)}${flags ? ` <span class="badge">${flags}</span>` : ''}</th><td>${escapeHtml(palace.heavenlyStem + palace.earthlyBranch)}</td><td>${stars || '&mdash;'}</td><td>${palace.decadal.startAge}-${palace.decadal.endAge}</td></tr>`;
    })
    .join('\n');
  return [
    `<h2>Zi Wei Dou Shu 紫微斗数</h2>`,
    `<p class="sub">命主 ${escapeHtml(ziwei.soul)} · 身主 ${escapeHtml(ziwei.body)} · ${escapeHtml(ziwei.fiveElementsClass)} · ruleset ${escapeHtml(ziwei.rulesetId)} · ${ziwei.useApparentSolarTime ? 'apparent solar time' : 'civil time'}</p>`,
    `<table>`,
    `<tr><th>Palace 宫</th><th>干支</th><th>Stars 星曜</th><th>大限</th></tr>`,
    rows,
    `</table>`,
  ].join('\n');
}

/** Render the Western natal chart: angles, planets in signs/houses, and aspects. */
function renderWestern(western: WesternChartResult): string {
  const fmtAngle = (a: WesternAngle): string =>
    `${escapeHtml(a.sign)} ${(a.longitudeDeg % 30).toFixed(2)}°`;
  const parts: string[] = [
    `<h2>Western Natal Chart 西方占星</h2>`,
    `<p class="sub">${escapeHtml(western.zodiac)} zodiac · ${escapeHtml(western.houseSystem)} houses · provider ${escapeHtml(western.provider.id)} ${escapeHtml(western.provider.version)}</p>`,
  ];
  if (western.angles) {
    const a = western.angles;
    parts.push(
      `<table>`,
      `<tr><th>Ascendant 上升</th><td>${fmtAngle(a.ascendant)}</td></tr>`,
      `<tr><th>Midheaven 中天</th><td>${fmtAngle(a.mc)}</td></tr>`,
      `</table>`,
    );
  } else {
    parts.push(`<p class="sub">Birth time unknown — ascendant and houses are not shown.</p>`);
  }
  const rows = western.planets
    .map((p) => {
      const flags = [p.retrograde ? 'R' : '', p.dignity ?? ''].filter(Boolean).join(' ');
      return `<tr><th>${escapeHtml(p.body)}</th><td>${escapeHtml(p.sign)} ${p.signDeg.toFixed(2)}°</td><td>${p.house ?? '—'}</td><td>${escapeHtml(flags)}</td></tr>`;
    })
    .join('\n');
  parts.push(
    `<table>`,
    `<tr><th>Planet 行星</th><th>Position 位置</th><th>House 宫</th><th>Note</th></tr>`,
    rows,
    `</table>`,
  );
  if (western.aspects.length > 0) {
    const arows = western.aspects
      .map(
        (a) =>
          `<tr><td>${escapeHtml(a.bodyA)}</td><td>${escapeHtml(a.type)}</td><td>${escapeHtml(a.bodyB)}</td><td>${a.orbDeg.toFixed(2)}°${a.applying ? ' (applying)' : ''}</td></tr>`,
      )
      .join('\n');
    parts.push(
      `<h3>Aspects 相位</h3>`,
      `<table><tr><th>Point</th><th>Aspect</th><th>Point</th><th>Orb</th></tr>${arows}</table>`,
    );
  }
  return parts.join('\n');
}

/** Render the chart-systems section: computed systems + honest pending notes. */
function renderSystems(bundle: ChartBundle): string {
  const parts: string[] = [];
  if (bundle.western) parts.push(renderWestern(bundle.western));
  if (bundle.bazi) parts.push(renderBazi(bundle.bazi));
  if (bundle.ziwei) parts.push(renderZiwei(bundle.ziwei));
  return parts.join('\n');
}

/** Render a ChartBundle into a self-contained HTML string (handoff §7.2). */
export function renderReport(bundle: ChartBundle, options: RenderOptions = {}): string {
  const nt = bundle.normalizedTime;
  const body = [
    `<h1>Ming Chart Report</h1>`,
    `<p class="sub">engine ${escapeHtml(bundle.engineVersion)} · schema ${escapeHtml(bundle.schemaVersion)} · request ${escapeHtml(bundle.requestId)}</p>`,
    `<h2>Normalized time &amp; location</h2>`,
    renderWheelSvg(bundle),
    `<table>`,
    row('Local civil time', nt.localCivil),
    row('IANA timezone', nt.timezone),
    row('UTC instant', nt.utcInstant),
    row('Mean solar time', nt.meanSolarTime),
    row('Apparent solar time', nt.apparentSolarTime),
    row('Ambiguity resolution', nt.ambiguityResolution),
    row('TZDB version', nt.timezoneDataVersion),
    `</table>`,
    renderSystems(bundle),
    `<h2>Warnings</h2>`,
    renderWarnings(bundle.warnings),
    `<h2>Provenance</h2>`,
    `<table>`,
    row('Engine', `${bundle.provenance.engine.name} ${bundle.provenance.engine.version}`),
    row('TZDB', `${bundle.provenance.tzdb.source} ${bundle.provenance.tzdb.version}`),
    row('Providers', bundle.provenance.providers.map((p) => p.id).join(', ') || 'none (time only)'),
    `</table>`,
    `<h2>Full ChartBundle (JSON)</h2>`,
    `<details><summary>Show canonical JSON</summary><pre>${escapeHtml(canonicalJsonPretty(bundle))}</pre></details>`,
    `<p class="disclaimer">For traditional-culture, entertainment and self-reflection use only. Not scientifically validated prediction; do not use for medical, legal, financial or other major decisions.</p>`,
  ].join('\n');

  const shell = options.template ?? DEFAULT_TEMPLATE;
  return shell.replace('{{TITLE}}', 'Ming Chart Report').replace('{{REPORT_BODY}}', body);
}

// --- Standalone SVG report (handoff §7.2 fallback for hosts without HTML preview). ---

interface SvgLine {
  text: string;
  kind: 'h1' | 'h2' | 'body' | 'sub';
}

/**
 * Word-wrap to a max character width. Splits on whitespace; a single token longer
 * than the width (e.g. an unspaced CJK run) is hard-broken by character so text
 * never overflows the card.
 */
function wrapSvg(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const token of text.split(/\s+/)) {
    // Hard-break an over-long token (e.g. an unspaced CJK run) so it never overflows.
    const chunks = token.length > maxChars ? chunk(token, maxChars) : [token];
    for (const c of chunks) {
      const candidate = cur === '' ? c : `${cur} ${c}`;
      if (candidate.length > maxChars && cur !== '') {
        lines.push(cur);
        cur = c;
      } else {
        cur = candidate;
      }
    }
  }
  if (cur !== '') lines.push(cur);
  return lines.length > 0 ? lines : [''];
}

function chunk(text: string, size: number): string[] {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size));
  return parts;
}

/** Build the ordered, already-escaped-free line model for the SVG summary card. */
function buildSvgLines(bundle: ChartBundle): SvgLine[] {
  const nt = bundle.normalizedTime;
  const L: SvgLine[] = [];
  L.push({ text: 'Ming Chart Report', kind: 'h1' });
  L.push({
    text: `engine ${bundle.engineVersion} · schema ${bundle.schemaVersion} · request ${bundle.requestId}`,
    kind: 'sub',
  });

  L.push({ text: 'Normalized time & location', kind: 'h2' });
  L.push({ text: `Local civil: ${nt.localCivil}`, kind: 'body' });
  L.push({ text: `Timezone: ${nt.timezone} · UTC instant: ${nt.utcInstant}`, kind: 'body' });
  if (nt.meanSolarTime !== undefined)
    L.push({ text: `Mean solar: ${nt.meanSolarTime}`, kind: 'sub' });
  if (nt.apparentSolarTime !== undefined)
    L.push({ text: `Apparent solar: ${nt.apparentSolarTime}`, kind: 'sub' });
  L.push({
    text: `TZDB: ${nt.timezoneDataVersion ?? 'unknown'} · ambiguity: ${nt.ambiguityResolution}`,
    kind: 'sub',
  });

  if (bundle.western) {
    const w = bundle.western;
    L.push({ text: 'Western Natal Chart 西方占星', kind: 'h2' });
    L.push({
      text: `${w.zodiac} zodiac · ${w.houseSystem} houses · ${w.provider.id} ${w.provider.version}`,
      kind: 'sub',
    });
    if (w.angles) {
      const fa = (a: { longitudeDeg: number; sign: string }): string =>
        `${a.sign} ${(a.longitudeDeg % 30).toFixed(2)}°`;
      L.push({ text: `Asc ${fa(w.angles.ascendant)} · MC ${fa(w.angles.mc)}`, kind: 'body' });
    } else {
      L.push({ text: 'Birth time unknown — ascendant and houses are not shown.', kind: 'sub' });
    }
    for (const p of w.planets) {
      const flags = [p.retrograde ? 'R' : '', p.dignity ?? ''].filter(Boolean).join(' ');
      L.push({
        text: `${p.body}: ${p.sign} ${p.signDeg.toFixed(2)}° · house ${p.house ?? '—'}${flags ? ` · ${flags}` : ''}`,
        kind: 'body',
      });
    }
    if (w.aspects.length > 0) {
      L.push({
        text: `Aspects (${w.aspects.length}): ${w.aspects.map((a) => `${a.bodyA} ${a.type} ${a.bodyB}`).join('; ')}`,
        kind: 'sub',
      });
    }
  }

  if (bundle.bazi) {
    const b = bundle.bazi;
    L.push({ text: 'BaZi 八字 (Four Pillars)', kind: 'h2' });
    L.push({
      text: `Day master ${b.dayMaster.stem} (${b.dayMaster.element}, ${b.dayMaster.yinYang}) · ${b.rulesetId} · time base ${b.solarTimeApplied}`,
      kind: 'sub',
    });
    const pillar = (label: string, p: BaziChartResult['pillars']['hour']): string =>
      p ? `${label} ${p.stem}${p.branch}` : `${label} —`;
    L.push({
      text: `${pillar('Year', b.pillars.year)}   ${pillar('Month', b.pillars.month)}   ${pillar('Day', b.pillars.day)}   ${pillar('Hour', b.pillars.hour)}`,
      kind: 'body',
    });
    L.push({
      text: `Ten gods: ${[b.pillars.year, b.pillars.month, b.pillars.day, b.pillars.hour].map((p) => (p ? (p.tenGod ?? '日主') : '—')).join(' / ')}`,
      kind: 'sub',
    });
    if (b.luckCycle) {
      const lc = b.luckCycle;
      L.push({
        text: `Luck cycle (大运): ${lc.forward ? 'forward' : 'reverse'}, starts after ${lc.startAfter.years}y ${lc.startAfter.months}m ${lc.startAfter.days}d (${lc.startSolarDate})`,
        kind: 'sub',
      });
      L.push({
        text: lc.majorCycles
          .map((m) => `${m.stem}${m.branch}(${m.startAge}-${m.endAge})`)
          .join(' '),
        kind: 'sub',
      });
    } else {
      L.push({
        text: 'Luck cycle not computed (needs a known time and gender rule).',
        kind: 'sub',
      });
    }
  }

  if (bundle.ziwei) {
    const z = bundle.ziwei;
    L.push({ text: 'Zi Wei Dou Shu 紫微斗数', kind: 'h2' });
    L.push({
      text: `命主 ${z.soul} · 身主 ${z.body} · ${z.fiveElementsClass} · ${z.rulesetId}`,
      kind: 'sub',
    });
    for (const p of z.palaces) {
      const flags = [p.isSoulPalace ? '命' : '', p.isBodyPalace ? '身' : '']
        .filter(Boolean)
        .join('/');
      const stars = [...p.majorStars, ...p.minorStars]
        .map((s) => s.name + (s.mutagen ? `(${s.mutagen})` : ''))
        .join(' ');
      L.push({
        text: `${p.name}${flags ? `[${flags}]` : ''} ${p.heavenlyStem}${p.earthlyBranch} (大限 ${p.decadal.startAge}-${p.decadal.endAge}): ${stars || '—'}`,
        kind: 'body',
      });
    }
  }

  L.push({ text: 'Warnings', kind: 'h2' });
  if (bundle.warnings.length === 0) L.push({ text: 'No warnings.', kind: 'sub' });
  for (const w of bundle.warnings)
    L.push({ text: `${w.code} [${w.system}]: ${w.message}`, kind: 'body' });

  L.push({ text: 'Provenance', kind: 'h2' });
  L.push({
    text: `Engine ${bundle.provenance.engine.name} ${bundle.provenance.engine.version} · TZDB ${bundle.provenance.tzdb.source} ${bundle.provenance.tzdb.version}`,
    kind: 'sub',
  });
  L.push({
    text: `Providers: ${bundle.provenance.providers.map((p) => `${p.id}@${p.version}`).join(', ') || 'none (time only)'}`,
    kind: 'sub',
  });

  L.push({
    text: 'For traditional-culture, entertainment and self-reflection only. Not scientifically validated prediction.',
    kind: 'sub',
  });
  return L;
}

const SVG_STYLE = {
  h1: { font: 18, lh: 26, gap: 0, fill: '#e6e6e6', weight: '600' },
  h2: { font: 14, lh: 22, gap: 16, fill: '#d0a215', weight: '600' },
  body: { font: 12, lh: 16, gap: 0, fill: '#e6e6e6', weight: '400' },
  sub: { font: 11, lh: 15, gap: 0, fill: '#9aa0a6', weight: '400' },
} as const;

/** Lay out a visual-line model and emit a self-contained SVG (shared by both renderers). */
function svgFromVisualLines(visual: SvgLine[], ariaLabel: string): string {
  const width = 780;
  const marginX = 24;
  let y = 30;
  const placed = visual.map((v) => {
    const s = SVG_STYLE[v.kind];
    y += s.gap;
    const baseline = y;
    y += s.lh;
    return { text: v.text, y: baseline, style: s, kind: v.kind };
  });
  const height = y + 22;

  const rules = placed
    .filter((p) => p.kind === 'h2')
    .map(
      (p) =>
        `<line x1="${marginX}" y1="${p.y + 5}" x2="${width - marginX}" y2="${p.y + 5}" stroke="#33373f" stroke-width="1"/>`,
    )
    .join('\n');
  const texts = placed
    .map(
      (p) =>
        `<text x="${marginX}" y="${p.y}" font-size="${p.style.font}" font-weight="${p.style.weight}" fill="${p.style.fill}" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">${escapeHtml(p.text)}</text>`,
    )
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeHtml(ariaLabel)}">
<rect x="0" y="0" width="${width}" height="${height}" fill="#0f1115"/>
${rules}
${texts}
</svg>\n`;
}

/** Expand a line model into wrapped visual lines (headings stay on one line). */
function toVisualLines(lines: SvgLine[]): SvgLine[] {
  const visual: SvgLine[] = [];
  for (const ln of lines) {
    if (ln.kind === 'h1' || ln.kind === 'h2') {
      visual.push(ln);
    } else {
      for (const part of wrapSvg(ln.text, 116)) visual.push({ text: part, kind: ln.kind });
    }
  }
  return visual;
}

/**
 * Render a ChartBundle into a standalone, self-contained SVG summary card. Like
 * the HTML report it carries NO script and NO external resource (the only URI is
 * the required XML namespace); every dynamic value is escaped. Useful where a host
 * cannot preview full HTML (handoff §7.2) — the same ChartBundle, shown as SVG.
 */
export function renderSvgReport(bundle: ChartBundle): string {
  return svgFromVisualLines(toVisualLines(buildSvgLines(bundle)), 'Ming chart report');
}

/** Build the HTML body for a Zi Wei dynamic chart (运限盘). */
function renderHoroscopeBody(result: ZiweiHoroscopeResult): string {
  const h = result.horoscope;
  const limitRow = (label: string, it: ZiweiHoroscopeItem, extra = ''): string =>
    `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(it.name)} ${escapeHtml(it.heavenlyStem + it.earthlyBranch)}</td><td>${escapeHtml(it.mutagen.join(' ') || '—')}</td><td>${escapeHtml(extra)}</td></tr>`;
  return [
    `<h1>Zi Wei Dynamic Chart 紫微运限</h1>`,
    `<p class="sub">${escapeHtml(result.provider.id)} ${escapeHtml(result.provider.version)} · ${escapeHtml(result.rulesetId)} · target ${escapeHtml(result.targetSolarDate)} (time index ${result.targetTimeIndex})</p>`,
    `<table>`,
    `<tr><th>Limit 运限</th><th>Palace 干支</th><th>运限四化</th><th>Note</th></tr>`,
    limitRow('大限', h.decadal),
    limitRow('小限', h.age, `虚岁 ${h.age.nominalAge}`),
    limitRow('流年', h.yearly, `将前 ${h.yearly.yearlyDecStar.jiangqian12.join(' ')}`),
    limitRow('流月', h.monthly),
    limitRow('流日', h.daily),
    limitRow('流时', h.hourly),
    `</table>`,
    `<p class="sub">Solar ${escapeHtml(h.solarDate)} · lunar ${escapeHtml(h.lunarDate)}</p>`,
    `<p class="disclaimer">For traditional-culture, entertainment and self-reflection use only. Not scientifically validated prediction; do not use for medical, legal, financial or other major decisions.</p>`,
  ].join('\n');
}

/** Render a Zi Wei dynamic chart (运限盘) into a self-contained HTML report. */
export function renderHoroscopeReport(
  result: ZiweiHoroscopeResult,
  options: RenderOptions = {},
): string {
  const shell = options.template ?? DEFAULT_TEMPLATE;
  return shell
    .replace('{{TITLE}}', 'Zi Wei Dynamic Chart')
    .replace('{{REPORT_BODY}}', renderHoroscopeBody(result));
}

/** Build the SVG line model for a Zi Wei dynamic chart. */
function buildHoroscopeSvgLines(result: ZiweiHoroscopeResult): SvgLine[] {
  const h = result.horoscope;
  const L: SvgLine[] = [];
  L.push({ text: 'Zi Wei Dynamic Chart 紫微运限', kind: 'h1' });
  L.push({
    text: `${result.provider.id} ${result.provider.version} · ${result.rulesetId} · target ${result.targetSolarDate}`,
    kind: 'sub',
  });
  const limit = (label: string, it: ZiweiHoroscopeItem, extra = ''): void => {
    L.push({
      text: `${label} ${it.name} ${it.heavenlyStem}${it.earthlyBranch}${extra ? ` · ${extra}` : ''}`,
      kind: 'body',
    });
    if (it.mutagen.length > 0) L.push({ text: `  运限四化: ${it.mutagen.join(' ')}`, kind: 'sub' });
  };
  L.push({ text: 'Limits 运限', kind: 'h2' });
  limit('大限', h.decadal);
  limit('小限', h.age, `虚岁 ${h.age.nominalAge}`);
  limit('流年', h.yearly);
  L.push({ text: `  将前 ${h.yearly.yearlyDecStar.jiangqian12.join(' ')}`, kind: 'sub' });
  L.push({ text: `  岁前 ${h.yearly.yearlyDecStar.suiqian12.join(' ')}`, kind: 'sub' });
  limit('流月', h.monthly);
  limit('流日', h.daily);
  limit('流时', h.hourly);
  L.push({ text: `Solar ${h.solarDate} · lunar ${h.lunarDate}`, kind: 'sub' });
  L.push({
    text: 'For traditional-culture, entertainment and self-reflection only. Not scientifically validated prediction.',
    kind: 'sub',
  });
  return L;
}

/** Render a Zi Wei dynamic chart (运限盘) into a standalone, self-contained SVG. */
export function renderHoroscopeSvg(result: ZiweiHoroscopeResult): string {
  return svgFromVisualLines(toVisualLines(buildHoroscopeSvgLines(result)), 'Zi Wei dynamic chart');
}
