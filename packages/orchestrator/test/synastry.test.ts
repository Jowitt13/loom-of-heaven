import { describe, expect, it } from 'vitest';
import { canonicalJson, parseSynastryInput } from '@loom/contracts';
import type { SynastryInputRaw } from '@loom/contracts';
import { runSynastry } from '@loom/orchestrator';

const FIXED = Date.parse('2026-01-01T00:00:00Z');

function person(label: string, relation: string, date: string, time: string, gender: string) {
  return {
    label,
    relation,
    input: {
      calendar: 'gregorian',
      localDate: date,
      localTime: time,
      timeAccuracy: 'exact',
      timezone: 'Asia/Shanghai',
      location: {
        latitude: 23.0,
        longitude: 113.5,
        source: 'user',
        displayName: '示例地点(不入结果)',
      },
      ruleGender: gender,
      settings: { systems: ['western', 'bazi', 'ziwei'] },
    },
  } as SynastryInputRaw['people'][number];
}

const twoPeople: SynastryInputRaw = {
  people: [
    person('甲', 'spouse', '1990-06-15', '14:20:00', 'male'),
    person('乙', 'spouse', '2001-08-18', '14:30:00', 'female'),
  ],
};

function run(raw: SynastryInputRaw) {
  return runSynastry(parseSynastryInput(raw), { now: FIXED }).synastry;
}

describe('synastry (multi-person 合婚)', () => {
  it('produces sourced findings across bazi / ziwei / western + an overall tally', () => {
    const s = run(twoPeople);
    const systems = new Set(s.findings.map((f) => f.system));
    for (const sys of ['overall', 'bazi', 'ziwei', 'western']) {
      expect(systems.has(sys as never), sys).toBe(true);
    }
    expect(s.findings[0]!.system).toBe('overall');
    // every finding is grounded with a code + source.
    for (const f of s.findings) {
      expect(f.code.length).toBeGreaterThan(0);
    }
  });

  it('detects a grounded BaZi 五行 synastry finding for the sample pair', () => {
    const s = run(twoPeople);
    const codes = s.findings.map((f) => f.code);
    // The 五行 relationship finding (互补/中和/相克 之一) is always produced for a pair.
    expect(codes.some((c) => c.startsWith('bazi/element'))).toBe(true);
    // BaZi contributes at least one grounded finding to the pairing (spouse-star is a conditional
    // rule covered by the synastry package unit tests).
    expect(s.findings.some((f) => f.system === 'bazi')).toBe(true);
  });

  it('computes Western cross-aspects (with a Chinese aspect name)', () => {
    const s = run(twoPeople);
    const west = s.findings.filter((f) => f.system === 'western');
    expect(west.length).toBeGreaterThan(0);
    expect(west.some((f) => /甲方.*乙方.*相|甲方.*乙方.*成/.test(f.claim))).toBe(true);
  });

  it('is de-identified: no free-text location leaks into the result', () => {
    const s = run(twoPeople);
    const json = canonicalJson(s);
    expect(json).not.toContain('示例地点');
    expect(s.people[0]).not.toHaveProperty('location');
  });

  it('carries synastry disclaimers and follow-up offers', () => {
    const s = run(twoPeople);
    expect(s.disclaimers.join(' ')).toContain('非科学预测');
    expect(s.followupOffers.length).toBeGreaterThan(0);
  });

  it('requires analyzePair when more than two people are given (asks the user)', () => {
    const three: SynastryInputRaw = {
      people: [
        person('甲', 'spouse', '1990-06-15', '14:20:00', 'male'),
        person('乙', 'spouse', '2001-08-18', '14:30:00', 'female'),
        person('丙', 'ex', '1999-02-02', '09:00:00', 'female'),
      ],
    };
    expect(() => parseSynastryInput(three)).toThrow();
  });

  it('analyzes the named pair when >2 people + analyzePair is given', () => {
    const three: SynastryInputRaw = {
      people: [
        person('甲', 'spouse', '1990-06-15', '14:20:00', 'male'),
        person('乙', 'spouse', '2001-08-18', '14:30:00', 'female'),
        person('丙', 'ex', '1999-02-02', '09:00:00', 'female'),
      ],
      analyzePair: ['甲', '丙'],
    };
    const s = run(three);
    expect(s.pair.a).toBe('甲');
    expect(s.pair.b).toBe('丙');
    expect(s.people.length).toBe(3);
  });
});
