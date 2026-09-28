// ── Maths practice engine ───────────────────────────────────────────────────
// Pure, dependency-free, deterministic. A question is *derived* from its id —
// "concept:difficulty:seed" — so the server can generate a paper, and later
// mark the answers to that exact paper, without storing anything at all. The
// verdict is computed here, server-side, from the same id the student was
// dealt; the client never marks.
//
// This engine is deliberately outside the SRS: it writes no review logs, moves
// no schedule and awards no XP. It is a practice tool a student opens on
// demand for the topics a subject has enabled it for.
//
// A generator returns a Draft: the prompt (markdown, so $math$ renders),
// the expected answer (five kinds), the canonical display string, a worked
// solution, and distractor answers for multiple-choice mode.

import { fullyNormalized } from './grading';
import { parse as mathParse } from 'mathjs';

export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

// ── seeded rng (mulberry32) ─────────────────────────────────────────────────

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type Rng = {
  next(): number;
  /** inclusive both ends */
  int(min: number, max: number): number;
  nz(min: number, max: number): number; // non-zero integer
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
  bool(p?: number): boolean;
};

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    nz: (min, max) => {
      const v = int(min, max);
      return v === 0 ? min + 1 : v;
    },
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle: (arr) => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    bool: (p = 0.5) => next() < p,
  };
}

// ── answers ─────────────────────────────────────────────────────────────────

export type Expected =
  | { kind: 'num'; value: number; tolerance?: number; unit?: string }
  | { kind: 'frac'; num: number; den: number }
  | { kind: 'expr'; accept: string[] }
  | { kind: 'text'; accept: string[] }
  | { kind: 'pair'; x: number; y: number; ordered?: boolean };

export type Draft = {
  prompt: string;
  expected: Expected;
  /** the canonical answer as the student is shown it */
  display: string;
  /** worked solution, markdown */
  solution: string;
  /** plausible wrong answers for multiple-choice mode */
  distractors: string[];
};

// ── formatting helpers ──────────────────────────────────────────────────────

/** 12 → "12", 12.5 → "12.5", 0.66666 → "0.67" */
export function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

const withUnit = (s: string, unit?: string) => (unit ? (unit === '%' || unit === '°' ? `${s}${unit}` : `${s} ${unit}`) : s);

function numDisplay(value: number, unit?: string): string {
  return withUnit(fmt(value), unit);
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function fracDisplay(n: number, d: number): string {
  const g = gcd(n, d);
  const sn = n / g;
  const sd = d / g;
  const sign = sd < 0 ? '-' : '';
  return `${sign}${Math.abs(sn)}/${Math.abs(sd)}`;
}

/** "3x − 5" from [3, -5] coefficients of x⁰.. style builders below. */
function linearStr(a: number, b: number): string {
  const left = a === 1 ? 'x' : a === -1 ? '-x' : `${a}x`;
  if (b === 0) return left;
  return `${left} ${b > 0 ? '+' : '-'} ${Math.abs(b)}`;
}

function termStr(c: number, v = 'x'): string {
  if (c === 0) return '0';
  if (c === 1) return v;
  if (c === -1) return `-${v}`;
  return `${c}${v}`;
}

/** 3x² + 2x − 5 from coefficients [−5, 2, 3] (index = power). */
function polyStr(coefs: number[], v = 'x'): string {
  const parts: string[] = [];
  for (let p = coefs.length - 1; p >= 0; p--) {
    const c = coefs[p];
    if (c === 0) continue;
    const pow = p === 0 ? '' : p === 1 ? v : `${v}^${p}`;
    const body = termStr(Math.abs(c), pow);
    const signed = parts.length === 0 ? (c < 0 ? `-${body}` : body) : ` ${c < 0 ? '-' : '+'} ${body}`;
    parts.push(signed);
  }
  return parts.join('') || '0';
}

// ── the concept registry ────────────────────────────────────────────────────

export type ConceptCategory = 'Number' | 'Algebra' | 'Geometry' | 'Statistics' | 'Measures';

export type Concept = {
  id: string;
  name: string;
  category: ConceptCategory;
  description: string;
  marks: [number, number, number];
  gen: Record<Difficulty, (rng: Rng) => Draft>;
};

const PYTHAG_TRIPLES: [number, number, number][] = [
  [3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17],
  [12, 16, 20], [7, 24, 25], [10, 24, 26], [20, 21, 29], [9, 40, 41],
];

const BASE_CONCEPTS: Concept[] = [
  // ── Number ──────────────────────────────────────────────────────────────────
  {
    id: 'add-subtract',
    name: 'Addition and subtraction',
    category: 'Number',
    description: 'Column arithmetic with growing magnitudes.',
    marks: [1, 1, 2],
    gen: {
      easy: (r) => {
        const a = r.int(12, 89), b = r.int(12, 89);
        return numDraft(`${a} + ${b} = ?`, a + b, `${a} + ${b} = ${a + b}`, [a + b + 10, a + b - 1, a * b > 200 ? a + 10 : a + b + 1]);
      },
      medium: (r) => {
        const a = r.int(240, 890), b = r.int(120, 480);
        const plus = r.bool();
        const q = plus ? `${a} + ${b} = ?` : `${a} − ${b} = ?`;
        const ans = plus ? a + b : a - b;
        return numDraft(q, ans, `${a} ${plus ? '+' : '−'} ${b} = ${ans}`, [ans + 100, ans - 10, plus ? a - b : a + b]);
      },
      hard: (r) => {
        const a = r.int(4200, 9800), b = r.int(1500, 3900);
        return numDraft(`A stadium holds ${a} people. ${b} tickets are sold. How many seats are empty?`, a - b,
          `${a} − ${b} = ${a - b}`, [a + b, a - b + 100, a - b - 10]);
      },
    },
  },
  {
    id: 'multiply',
    name: 'Multiplication',
    category: 'Number',
    description: 'Short and long multiplication.',
    marks: [1, 2, 2],
    gen: {
      easy: (r) => {
        const a = r.int(13, 49), b = r.int(3, 9);
        return numDraft(`${a} × ${b} = ?`, a * b, `${a} × ${b} = ${a * b}`, [a * b + b, a * b - a, a + b]);
      },
      medium: (r) => {
        const a = r.int(13, 39), b = r.int(12, 29);
        return numDraft(`${a} × ${b} = ?`, a * b, `${a} × ${b} = ${a * b}`, [a * b + a, a * b - b, a * (b + 1)]);
      },
      hard: (r) => {
        const a = r.int(123, 489), b = r.int(12, 38);
        return numDraft(`${a} × ${b} = ?`, a * b, `${a} × ${b} = ${a * b}`, [a * b + 100, a * b - 10, a * b + b]);
      },
    },
  },
  {
    id: 'divide',
    name: 'Division and remainders',
    category: 'Number',
    description: 'Exact division, then quotients with remainders.',
    marks: [1, 1, 2],
    gen: {
      easy: (r) => {
        const b = r.int(3, 9), q = r.int(4, 15);
        return numDraft(`${b * q} ÷ ${b} = ?`, q, `${b * q} ÷ ${b} = ${q}`, [q + 1, q - 1, b]);
      },
      medium: (r) => {
        const b = r.int(4, 12), q = r.int(23, 89);
        return numDraft(`${b * q} ÷ ${b} = ?`, q, `${b * q} ÷ ${b} = ${q}`, [q + 1, q - 2, b + q]);
      },
      hard: (r) => {
        const b = r.int(4, 9), q = r.int(15, 60), rem = r.int(1, b - 1);
        const value = b * q + rem;
        const display = `${q} r${rem}`;
        return {
          prompt: `${value} ÷ ${b} = ? (give the quotient and remainder, e.g. 7 r2)`,
          expected: { kind: 'text', accept: [display, `${q} remainder ${rem}`, `${q}r${rem}`] },
          display,
          solution: `${b} × ${q} = ${b * q}, and ${value} − ${b * q} = ${rem} left over, so ${q} r${rem}.`,
          distractors: [`${q + 1} r${rem}`, `${q} r${rem + 1}`, `${q} r0`],
        };
      },
    },
  },
  {
    id: 'bodmas',
    name: 'Order of operations',
    category: 'Number',
    description: 'Brackets, powers, then × ÷ before + −.',
    marks: [1, 2, 2],
    gen: {
      easy: (r) => {
        const a = r.int(3, 12), b = r.int(2, 9), c = r.int(2, 9);
        const value = a + b * c;
        return numDraft(`${a} + ${b} × ${c} = ?`, value, `Multiplying first: ${b} × ${c} = ${b * c}, then ${a} + ${b * c} = ${value}.`,
          [a + b, (a + b) * c, value + c]);
      },
      medium: (r) => {
        const a = r.int(4, 15), b = r.nz(2, 9), c = r.int(2, 9);
        const inner = b - c < 0 ? b + c : b - c;
        const value = a * inner;
        return numDraft(`${a} × (${b} − ${c}) = ?`, value, `Brackets first: (${b} − ${c}) = ${inner}, then ${a} × ${inner} = ${value}.`,
          [a * b - c, a * b, value + a]);
      },
      hard: (r) => {
        const a = r.int(2, 5), b = r.int(2, 6), c = r.int(2, 5), d = r.int(2, 6);
        const inner = d - c;
        const value = a * a + b * inner;
        return numDraft(`${a}² + ${b} × (${d} − ${c}) = ?`, value,
          `${a}² = ${a * a}; (${d} − ${c}) = ${inner}; ${b} × ${inner} = ${b * inner}; total ${a * a} + ${b * inner} = ${value}.`,
          [a * a + b, (a * a + b) * inner, Math.pow(a + b, 2)]);
      },
    },
  },
  {
    id: 'negatives',
    name: 'Negative numbers',
    category: 'Number',
    description: 'Adding, subtracting, multiplying with signs.',
    marks: [1, 1, 2],
    gen: {
      easy: (r) => {
        const a = r.nz(-15, -2), b = r.int(4, 30);
        const value = a + b;
        return numDraft(`${a} + ${b} = ?`, value, `${a} + ${b} = ${value}`, [-(Math.abs(a) + b), value + 2 * Math.abs(a), b - Math.abs(a) + 1]);
      },
      medium: (r) => {
        const a = r.nz(-12, -2), b = r.nz(-9, 9);
        const value = a * b;
        return numDraft(`${a} × ${b} = ?`, value, `A negative times a ${b < 0 ? 'negative is positive' : 'positive is negative'}: ${a} × ${b} = ${value}.`,
          [-value, value + a, value - b]);
      },
      hard: (r) => {
        const a = r.nz(-9, -2), b = r.int(2, 9), c = r.int(2, 6);
        const value = a - b * c;
        return numDraft(`${a} − ${b} × ${c} = ?`, value, `${b} × ${c} = ${b * c} first, then ${a} − ${b * c} = ${value}.`,
          [(a - b) * c, value + b, -(a) - b * c]);
      },
    },
  },
  {
    id: 'fractions-add',
    name: 'Adding fractions',
    category: 'Number',
    description: 'Common denominators, then simplifying.',
    marks: [1, 2, 2],
    gen: {
      easy: (r) => {
        const d = r.pick([4, 5, 6, 8, 10, 12]);
        const a = r.int(1, d - 2), b = r.int(1, d - a);
        const [n, dd] = reduce(a + b, d);
        return fracDraft(
          `$\\frac{${a}}{${d}} + \\frac{${b}}{${d}} = ?$  (give your answer as a fraction)`,
          a + b,
          d,
          `Same denominator: add the numerators — ${a} + ${b} = ${a + b}, so $\\frac{${a + b}}{${d}}$${fracDisplay(n, dd) !== `${a + b}/${d}` ? `, which simplifies to $\\frac{${n}}{${dd}}$` : ''}.`,
          [fracDisplay(a * b, d), fracDisplay(a + b, d * 2), fracDisplay(Math.abs(a - b), d)],
        );
      },
      medium: (r) => {
        const d1 = r.pick([2, 3, 4, 5, 6]);
        const d2 = d1 * r.int(2, 3);
        const a = r.int(1, d1 - 1), b = r.int(1, d2 - 1);
        const sum = a * d2 + b * d1;
        const [n, dd] = reduce(sum, d1 * d2);
        return fracDraft(
          `$\\frac{${a}}{${d1}} + \\frac{${b}}{${d2}} = ?$  (give your answer as a fraction)`,
          sum,
          d1 * d2,
          `${d2} is a multiple of ${d1}: $\\frac{${a}}{${d1}} = \\frac{${a * d2}}{${d1 * d2}}$. Then $\\frac{${a * d2}}{${d1 * d2}} + \\frac{${b}}{${d2}} = \\frac{${sum}}{${d1 * d2}}$${fracDisplay(n, dd) !== `${sum}/${d1 * d2}` ? `, simplified $\\frac{${n}}{${dd}}$` : ''}.`,
          [fracDisplay(a + b, d1 + d2), fracDisplay(sum + 1, d1 * d2), fracDisplay(a * b, d1 * d2)],
        );
      },
      hard: (r) => {
        const d1 = r.pick([3, 4, 5, 6, 7, 8]);
        const d2 = r.pick([3, 4, 5, 6, 7, 8, 9, 10].filter((x) => gcd(x, d1) === 1 && x !== d1));
        const a = r.int(1, d1 - 1), b = r.int(1, d2 - 1);
        const common = d1 * d2;
        const sum = a * d2 + b * d1;
        const [n, dd] = reduce(sum, common);
        return fracDraft(
          `$\\frac{${a}}{${d1}} + \\frac{${b}}{${d2}} = ?$  (simplify your answer)`,
          sum,
          common,
          `Common denominator ${common}: $\\frac{${a * d2}}{${common}} + \\frac{${b * d1}}{${common}} = \\frac{${sum}}{${common}}$${fracDisplay(n, dd) !== `${sum}/${common}` ? `, simplified to $\\frac{${n}}{${dd}}$` : ''}.`,
          [fracDisplay(a + b, d1 + d2), fracDisplay(sum, common * 2), fracDisplay(sum + d1, common)],
        );
      },
    },
  },
  {
    id: 'fractions-of',
    name: 'Fraction of an amount',
    category: 'Number',
    description: 'Divide by the denominator, multiply by the numerator.',
    marks: [1, 2, 2],
    gen: {
      easy: (r) => {
        const d = r.pick([2, 3, 4, 5]), amount = d * r.int(6, 30);
        return numDraft(`Find $\\frac{1}{${d}}$ of ${amount}.`, amount / d, `${amount} ÷ ${d} = ${amount / d}.`,
          [amount * d, amount / d + 1, d]);
      },
      medium: (r) => {
        const d = r.pick([4, 5, 6, 8, 9]), n = r.int(2, d - 1), amount = d * r.int(6, 24);
        return numDraft(`Find $\\frac{${n}}{${d}}$ of ${amount}.`, (amount / d) * n,
          `${amount} ÷ ${d} = ${amount / d}, then × ${n} = ${(amount / d) * n}.`,
          [amount / d, amount - (amount / d) * n, (amount / d) * (n + 1)]);
      },
      hard: (r) => {
        const d = r.pick([5, 6, 8, 10]), n = r.int(2, d - 1), amount = d * r.int(8, 25);
        const part = (amount / d) * n;
        const left = amount - part;
        return numDraft(`A jug holds ${amount} ml. You pour away $\\frac{${n}}{${d}}$ of it. How much is left?`, left,
          `$\\frac{${n}}{${d}}$ of ${amount} = ${part}, so ${amount} − ${part} = ${left} ml.`,
          [part, left + 10, amount], left, 'ml');
      },
    },
  },
  {
    id: 'percent-of',
    name: 'Percentage of an amount',
    category: 'Number',
    description: 'From 10% and 50% to any percentage.',
    marks: [1, 2, 2],
    gen: {
      easy: (r) => {
        const pct = r.pick([10, 25, 50]), amount = r.int(2, 40) * (pct === 25 ? 4 : pct === 10 ? 10 : 2);
        return numDraft(`Find ${pct}% of ${amount}.`, (amount * pct) / 100, `${pct}% of ${amount} = ${amount} × ${pct / 100} = ${(amount * pct) / 100}.`,
          [(amount * pct) / 10, amount - (amount * pct) / 100, pct * 10]);
      },
      medium: (r) => {
        const pct = r.int(3, 95), amount = r.int(20, 90) * 10;
        return numDraft(`Find ${pct}% of ${amount}.`, (amount * pct) / 100, `10% of ${amount} is ${amount / 10}, so ${pct}% is ${pct / 10} × ${amount / 10} = ${(amount * pct) / 100}.`,
          [(amount * pct) / 100 + 10, (amount * pct) / 100 - 5, pct]);
      },
      hard: (r) => {
        const pct = r.pick([12.5, 17.5, 22.5, 35]), amount = r.pick([240, 360, 480, 640, 720]);
        const value = (amount * pct) / 100;
        return numDraft(`Find ${pct}% of £${amount}.`, value, `${pct}% = ${pct / 100}, and £${amount} × ${pct / 100} = £${fmt(value)}.`,
          [value + 12, value - 8, amount - value]);
      },
    },
  },
  {
    id: 'percent-change',
    name: 'Percentage change',
    category: 'Number',
    description: 'Increases, decreases and reverse percentages.',
    marks: [1, 2, 3],
    gen: {
      easy: (r) => {
        const pct = r.pick([10, 25, 50]), amount = r.int(4, 40) * 10, up = r.bool();
        const value = amount * (1 + (up ? pct : -pct) / 100);
        return numDraft(`£${amount} is ${up ? 'increased' : 'reduced'} by ${pct}%. What is the new price?`, value,
          `${pct}% of ${amount} is ${(amount * pct) / 100}, so the new price is ${amount} ${up ? '+' : '−'} ${(amount * pct) / 100} = £${fmt(value)}.`,
          [amount * (1 + (up ? -pct : pct) / 100), (amount * pct) / 100, value + 10]);
      },
      medium: (r) => {
        const pct = r.int(5, 40), amount = r.int(10, 60) * 10, up = r.bool();
        const value = amount * (1 + (up ? pct : -pct) / 100);
        const pctChange = ((value - amount) / amount) * 100;
        return numDraft(`A price moves from £${amount} to £${fmt(value)}. What is the percentage change? (just the number)`, pctChange,
          `Change = ${fmt(value - amount)}; ${fmt(value - amount)} ÷ ${amount} × 100 = ${fmt(Math.abs(pctChange))}% ${up ? 'increase' : 'decrease'}. The question asks for the size: ${fmt(Math.abs(pctChange))}.`,
          [fmt(Math.abs(100 - Math.abs(pctChange))), fmt(Math.abs(pctChange) + 10), fmt(amount / 10)],
          Math.abs(pctChange), '%');
      },
      hard: (r) => {
        const pct = r.pick([10, 20, 25, 50]);
        const original = r.int(4, 40) * (pct === 25 ? 4 : pct === 10 ? 10 : 2);
        const up = r.bool();
        const after = original * (1 + (up ? pct : -pct) / 100);
        return numDraft(`After a ${pct}% ${up ? 'increase' : 'decrease'}, a phone costs £${fmt(after)}. What was the original price?`, original,
          `£${fmt(after)} is ${100 + (up ? pct : -pct)}% of the original: ${fmt(after)} ÷ ${(100 + (up ? pct : -pct)) / 100} = £${fmt(original)}.`,
          [after, original * (1 + (up ? pct : -pct) / 100) + 10, (original * pct) / 100]);
      },
    },
  },
  {
    id: 'ratio',
    name: 'Ratio',
    category: 'Number',
    description: 'Sharing in a given ratio.',
    marks: [1, 2, 3],
    gen: {
      easy: (r) => {
        const k = r.int(2, 12);
        return numDraft(`Share £${2 * k + k} between two people in the ratio 2 : 1. How much does the larger share get?`, 2 * k,
          `2 : 1 has 3 parts; £${3 * k} ÷ 3 = £${k} per part, so the larger share is 2 × £${k} = £${2 * k}.`,
          [`£${k}`, `£${3 * k}`, `£${2 * k + k}`]);
      },
      medium: (r) => {
        const a = r.int(2, 5), b = r.int(2, 5), k = r.int(3, 12);
        return numDraft(`Share ${a * k + b * k} sweets between two people in the ratio ${a} : ${b}. How many does the first person get?`, a * k,
          `${a} : ${b} has ${a + b} parts; ${a * k + b * k} ÷ ${a + b} = ${k} per part, so ${a} parts = ${a * k}.`,
          [b * k, k, a * k + b * k]);
      },
      hard: (r) => {
        const a = r.int(2, 4), b = r.int(2, 4), c = r.int(1, 3), k = r.int(4, 12);
        const total = (a + b + c) * k;
        return numDraft(`Red, blue and green counters are in the ratio ${a} : ${b} : ${c}. There are ${total} counters altogether. How many are blue?`, b * k,
          `${a + b + c} parts; ${total} ÷ ${a + b + c} = ${k} per part; blue = ${b} × ${k} = ${b * k}.`,
          [a * k, c * k, total - b * k]);
      },
    },
  },
  {
    id: 'powers',
    name: 'Powers and indices',
    category: 'Number',
    description: 'Squares, cubes and index laws.',
    marks: [1, 1, 2],
    gen: {
      easy: (r) => {
        const a = r.int(2, 12), cube = r.bool();
        const value = cube ? a ** 3 : a ** 2;
        return numDraft(cube ? `${a}³ = ?` : `${a}² = ?`, value, `${a}${cube ? '³' : '²'} = ${value}.`,
          [cube ? a * 3 : a * 2, value + a, value - a]);
      },
      medium: (r) => {
        const base = r.pick([2, 3, 5, 10]), exp = r.int(3, 5);
        const value = base ** exp;
        return numDraft(`${base}^${exp} = ?`, value, `${base}^${exp} = ${Array(exp).fill(base).join(' × ')} = ${value}.`,
          [base * exp, value + base, base ** (exp - 1)]);
      },
      hard: (r) => {
        const base = r.pick([2, 3, 5]), m = r.int(2, 4), n = r.int(2, 4);
        const value = base ** (m + n);
        return numDraft(`${base}^${m} × ${base}^${n} = ? (evaluate)`, value,
          `Add the indices: ${base}^${m + n} = ${value}.`,
          [base ** (m * n), base * (m + n), value + base]);
      },
    },
  },
  {
    id: 'roots',
    name: 'Square and cube roots',
    category: 'Number',
    description: 'Perfect squares and cubes.',
    marks: [1, 1, 2],
    gen: {
      easy: (r) => {
        const a = r.int(4, 15);
        return numDraft(`√${a * a} = ?`, a, `${a}² = ${a * a}, so √${a * a} = ${a}.`, [a + 1, a - 1, a * 2]);
      },
      medium: (r) => {
        const a = r.int(2, 10);
        return numDraft(`∛${a ** 3} = ?`, a, `${a}³ = ${a ** 3}, so ∛${a ** 3} = ${a}.`, [a * 3, a + 1, a ** 2]);
      },
      hard: (r) => {
        const [a, b] = r.pick(PYTHAG_TRIPLES.slice(0, 6));
        const c = Math.sqrt(a * a + b * b);
        return numDraft(`Evaluate √(${a}² + ${b}²).`, c, `${a}² + ${b}² = ${a * a + b * b}, and √${a * a + b * b} = ${fmt(c)}.`,
          [a + b, a * b, c + 1]);
      },
    },
  },
  {
    id: 'rounding',
    name: 'Rounding',
    category: 'Number',
    description: 'Nearest ten, decimal places, significant figures.',
    marks: [1, 1, 2],
    gen: {
      easy: (r) => {
        const n = r.int(120, 989);
        const to = r.bool() ? 10 : 100;
        const value = Math.round(n / to) * to;
        return numDraft(`Round ${n} to the nearest ${to}.`, value, `${n} is closest to ${value}.`, [value + to, value - to, n]);
      },
      medium: (r) => {
        const n = r.int(100, 9999) / 100;
        const value = Math.round(n * 10) / 10;
        return numDraft(`Round ${n.toFixed(2)} to 1 decimal place.`, value, `${n.toFixed(2)} → look at the second decimal digit → ${value.toFixed(1)}.`,
          [Math.round(n), Math.round(n * 100) / 100, value + 0.1]);
      },
      hard: (r) => {
        const n = r.int(1000, 98765);
        const sf = r.pick([1, 2, 3]);
        const step = 10 ** (Math.floor(Math.log10(n)) - sf + 1);
        const value = Math.round(n / step) * step;
        return numDraft(`Round ${n} to ${sf} significant figure${sf > 1 ? 's' : ''}.`, value,
          `Keep ${sf} digit${sf > 1 ? 's' : ''} from the left, look at the next: ${n} → ${value}.`,
          [value + step, value - step, n]);
      },
    },
  },
  {
    id: 'unit-conversion',
    name: 'Unit conversion',
    category: 'Measures',
    description: 'Metric lengths, masses, capacities — and area/volume factors.',
    marks: [1, 1, 2],
    gen: {
      easy: (r) => {
        const cm = r.int(12, 250);
        return numDraft(`Convert ${cm} cm to mm.`, cm * 10, `1 cm = 10 mm, so ${cm} × 10 = ${cm * 10} mm.`, [cm / 10, cm + 10, cm * 100]);
      },
      medium: (r) => {
        const kg = r.int(11, 90) / 10;
        return numDraft(`Convert ${kg} kg to grams.`, kg * 1000, `1 kg = 1000 g: ${kg} × 1000 = ${fmt(kg * 1000)} g.`, [kg * 100, kg / 1000, fmt(kg * 1000) + '0']);
      },
      hard: (r) => {
        const cm2 = r.int(15, 90);
        return numDraft(`Convert ${cm2} cm² to mm².`, cm2 * 100, `1 cm = 10 mm, so 1 cm² = 10 × 10 = 100 mm²: ${cm2} × 100 = ${cm2 * 100} mm².`,
          [cm2 * 10, cm2 * 1000, cm2 / 100]);
      },
    },
  },
  {
    id: 'speed',
    name: 'Speed, distance, time',
    category: 'Measures',
    description: 'The d = st triangle with clean numbers.',
    marks: [1, 2, 3],
    gen: {
      easy: (r) => {
        const s = r.pick([30, 40, 50, 60]), t = r.int(2, 5);
        return numDraft(`A car travels at ${s} km/h for ${t} hours. How far does it go?`, s * t, `d = s × t = ${s} × ${t} = ${s * t} km.`,
          [s + t, s / t, s * t + s], s * t, 'km');
      },
      medium: (r) => {
        const d = r.pick([120, 180, 240, 300]), t = r.pick([2, 3, 4, 5]);
        return numDraft(`A train covers ${d} km in ${t} hours. What is its average speed?`, d / t, `s = d ÷ t = ${d} ÷ ${t} = ${d / t} km/h.`,
          [d * t, d - t, t], d / t, 'km/h');
      },
      hard: (r) => {
        const s = r.pick([40, 60, 80]), mins = r.pick([15, 30, 45]);
        const t = mins / 60;
        const d = s * t;
        return numDraft(`Cycling at ${s} km/h for ${mins} minutes, how far do you travel? (km)`, d,
          `${mins} minutes = ${fmt(t)} hours; d = ${s} × ${fmt(t)} = ${fmt(d)} km.`,
          [s / 2, s, d + s], d, 'km');
      },
    },
  },

  // ── Algebra ───────────────────────────────────────────────────────────────
  {
    id: 'simplify',
    name: 'Simplify expressions',
    category: 'Algebra',
    description: 'Collecting like terms.',
    marks: [1, 2, 2],
    gen: {
      easy: (r) => {
        const a = r.int(2, 9), b = r.int(2, 9), c = r.int(1, 8);
        const answer = polyStr([0, a + b - c]);
        return exprDraft(`Simplify: ${termStr(a, 'x')} + ${termStr(b, 'x')} − ${termStr(c, 'x')}`,
          [answer], `${a} + ${b} − ${c} = ${a + b - c}, so the expression simplifies to ${answer}.`,
          [polyStr([0, a + b + c]), polyStr([0, a * b - c]), polyStr([0, a - b + c])]);
      },
      medium: (r) => {
        const a = r.int(2, 7), b = r.int(2, 7), c = r.int(1, 6), d = r.int(1, 6);
        const answer = polyStr([0, a - c, b + d], 'y');
        return exprDraft(`Simplify: ${termStr(a, 'y')} + ${termStr(b, 'y²')} − ${termStr(c, 'y')} + ${termStr(d, 'y²')}`,
          [answer], `y² terms: ${b} + ${d} = ${b + d}. y terms: ${a} − ${c} = ${a - c}. Result: ${answer}.`,
          [polyStr([0, a + c, b + d], 'y'), polyStr([0, a - c, b - d], 'y'), polyStr([0, a, b + d], 'y')]);
      },
      hard: (r) => {
        const a = r.int(2, 6), b = r.int(2, 6), c = r.int(1, 5), d = r.int(1, 5), e = r.int(1, 7);
        const answer = polyStr([e, a + d, a - c]);
        return exprDraft(`Simplify: ${termStr(a, 'x²')} + ${termStr(b, 'x')} − ${termStr(c, 'x²')} + ${termStr(d, 'x')} + ${e}`,
          [answer], `x² terms: ${a} − ${c} = ${a - c}. x terms: ${b} + ${d} = ${b + d}. Constant: ${e}. Result: ${answer}.`,
          [polyStr([e, a - d, a - c]), polyStr([e, a + d, a + c]), polyStr([0, a + d, a - c])]);
      },
    },
  },
  {
    id: 'expand',
    name: 'Expand brackets',
    category: 'Algebra',
    description: 'Single and double brackets.',
    marks: [1, 2, 3],
    gen: {
      easy: (r) => {
        const a = r.int(2, 6), b = r.nz(-8, 8), c = r.nz(-9, 9);
        const answer = polyStr([b * a, a]);
        return exprDraft(`Expand: ${a}(x ${b > 0 ? '+' : '−'} ${Math.abs(b)})`, [answer],
          `${a} × x = ${termStr(a, 'x')}; ${a} × (${b}) = ${b * a}. So ${answer}.`,
          [polyStr([b * a, c]), polyStr([b, a]), polyStr([b * a + 1, a])]);
      },
      medium: (r) => {
        const p = r.nz(-6, 6), q = r.nz(-6, 6);
        const answer = polyStr([p * q, p + q, 1]);
        return exprDraft(`Expand and simplify: (x ${p > 0 ? '+' : '−'} ${Math.abs(p)})(x ${q > 0 ? '+' : '−'} ${Math.abs(q)})`, [answer],
          `x² + (${q} + ${p})x + (${p})(${q}) = ${answer}.`,
          [polyStr([p * q, p - q, 1]), polyStr([p + q, p + q, 1]), polyStr([p * q, p + q, 2])]);
      },
      hard: (r) => {
        const a = r.pick([2, 3]), p = r.nz(-5, 5), q = r.nz(-6, 6);
        const answer = polyStr([p * q, a * q + p, a]);
        return exprDraft(`Expand and simplify: (${termStr(a, 'x')} ${p > 0 ? '+' : '−'} ${Math.abs(p)})(x ${q > 0 ? '+' : '−'} ${Math.abs(q)})`, [answer],
          `${a}x × x = ${a}x²; ${a}x × ${q} = ${a * q}x; ${p} × x = ${p}x; ${p} × ${q} = ${p * q}. Total: ${answer}.`,
          [polyStr([p * q, a * q - p, a]), polyStr([p * q, a * q + p, 1]), polyStr([p + q, a * q + p, a])]);
      },
    },
  },
  {
    id: 'factorise',
    name: 'Factorise quadratics',
    category: 'Algebra',
    description: 'Into two linear brackets.',
    marks: [1, 2, 3],
    gen: {
      easy: (r) => {
        const k = r.int(2, 9);
        const answer = `x(x + ${k})`;
        return exprDraft(`Factorise: x² + ${k}x`, [answer, `x(x+${k})`],
          `The common factor is x: x(x + ${k}) = x² + ${k}x.`,
          [`x(x − ${k})`, `${k}x(x + 1)`, `(x + ${k})(x + ${k})`]);
      },
      medium: (r) => {
        const p = r.nz(-7, 7), q = r.nz(-7, 7);
        const b = p + q, c = p * q;
        const answer = `(x ${p > 0 ? '+' : '−'} ${Math.abs(p)})(x ${q > 0 ? '+' : '−'} ${Math.abs(q)})`;
        return exprDraft(`Factorise: x² ${b > 0 ? '+' : '−'} ${Math.abs(b)}x ${c > 0 ? '+' : '−'} ${Math.abs(c)}`,
          [answer, `(x ${q > 0 ? '+' : '−'} ${Math.abs(q)})(x ${p > 0 ? '+' : '−'} ${Math.abs(p)})`],
          `Find two numbers multiplying to ${c} and adding to ${b}: ${p} and ${q}. So ${answer}.`,
          [`(x ${p > 0 ? '+' : '−'} ${Math.abs(p)})(x ${q > 0 ? '−' : '+'} ${Math.abs(q)})`, `(x ${p > 0 ? '−' : '+'} ${Math.abs(p)})(x ${q > 0 ? '−' : '+'} ${Math.abs(q)})`, `(x + ${b})(x + ${c})`]);
      },
      hard: (r) => {
        const a = r.pick([2, 3]);
        const p = r.nz(-5, 5), q = r.nz(-4, 4);
        const b = a * q + p, c = p * q;
        const answer = `(${termStr(a, 'x')} ${p > 0 ? '+' : '−'} ${Math.abs(p)})(x ${q > 0 ? '+' : '−'} ${Math.abs(q)})`;
        return exprDraft(`Factorise: ${a}x² ${b > 0 ? '+' : '−'} ${Math.abs(b)}x ${c > 0 ? '+' : '−'} ${Math.abs(c)}`,
          [answer, `(x ${q > 0 ? '+' : '−'} ${Math.abs(q)})(${termStr(a, 'x')} ${p > 0 ? '+' : '−'} ${Math.abs(p)})`],
          `Split the middle term: ${b}x = ${a * q}x + ${p}x, then factorise in pairs to get ${answer}.`,
          [`(${termStr(a, 'x')} ${p > 0 ? '+' : '−'} ${Math.abs(p)})(x ${q > 0 ? '−' : '+'} ${Math.abs(q)})`, `(${termStr(a, 'x')} ${p > 0 ? '−' : '+'} ${Math.abs(p)})(x ${q > 0 ? '+' : '−'} ${Math.abs(q)})`, `(x + ${p})(x + ${q})`]);
      },
    },
  },
  {
    id: 'linear-eq',
    name: 'Linear equations',
    category: 'Algebra',
    description: 'Solve for x, from one step to letters both sides.',
    marks: [1, 2, 3],
    gen: {
      easy: (r) => {
        const a = r.int(2, 9), x = r.nz(-9, 12), b = r.nz(-15, 15);
        const rhs = a * x + b;
        return numDraft(`Solve: ${linearStr(a, b)} = ${rhs}. Give x.`, x,
          `${b > 0 ? 'Subtract' : 'Add'} ${Math.abs(b)}: ${a}x = ${rhs - b}. Divide by ${a}: x = ${x}.`,
          [x + a, -x, x + b]);
      },
      medium: (r) => {
        const a = r.int(2, 8), x = r.nz(-8, 10), c = r.int(2, 5), b = r.nz(-12, 12);
        const rhs = (a + c) * x + b;
        return numDraft(`Solve: ${linearStr(a, b)} = ${linearStr(c, rhs - a * x - b)}. Give x.`, x,
          `Collect x on the left: ${a + c}x ${b > 0 ? '+' : '−'} ${Math.abs(b)} = ${rhs}. So ${a + c}x = ${rhs - b}, and x = ${x}.`,
          [x + 1, -x, x - a]);
      },
      hard: (r) => {
        const x = r.nz(-6, 9), a = r.int(3, 7), b = r.nz(-10, 10), c = r.int(2, 5);
        const d = a * x + b - c * x; // the constant that makes x the true solution
        return numDraft(`Solve: ${linearStr(a, b)} = ${linearStr(c, d)}. Give x.`, x,
          `Move x terms left, numbers right: ${a - c}x = ${b - d}. Divide by ${a - c}: x = ${x}.`,
          [x + 2, -x, x - 1]);
      },
    },
  },
  {
    id: 'quadratic-eq',
    name: 'Quadratic equations',
    category: 'Algebra',
    description: 'Solve by factorising; both roots count, any order.',
    marks: [1, 2, 3],
    gen: {
      easy: (r) => {
        const k = r.int(2, 12), sign = r.bool() ? 1 : -1;
        const value = k * k * sign;
        const display = sign > 0 ? `${k} or ${-k}` : `no real solutions`;
        if (sign > 0) {
          return {
            prompt: `Solve: x² = ${value}. Give both values of x.`,
            expected: { kind: 'pair', x: k, y: -k },
            display,
            solution: `x = ±√${value} = ±${k}, so x = ${k} or x = −${k}.`,
            distractors: [`${k} only`, `${-k} or 0`, `${k + 1} or ${-(k + 1)}`],
          };
        }
        return {
          prompt: `Solve: x² + ${-value} = 0. What are the solutions?`,
          expected: { kind: 'text', accept: ['no real solutions', 'none', 'no solutions', 'no solution'] },
          display,
          solution: `x² = ${-value} would need a negative square — impossible, so there are no real solutions.`,
          distractors: [`${k} or ${-k}`, '0', `${k}`],
        };
      },
      medium: (r) => {
        const p = r.nz(-7, 7), q = r.nz(-7, 7);
        const b = -(p + q), c = p * q;
        return {
          prompt: `Solve: x² ${b > 0 ? '+' : '−'} ${Math.abs(b)}x ${c > 0 ? '+' : '−'} ${Math.abs(c)} = 0. Give both roots.`,
          expected: { kind: 'pair', x: p, y: q, ordered: true },
          display: `${p} or ${q}`,
          solution: `Factorise: (x ${p > 0 ? '−' : '+'} ${Math.abs(p)})(x ${q > 0 ? '−' : '+'} ${Math.abs(q)}) = 0, so x = ${p} or x = ${q}.`,
          distractors: [`${p} or ${-q}`, `${-p} or ${q}`, `${p + q} or ${p * q}`],
        };
      },
      hard: (r) => {
        const a = r.pick([2, 3]), q = r.nz(-4, 4);
        // (ax − p)(x − q) = 0 has roots p/a and q, so the first bracket's
        // constant is p = a · root1, not the root itself.
        const root1 = r.pick([-4, -2, -1, 1, 2, 4, -0.5, 0.5, -1.5, 1.5]);
        const p = a * root1;
        const b = -(a * q + p), c = p * q;
        return {
          prompt: `Solve: ${a}x² ${b > 0 ? '+' : '−'} ${Math.abs(b)}x ${c > 0 ? '+' : '−'} ${Math.abs(c)} = 0. Give both roots.`,
          expected: { kind: 'pair', x: root1, y: q, ordered: true },
          display: `x = ${fmt(root1)} or x = ${q}`,
          solution: `Factorise: (${a}x ${p > 0 ? '−' : '+'} ${Math.abs(p)})(x ${q > 0 ? '−' : '+'} ${Math.abs(q)}) = 0, so x = ${fmt(root1)} or x = ${q}.`,
          distractors: [`x = ${fmt(root1)} or x = ${-q}`, `x = ${fmt(-root1)} or x = ${q}`, `x = ${fmt(p)} or x = 1`],
        };
      },
    },
  },
  {
    id: 'simultaneous',
    name: 'Simultaneous equations',
    category: 'Algebra',
    description: 'Two linear equations, integer solutions.',
    marks: [2, 2, 3],
    gen: {
      easy: (r) => {
        const x = r.nz(-5, 6), y = r.nz(-5, 6), a = r.int(2, 5), b = r.int(2, 5);
        return {
          prompt: `Solve: y = ${b}x and y = ${a}x + ${y - a * x}. Give x and y.`,
          expected: { kind: 'pair', x, y, ordered: true },
          display: `x = ${x}, y = ${y}`,
          solution: `${b}x = ${a}x + ${y - a * x} → ${b - a}x = ${y - a * x} → x = ${x}, then y = ${b} × ${x} = ${y}.`,
          // The swap distractor degenerates to the answer when x = y.
          distractors: [x === y ? `x = ${x + 1}, y = ${y - 1}` : `x = ${y}, y = ${x}`, `x = ${x + 1}, y = ${y}`, `x = ${x}, y = ${y + 1}`],
        };
      },
      medium: (r) => {
        const x = r.nz(-5, 6), y = r.nz(-5, 6);
        const a1 = r.int(1, 4), b1 = r.int(1, 4), a2 = r.int(1, 4), b2 = -a2 === b1 ? 3 : r.int(1, 4);
        return {
          prompt: `Solve: ${a1}x + ${b1}y = ${a1 * x + b1 * y} and ${a2}x + ${b2}y = ${a2 * x + b2 * y}. Give x and y.`,
          expected: { kind: 'pair', x, y, ordered: true },
          display: `x = ${x}, y = ${y}`,
          solution: `Eliminate one variable (multiply the equations as needed) to get x = ${x}, then substitute to get y = ${y}.`,
          distractors: [x === y ? `x = ${x + 1}, y = ${y - 1}` : `x = ${y}, y = ${x}`, `x = ${x + 1}, y = ${y - 1}`, `x = ${-x}, y = ${y}`],
        };
      },
      hard: (r) => {
        const x = r.nz(-4, 6), y = r.nz(-4, 6);
        const a1 = r.int(2, 4), b1 = r.int(2, 4);
        const a2 = r.int(2, 5), b2 = r.int(2, 5);
        return {
          prompt: `Solve: ${a1}x + ${b1}y = ${a1 * x + b1 * y} and ${a2}x + ${b2}y = ${a2 * x + b2 * y}. Give x and y (either order).`,
          expected: { kind: 'pair', x, y, ordered: true },
          display: `x = ${x}, y = ${y}`,
          solution: `Multiply each equation so the x coefficients match, subtract to eliminate x, solve for y = ${y}, then substitute back for x = ${x}.`,
          distractors: [`x = ${x + 2}, y = ${y - 2}`, `x = ${-x}, y = ${-y}`, `x = ${y + 1}, y = ${x - 1}`],
        };
      },
    },
  },
  {
    id: 'sequences',
    name: 'Sequences and nth term',
    category: 'Algebra',
    description: 'Term-to-term rules and the nth term.',
    marks: [1, 2, 3],
    gen: {
      easy: (r) => {
        const a = r.int(2, 9), d = r.int(2, 7);
        const seq = [a, a + d, a + 2 * d, a + 3 * d];
        return numDraft(`What are the next two terms? ${seq.join(', ')}, … (give the 5th term)`, a + 4 * d,
          `The rule is +${d}, so the next term is ${a + 3 * d} + ${d} = ${a + 4 * d}.`,
          [a + 4 * d + d, a + 3 * d + 1, a * 5]);
      },
      medium: (r) => {
        const a = r.int(1, 9), d = r.int(2, 6);
        const c = a - d;
        const answer = `${d}n ${c > 0 ? '+' : '−'} ${Math.abs(c)}`;
        return exprDraft(`Find the nth term of: ${a}, ${a + d}, ${a + 2 * d}, ${a + 3 * d}, …`,
          [answer, `${c > 0 ? `${c} + ${d}n` : `${c} + ${d}n`}`],
          `Difference ${d} → ${d}n. ${d} × 1 = ${d}; ${a} − ${d} = ${c}, so the rule is ${answer}.`,
          [`${d + 1}n ${c > 0 ? '+' : '−'} ${Math.abs(c)}`, `${d}n ${c > 0 ? '−' : '+'} ${Math.abs(c)}`, `${a}n + ${d}`]);
      },
      hard: (r) => {
        const d = r.nz(-6, 6), a = r.int(2, 12);
        const n = r.pick([20, 25, 50, 100]);
        const value = a + (n - 1) * d;
        return numDraft(`A sequence starts ${a}, ${a + d}, ${a + 2 * d}, … and goes up in steps of ${d}. What is the ${n}th term?`, value,
          `${a} + (${n} − 1) × ${d} = ${a} + ${(n - 1) * d} = ${value}.`,
          [a + n * d, a - (n - 1) * d, value + d]);
      },
    },
  },

  // ── Geometry ──────────────────────────────────────────────────────────────
  {
    id: 'area',
    name: 'Area',
    category: 'Geometry',
    description: 'Rectangles, triangles, parallelograms, trapezia.',
    marks: [1, 2, 3],
    gen: {
      easy: (r) => {
        const w = r.int(4, 15), h = r.int(3, 12);
        return numDraft(`A rectangle measures ${w} cm by ${h} cm. What is its area?`, w * h, `${w} × ${h} = ${w * h} cm².`,
          [2 * (w + h), w + h, w * h + w], w * h, 'cm²');
      },
      medium: (r) => {
        const b = r.int(6, 20), h = r.int(4, 14), tri = r.bool();
        const value = tri ? (b * h) / 2 : b * h;
        return numDraft(`A ${tri ? 'triangle' : 'parallelogram'} has base ${b} cm and perpendicular height ${h} cm. What is its area?`, value,
          tri ? `½ × ${b} × ${h} = ${value} cm².` : `${b} × ${h} = ${value} cm².`,
          [tri ? b * h : (b * h) / 2, b + h, value + h], value, 'cm²');
      },
      hard: (r) => {
        const a = r.int(4, 10), b = a + r.int(2, 8), h = r.pick([4, 6, 8, 10]);
        const value = ((a + b) / 2) * h;
        return numDraft(`A trapezium has parallel sides ${a} cm and ${b} cm, and height ${h} cm. What is its area?`, value,
          `½ × (${a} + ${b}) × ${h} = ½ × ${a + b} × ${h} = ${fmt(value)} cm².`,
          [(a + b) * h, (a + b) / 2, value + h], value, 'cm²');
      },
    },
  },
  {
    id: 'perimeter',
    name: 'Perimeter',
    category: 'Geometry',
    description: 'Around rectangles and L-shapes, including reverse problems.',
    marks: [1, 2, 2],
    gen: {
      easy: (r) => {
        const w = r.int(5, 18), h = r.int(3, 14);
        return numDraft(`A rectangle is ${w} m by ${h} m. What is its perimeter?`, 2 * (w + h), `2 × (${w} + ${h}) = ${2 * (w + h)} m.`,
          [w * h, w + h, 2 * w + h], 2 * (w + h), 'm');
      },
      medium: (r) => {
        const w = r.int(8, 15), h = r.int(6, 12), cut = r.int(2, 4);
        const value = 2 * (w + h);
        return numDraft(`An L-shaped floor is a ${w} m × ${h} m rectangle with a ${cut} m × ${cut} m square corner removed. What is its perimeter? (m)`, value,
          `Removing a square corner keeps the perimeter: 2 × (${w} + ${h}) = ${value} m.`,
          [value - 2 * cut, value + 2 * cut, w * h - cut * cut], value, 'm');
      },
      hard: (r) => {
        const w = r.int(6, 14), h = r.int(4, 12);
        const value = w;
        return numDraft(`A rectangle has perimeter ${2 * (w + h)} cm. Its height is ${h} cm. What is its width?`, value,
          `Half the perimeter is ${w + h}; ${w + h} − ${h} = ${w} cm.`,
          [w + h, 2 * (w + h), w - h], value, 'cm');
      },
    },
  },
  {
    id: 'angles',
    name: 'Angle facts',
    category: 'Geometry',
    description: 'Lines, triangles, quadrilaterals, parallel lines.',
    marks: [1, 2, 3],
    gen: {
      easy: (r) => {
        const a = r.int(35, 145);
        return numDraft(`Two angles sit on a straight line. One is ${a}°. What is the other?`, 180 - a, `Angles on a line sum to 180°: 180 − ${a} = ${180 - a}°.`,
          [360 - a, 90, 180 - a + 10], 180 - a, '°');
      },
      medium: (r) => {
        const a = r.int(30, 80), b = r.int(30, 80);
        return numDraft(`A triangle has angles ${a}° and ${b}°. What is the third angle?`, 180 - a - b,
          `Angles in a triangle sum to 180°: 180 − ${a} − ${b} = ${180 - a - b}°.`, [360 - a - b, a + b, 180 - a], 180 - a - b, '°');
      },
      hard: (r) => {
        const apex = r.int(20, 120);
        const base = (180 - apex) / 2;
        const isInt = Number.isInteger(base);
        if (isInt) {
          return numDraft(`An isosceles triangle has apex angle ${apex}°. What is each base angle?`, base,
            `(180 − ${apex}) ÷ 2 = ${base}°.`, [180 - apex, apex, 90 - apex > 0 ? 90 - apex : apex / 2], base, '°');
        }
        const a = r.int(20, 70);
        return numDraft(`Two parallel lines are cut by a transversal. One co-interior angle is ${a}°. What is the other?`, 180 - a,
          `Co-interior angles sum to 180°: 180 − ${a} = ${180 - a}°.`, [a, 360 - a, 90], 180 - a, '°');
      },
    },
  },
  {
    id: 'pythagoras',
    name: "Pythagoras' theorem",
    category: 'Geometry',
    description: 'Hypotenuse or shorter side, on whole-number triples.',
    marks: [2, 2, 3],
    gen: {
      easy: (r) => {
        const [a, b, c] = r.pick(PYTHAG_TRIPLES);
        return numDraft(`A right-angled triangle has shorter sides ${a} cm and ${b} cm. What is the hypotenuse?`, c,
          `${a}² + ${b}² = ${a * a} + ${b * b} = ${c * c}; √${c * c} = ${c} cm.`,
          [a + b, c + 1, Math.abs(a - b)], c, 'cm');
      },
      medium: (r) => {
        const [a, , c] = r.pick(PYTHAG_TRIPLES.slice(0, 8));
        return numDraft(`A right-angled triangle has hypotenuse ${c} cm and one side ${a} cm. What is the other side?`, Math.sqrt(c * c - a * a),
          `${c}² − ${a}² = ${c * c} − ${a * a} = ${c * c - a * a}; √${c * c - a * a} = ${fmt(Math.sqrt(c * c - a * a))} cm.`,
          [c - a, c + a, Math.sqrt(c * c + a * a)], Math.sqrt(c * c - a * a), 'cm');
      },
      hard: (r) => {
        const [a, b, c] = r.pick(PYTHAG_TRIPLES);
        const k = r.int(2, 4);
        return numDraft(`A ladder leans against a wall. Its foot is ${a * k} m from the wall and the ladder is ${c * k} m long. How high up the wall does it reach?`, b * k,
          `${c * k}² − ${a * k}² = ${(c * k) ** 2 - (a * k) ** 2} = ${(b * k) ** 2}; the height is ${b * k} m.`,
          [(a + b) * k, c * k - a * k, c * k], b * k, 'm');
      },
    },
  },

  // ── Statistics ────────────────────────────────────────────────────────────
  {
    id: 'mean',
    name: 'Averages',
    category: 'Statistics',
    description: 'Mean, median and mode — and reversing the mean.',
    marks: [1, 2, 3],
    gen: {
      easy: (r) => {
        const nums = Array.from({ length: 3 }, () => r.int(2, 20));
        const sum = nums.reduce((a, b) => a + b, 0);
        const divisible = sum % 3 === 0 ? sum : sum + (3 - (sum % 3));
        nums[2] += divisible - sum;
        return numDraft(`Find the mean of ${nums.join(', ')}.`, divisible / 3,
          `Sum = ${divisible}; ${divisible} ÷ 3 = ${divisible / 3}.`,
          [divisible, divisible / 3 + 1, Math.min(...nums)]);
      },
      medium: (r) => {
        const sorted = Array.from({ length: 5 }, () => r.int(1, 30)).sort((a, b) => a - b);
        const pick = r.pick(['median', 'mode', 'range'] as const);
        if (pick === 'median') {
          return numDraft(`Find the median of ${sorted.join(', ')}.`, sorted[2], `Ordered list, middle value = ${sorted[2]}.`,
            [sorted[1], sorted[3], (sorted[1] + sorted[3]) / 2]);
        }
        if (pick === 'range') {
          return numDraft(`Find the range of ${sorted.join(', ')}.`, sorted[4] - sorted[0],
            `${sorted[4]} − ${sorted[0]} = ${sorted[4] - sorted[0]}.`, [sorted[4], sorted[0], sorted[4] + sorted[0]]);
        }
        // mode: force a repeated value
        const dup = sorted[2];
        const list = [...sorted.slice(0, 2), dup, dup, sorted[4]].sort((a, b) => a - b);
        return numDraft(`Find the mode of ${list.join(', ')}.`, dup, `${dup} appears twice; everything else once.`, [list[0], list[4], list[2] + 1]);
      },
      hard: (r) => {
        const n = 5, mean = r.int(4, 15);
        const total = n * mean;
        const four = Array.from({ length: 4 }, () => r.int(1, total - 4));
        const sumFour = four.reduce((a, b) => a + b, 0);
        const fifth = total - sumFour;
        if (fifth <= 0) {
          // Re-roll once with narrower values; the pool is wide enough that a
          // single retry clears the degenerate case in practice.
          const four2 = Array.from({ length: 4 }, () => r.int(1, Math.max(2, mean)));
          const sum2 = four2.reduce((a, b) => a + b, 0);
          const fifth2 = total - sum2;
          if (fifth2 <= 0) return meanDraftFallback(r);
          return numDraft(`The mean of 5 numbers is ${mean}. Four of them are ${four2.join(', ')}. What is the fifth?`, fifth2,
            `Total = 5 × ${mean} = ${total}. ${total} − ${sum2} = ${fifth2}.`,
            [mean, fifth2 + 1, sum2 / 4]);
        }
        return numDraft(`The mean of 5 numbers is ${mean}. Four of them are ${four.join(', ')}. What is the fifth?`, fifth,
          `Total = 5 × ${mean} = ${total}. ${total} − ${sumFour} = ${fifth}.`,
          [mean, fifth + 1, sumFour / 4]);
      },
    },
  },
  {
    id: 'probability',
    name: 'Probability',
    category: 'Statistics',
    description: 'Single events as fractions.',
    marks: [1, 2, 2],
    gen: {
      easy: (r) => {
        const sides = r.pick([4, 6, 8, 10, 12]);
        const n = r.int(1, Math.floor(sides / 2) + 1);
        return fracDraft(
          `A fair ${sides}-sided spinner numbered 1–${sides} is spun once. What is the probability it lands on a number less than or equal to ${n}? (fraction)`,
          n,
          sides,
          `${n} of the ${sides} outcomes work, so the probability is $\\frac{${n}}{${sides}}$.`,
          [fracDisplay(n, sides + 1), fracDisplay(sides - n, sides), fracDisplay(1, sides)],
        );
      },
      medium: (r) => {
        const red = r.int(2, 6), blue = r.int(2, 6), green = r.int(1, 5);
        const total = red + blue + green;
        const notRed = blue + green;
        return fracDraft(
          `A bag holds ${red} red, ${blue} blue and ${green} green balls. One is drawn at random. What is the probability it is NOT red? (fraction)`,
          notRed,
          total,
          `P(not red) = ${notRed}/${total} = $\\frac{${blue + green}}{${total}}$.`,
          [fracDisplay(red, total), fracDisplay(notRed, total + 1), fracDisplay(blue, total)],
        );
      },
      hard: (r) => {
        const red = r.int(3, 7), blue = r.int(3, 7);
        const total = red + blue;
        const both = red * (red - 1);
        const all = total * (total - 1);
        const g = gcd(both, all);
        return fracDraft(
          `A bag holds ${red} red and ${blue} blue balls. Two are drawn without replacement. What is the probability BOTH are red? (fraction)`,
          both,
          all,
          `$\\frac{${red}}{${total}} × \\frac{${red - 1}}{${total - 1}} = \\frac{${both}}{${all}}$${both / g !== both ? ` = $\\frac{${both / g}}{${all / g}}$` : ''}.`,
          [fracDisplay(red * red, total * total), fracDisplay(red, total), fracDisplay(red * (red - 1), total * total + 2)],
        );
      },
    },
  },
];

// ── Core Maths (AQA 1350) concepts ────────────────────────────────────────────────
// Added for the Core Maths certificate's practice sets. Same contract as the
// GCSE concepts above: pure, seeded, marked from the draft. Categories reuse
// the existing five; financial topics sit under Number, risk topics under
// Statistics, and critical path under Geometry's project-planning slot.

const CM_CONCEPTS: Concept[] = [
  {
    id: 'cm-percent-original',
    name: 'Reverse percentage',
    category: 'Number',
    description: 'Find the original after a percentage change — divide by the multiplier (F2.5).',
    marks: [1, 2, 3],
    gen: {
      easy: (r) => {
        const pct = r.pick([10, 20, 25, 50]);
        const original = r.int(4, 40) * (pct === 25 ? 4 : pct === 10 ? 10 : 2);
        const after = original * (1 + pct / 100);
        return numDraft(`After an increase of ${pct}%, a jacket costs £${fmt(after)}. What was the original price?`, original,
          `£${fmt(after)} is ${(100 + pct)}% of the original, so divide by ${(1 + pct / 100)}: £${fmt(after)} ÷ ${(1 + pct / 100)} = £${fmt(original)}.`,
          [after - (original * pct) / 100, original + 10, fmt(after - original)], original);
      },
      medium: (r) => {
        const pct = r.int(6, 30), original = r.int(20, 90) * 10, down = r.bool();
        const after = original * (down ? 1 - pct / 100 : 1 + pct / 100);
        return numDraft(`A price ${down ? 'fell' : 'rose'} by ${pct}% to £${fmt(after)}. What was it before?`, original,
          `Multiplier ${down ? 1 - pct / 100 : 1 + pct / 100}: £${fmt(after)} ÷ ${fmt(down ? 1 - pct / 100 : 1 + pct / 100)} = £${fmt(original)}. Subtracting ${pct}% of the new value would be wrong.`,
          [fmt(after - (original * pct) / 100), original + 5, fmt(after / (down ? 1 + pct / 100 : 1 - pct / 100))], original);
      },
      hard: (r) => {
        const up = r.pick([10, 20]), down = r.pick([10, 20]);
        const original = r.int(10, 60) * 10;
        const after = original * (1 + up / 100) * (1 - down / 100);
        return numDraft(`A bill rises ${up}% then falls ${down}%, ending at £${fmt(after)}. What was the original?`, original,
          `Multipliers compound: ${fmt(1 + up / 100)} × ${fmt(1 - down / 100)} = ${fmt((1 + up / 100) * (1 - down / 100))}. £${fmt(after)} ÷ ${fmt((1 + up / 100) * (1 - down / 100))} = £${fmt(original)}.`,
          [fmt(after / (1 + (up - down) / 100)), original + 10, fmt(original * (1 - down / 100) * (1 + up / 100))], original);
      },
    },
  },
  {
    id: 'cm-simple-compound',
    name: 'Simple vs compound interest',
    category: 'Number',
    description: 'Grow an investment under each regime and compare (F3.1).',
    marks: [2, 2, 3],
    gen: {
      easy: (r) => {
        const p = r.pick([500, 1000, 2000, 4000]), rate = r.pick([2, 3, 4, 5]), years = r.int(2, 4);
        const simple = p * (1 + (rate * years) / 100);
        return numDraft(`£${p} is saved at ${rate}% simple interest for ${years} years. What is the final balance?`, simple,
          `Simple interest is linear: £${p} × (1 + ${rate}/100 × ${years}) = £${fmt(p * rate * years / 100)} interest, so £${fmt(simple)}.`,
          [p * (1 + rate / 100) ** years, p + rate * years, p * (1 + rate / 100)], simple);
      },
      medium: (r) => {
        const p = r.pick([500, 1000, 2000, 4000]), rate = r.pick([2, 3, 4, 5, 6]), years = r.int(2, 5);
        const compound = p * (1 + rate / 100) ** years;
        return numDraft(`£${p} is invested at ${rate}% compound interest for ${years} years. Final value, to the nearest penny?`, compound,
          `Multiplier ${(1 + rate / 100).toFixed(2)}: £${p} × ${(1 + rate / 100).toFixed(2)}^${years} = £${fmt(compound)}.`,
          [p * (1 + (rate * years) / 100), p * (1 + rate / 100) ** (years + 1), p + p * rate * years / 100], compound);
      },
      hard: (r) => {
        const p = r.pick([1000, 2000, 5000]), rate = r.pick([3, 4, 5]);
        let years = 1;
        let balance = p;
        const target = 2 * p;
        while (balance < target && years < 100) {
          balance *= 1 + rate / 100;
          years += 1;
        }
        return numDraft(`£${p} is invested at ${rate}% compound interest a year. After how many whole years does the balance first exceed £${fmt(target)}?`, years,
          `Each year multiplies by ${(1 + rate / 100).toFixed(2)}: $${Array.from({ length: years }, (_, i) => fmt(p * (1 + rate / 100) ** (i + 1))).join(', ')}… — first above £${fmt(target)} after ${years} years.`,
          [years - 1, years + 1, Math.ceil(Math.log2(target / p))], years, 'years');
      },
    },
  },
  {
    id: 'cm-aer',
    name: 'AER',
    category: 'Number',
    description: 'Annual Equivalent Rate from a nominal rate compounded n times a year (formulae sheet).',
    marks: [2, 3, 3],
    gen: {
      easy: (r) => {
        const nominal = r.pick([4, 5, 6, 8]); // percent
        const n = r.pick([2, 4, 12]);
        const aer = (1 + nominal / 100 / n) ** n - 1;
        const pct = aer * 100;
        return numDraft(`A nominal rate of ${nominal}% is compounded ${n} times a year. What is the AER, as a percentage to 2 dp?`, pct,
          `AER = (1 + i/n)^n − 1 with i = ${nominal / 100}, n = ${n}: (${fmt(1 + nominal / 100 / n)})^${n} − 1 = ${fmt(aer)} = ${fmt(pct)}%.`,
          [nominal, pct + 0.5, pct - 0.5], pct, '%');
      },
      medium: (r) => {
        const a1 = r.pick([4, 5, 6]), n1 = r.pick([4, 12]), n2 = r.pick([1, 4]);
        const aer1 = (1 + a1 / 100 / n1) ** n1 - 1;
        const aer2 = (1 + a1 / 100 / n2) ** n2 - 1;
        const better = aer1 > aer2 ? 'the monthly account' : 'the annually compounded account';
        const worse = better === 'the monthly account' ? 'the annually compounded account' : 'the monthly account';
        return {
          prompt: `Account A pays ${a1}% compounded ${n1 === 1 ? 'annually' : n1 === 4 ? 'quarterly' : 'monthly'}; account B pays ${a1}% compounded ${n2 === 1 ? 'annually' : n2 === 4 ? 'quarterly' : 'monthly'}. Which pays more over a year? (type "the monthly account" or "the annually compounded account")`,
          expected: { kind: 'text', accept: [better] },
          display: better,
          solution: `AER = (1 + i/n)^n − 1. Account A: ${fmt(aer1 * 100)}%; account B: ${fmt(aer2 * 100)}%. More frequent compounding at the same nominal rate gives the higher AER, so ${better}.`,
          distractors: [worse, 'they pay the same'],
        };
      },
      hard: (r) => {
        const nominal = r.pick([5, 6, 8]);
        const aer = (1 + nominal / 100 / 12) ** 12 - 1;
        const p = r.pick([1000, 2000, 5000]);
        const earned = p * aer;
        return numDraft(`£${p} sits a year in an account advertising ${nominal}% compounded monthly, quoted honestly by AER. Interest to the nearest penny?`, earned,
          `AER = (1 + ${nominal / 100}/12)^12 − 1 = ${fmt(aer)}. £${p} × ${fmt(aer)} = £${fmt(earned)}.`,
          [p * nominal / 100, p * ((1 + nominal / 100 / 4) ** 4 - 1), p * (1 + aer) - p + 1], earned);
      },
    },
  },
  {
    id: 'cm-tax-bands',
    name: 'Income tax bands',
    category: 'Number',
    description: 'Progressive tax: only the slice in each band pays that band\'s rate (F6.1).',
    marks: [2, 3, 3],
    gen: {
      easy: (r) => {
        const allowance = 12570, salary = r.pick([18000, 22000, 26000, 30000, 34000, 40000]);
        const taxable = salary - allowance;
        const tax = taxable * 0.2;
        return numDraft(`Salary £${salary.toLocaleString('en-GB')}, personal allowance £${allowance.toLocaleString('en-GB')}, basic rate 20%. Income tax due?`, tax,
          `Taxable = ${salary.toLocaleString('en-GB')} − ${allowance.toLocaleString('en-GB')} = £${fmt(taxable)}. All inside the basic band: × 0.20 = £${fmt(tax)}.`,
          [salary * 0.2, taxable, tax * 2], tax);
      },
      medium: (r) => {
        const allowance = 12570;
        const salary = r.pick([52000, 55000, 60000, 65000]);
        const higherSlice = salary - 50270;
        const tax = 37700 * 0.2 + higherSlice * 0.4;
        return numDraft(`Salary £${salary.toLocaleString('en-GB')}. Allowance £${allowance.toLocaleString('en-GB')}; basic band to £50,270 at 20%, above that 40%. Total income tax?`, tax,
          `Basic slice: £37,700 × 0.20 = £${fmt(37700 * 0.2)}. Higher slice: (£${salary.toLocaleString('en-GB')} − £50,270) × 0.40 = £${fmt(higherSlice * 0.4)}. Total £${fmt(tax)}. Taxing the whole salary at 40% is the classic error.`,
          [salary * 0.4, (salary - allowance) * 0.2, tax + higherSlice * 0.2], tax);
      },
      hard: (r) => {
        const vatRate = 20;
        const incl = r.pick([120, 151.68, 240, 300]);
        const excl = incl / (1 + vatRate / 100);
        return numDraft(`A bill is £${fmt(incl)} including ${vatRate}% VAT. What was the price before VAT?`, excl,
          `Divide by the multiplier: £${fmt(incl)} ÷ ${fmt(1 + vatRate / 100)} = £${fmt(excl)}. Subtracting ${vatRate}% of the inclusive total gives the wrong answer.`,
          [fmt(incl - incl * vatRate / 100), excl + 5, fmt(incl * vatRate / 100)], excl);
      },
    },
  },
  {
    id: 'cm-exchange',
    name: 'Currency exchange & commission',
    category: 'Number',
    description: 'Convert at a rate, then deduct a percentage commission (F7.3).',
    marks: [1, 2, 3],
    gen: {
      easy: (r) => {
        const rate = r.pick([1.1, 1.25, 0.85, 8.5]);
        const gbp = r.int(10, 90) * 10;
        return numDraft(`£${gbp} converts at £1 = ${rate} units of foreign currency. How many units do you receive?`, gbp * rate,
          `£${gbp} × ${rate} = ${fmt(gbp * rate)} units.`,
          [gbp / rate, gbp * rate + gbp, rate], gbp * rate);      },
      medium: (r) => {
        const rate = r.pick([1.1, 1.2, 1.35]), gbp = r.int(10, 60) * 10, commission = r.pick([2, 3, 5]);
        const received = gbp * rate * (1 - commission / 100);
        return numDraft(`£${gbp} is converted at £1 = ${rate}, with a ${commission}% commission deducted. Amount received?`, received,
          `Convert: ${fmt(gbp * rate)}. Commission: × ${fmt(1 - commission / 100)} → ${fmt(received)}.`,
          [gbp * rate, gbp * rate * (1 + commission / 100), gbp * rate - (gbp * commission) / 100], received);      },
      hard: (r) => {
        const rate = 1.2, commission = r.pick([2, 5]);
        const target = r.pick([600, 900, 1200]);
        const grossGbp = target / rate / (1 - commission / 100);
        return numDraft(`You need ${fmt(target)} units after a ${commission}% commission, at £1 = ${rate}. How many pounds must you convert (to 2 dp)?`, grossGbp,
          `Work backwards: ${fmt(target)} ÷ ${rate} ÷ ${fmt(1 - commission / 100)} = £${fmt(grossGbp)}.`,
          [target / rate, target / rate / (1 - commission / 100) + 10, target * rate / (1 - commission / 100)], grossGbp);      },
    },
  },
  {
    id: 'cm-stratified-sample',
    name: 'Stratified sampling',
    category: 'Statistics',
    description: 'Sample size per stratum = stratum share × total sample (D2.2).',
    marks: [2, 3, 3],
    gen: {
      easy: (r) => {
        const total = r.pick([800, 1000, 1200, 1500]);
        const group = r.pick([100, 200, 250]);
        const sample = r.pick([40, 50, 80]);
        const n = Math.round((group / total) * sample);
        return numDraft(`A workforce of ${total} contains ${group} managers. A stratified sample of ${sample} is taken. How many managers should be sampled? (number only)`, n,
          `${group}/${total} × ${sample} = ${fmt((group / total) * sample)}, so ${n} managers.`,
          [n + 1, sample - n, Math.round(sample / total * 10) / 10], n);
      },
      medium: (r) => {
        const rows: [string, number][] = [["Sales", r.int(20, 40) * 10], ["Admin", r.int(10, 30) * 10]];
        const total = rows[0][1] + rows[1][1];
        const sample = 60;
        const n0 = Math.round((rows[0][1] / total) * sample);
        return numDraft(`A firm of ${total} staff has ${rows[0][1]} in ${rows[0][0]} and ${rows[1][1]} in ${rows[1][0]}. A stratified sample of ${sample} is taken. How many from ${rows[0][0]}? (number only)`, n0,
          `${rows[0][1]}/${total} × ${sample} = ${fmt((rows[0][1] / total) * sample)} → ${n0} people from ${rows[0][0]}.`,
          [sample - n0, n0 + 1, Math.round(rows[1][1] / total * sample)], n0);
      },
      hard: (r) => {
        // A deliberately poor sample: two from every group regardless of size.
        const n = r.int(3, 6);
        return {
          prompt: `A department has 130 sales, 58 admin and 9 management staff. The owner picks two staff from each area for a survey of ${n} questions. What is the main flaw? (type: "not stratified" or "unrepresentative")`,
          expected: { kind: 'text', accept: ['not stratified', 'unrepresentative', 'not representative'] },
          display: 'unrepresentative',
          solution: `Two from each area over-samples management (${2}/9 = 22% of the sample but 9/197 ≈ 5% of the staff). A stratified sample would take each area's share of 197. The flaw is that the sample is unrepresentative — quota-style picking ignores group sizes.`,
          distractors: ['sample too small', 'not random enough', 'questions too few'],
        };
      },
    },
  },
  {
    id: 'cm-fermi',
    name: 'Fermi estimation',
    category: 'Statistics',
    description: 'Order-of-magnitude estimates from reasonable assumptions (E2.1).',
    marks: [2, 3, 4],
    gen: {
      easy: (r) => {
        const len = r.pick([20, 25, 50]), wid = r.pick([10, 12, 20]), depth = r.pick([1.5, 2, 2.5]);
        const litres = len * wid * depth * 1000;
        return numDraft(`A pool is ${len} m × ${wid} m × ${depth} m deep. Estimate its volume in litres.`, litres,
          `${len} × ${wid} × ${depth} = ${fmt(len * wid * depth)} m³; 1 m³ = 1000 litres, so ≈ ${fmt(litres)} litres.`,
          [litres / 1000, litres * 2, len * wid + depth * 1000], litres, 'litres');
      },
      medium: (r) => {
        const perDay = r.pick([150, 200, 250]), days = r.pick([5, 6, 7]);
        const weeks = r.pick([30, 40, 45]);
        const total = perDay * days * weeks;
        return numDraft(`A café serves about ${perDay} cups a day, ${days} days a week, for ${weeks} weeks a year. Estimate cups per year.`, total,
          `${perDay} × ${days} × ${weeks} = ${fmt(total)}.`,
          [perDay * days, total / 2, total + 5000], total, 'cups');
      },
      hard: (r) => {
        const households = 28, share = r.pick([2, 4, 5]);
        const thousands = Math.round(((households * 1000000) / (share * 25) + 100000) / 1000);
        return numDraft(`The UK has about 28 million households; 1 in ${share * 25} owns a piano; schools and venues hold about 100,000 more. Estimate the total (in thousands).`, thousands,
          `28,000,000 ÷ ${share * 25} = ${fmt((households * 1000000) / (share * 25))}; plus 100,000 → ≈ ${fmt(thousands * 1000)} pianos = ${fmt(thousands)} thousand.`,
          [thousands * 10, Math.round(thousands / 2), thousands + 100], thousands);
      },
    },
  },
  {
    id: 'cm-expected-value',
    name: 'Expected value',
    category: 'Statistics',
    description: 'Probability-weighted average of outcomes — the long-run mean (R7.1, R10.2).',
    marks: [2, 3, 4],
    gen: {
      easy: (r) => {
        const pWin = r.pick([0.2, 0.25, 0.3]), win = r.pick([3, 5, 8]), stake = 1;
        const ev = pWin * win - (1 - pWin) * stake;
        return numDraft(`A £${stake} game pays £${win} with probability ${pWin}, otherwise nothing back. Expected profit per play? (pence to 1 dp as a decimal of pounds)`, ev,
          `E = ${pWin} × £${win} − ${fmt(1 - pWin)} × £${stake} = £${fmt(ev)} per play.`,
          [pWin * win, win - stake, -ev], ev);      },
      medium: (r) => {
        const premium = r.pick([80, 100, 120, 150]), cover = r.pick([1000, 2000]), p = r.pick([0.008, 0.01, 0.02]);
        const expectedLoss = cover * p;
        const evOfPolicy = expectedLoss - premium;
        return numDraft(`Insurance costs £${premium} a year against a £${cover} event with probability ${p}. Expected value of the policy to the buyer (loss negative, pounds)?`, evOfPolicy,
          `Expected payout = ${cover} × ${p} = £${fmt(expectedLoss)}. Value = ${fmt(expectedLoss)} − ${premium} = £${fmt(evOfPolicy)} — negative, which is why insurers exist.`,
          [expectedLoss, premium, cover - premium], evOfPolicy);      },
      hard: (r) => {
        const pFail = 0.2, loss = r.pick([5000, 7000, 10000]), premium = r.pick([400, 500, 600]);
        const doNothing = pFail * loss;
        return numDraft(`A failure costs £${loss} with probability ${pFail}. A support contract costs £${premium} a year and covers it fully. Expected annual saving of the contract?`, doNothing - premium,
          `Doing nothing expects ${pFail} × ${loss} = £${fmt(doNothing)}. The contract costs £${premium}, so it saves £${fmt(doNothing)} − ${premium} = £${fmt(doNothing - premium)} a year on expectation.`,
          [doNothing, premium - doNothing, loss - premium], doNothing - premium);      },
    },
  },
  {
    id: 'cm-tree-probability',
    name: 'Tree diagrams & combined events',
    category: 'Statistics',
    description: 'Multiply along branches, add across paths (R5.1, R6.1).',
    marks: [2, 3, 4],
    gen: {
      easy: (r) => {
        const pA = r.pick([0.5, 0.6, 0.7]), pB = r.pick([0.4, 0.5, 0.8]);
        const both = pA * pB;
        return numDraft(`Events A and B are independent with P(A) = ${pA} and P(B) = ${pB}. Find P(A and B).`, both,
          `Independent: multiply. ${pA} × ${pB} = ${fmt(both)}.`,
          [pA + pB, pA * pB + 0.01, pB - pA], both);      },
      medium: (r) => {
        const red = r.int(3, 7), blue = r.int(3, 7);
        const total = red + blue;
        const bothRed = (red / total) * ((red - 1) / (total - 1));
        return fracDraft(`A bag holds ${red} red and ${blue} blue counters. Two are drawn without replacement. P(both red)? (fraction)`,
          Math.round(bothRed * 10000), 10000,
          `First: ${red}/${total}. Second (one gone): ${red - 1}/${total - 1}. Multiply: ${red}/${total} × ${red - 1}/${total - 1} = ${fmt(bothRed)}.`,
          [`${red}/${total}`, `${red * red}/${total * total}`, `${blue}/${total}`]);
      },
      hard: (r) => {
        const pA = r.pick([0.3, 0.4, 0.5]), pB = r.pick([0.2, 0.3, 0.6]);
        const either = pA + pB - pA * pB;
        return numDraft(`Independent events: P(A) = ${pA}, P(B) = ${pB}. Find P(A or B or both).`, either,
          `P(A) + P(B) − P(A∩B) = ${pA} + ${pB} − ${fmt(pA * pB)} = ${fmt(either)}. (Equivalently 1 − (1−${pA})(1−${pB}).)`,
          [pA + pB, pA * pB, 1 - pA * pB], either);      },
    },
  },
  {
    id: 'cm-critical-path',
    name: 'Critical path & float',
    category: 'Geometry',
    description: 'Longest path through an activity network; float on the rest (R2.1).',
    marks: [2, 3, 4],
    gen: {
      easy: (r) => {
        const a = r.int(2, 5), b = r.int(2, 6), c = r.int(2, 5);
        const longest = a + b + c;
        return numDraft(`A project runs A (${a} days), then B (${b} days), then C (${c} days). What is the project duration?`, longest,
          `One path through all three: ${a} + ${b} + ${c} = ${longest} days. Every activity is critical.`,
          [a + b, b + c, longest + 1], longest, 'days');
      },
      medium: (r) => {
        const a = r.int(2, 4), b = r.int(3, 6), c = r.int(2, 5), d = r.int(2, 5);
        const path1 = a + b, path2 = a + c + d;
        const duration = Math.max(path1, path2);
        return numDraft(`A runs ${a} days; then the work splits: B (${b} days) or C (${c} days) then D (${d} days). Project duration?`, duration,
          `Path A–B: ${path1} days. Path A–C–D: ${path2} days. The longest is ${duration} — that is the duration; the shorter path carries float.`,
          [Math.min(path1, path2), path1 + path2, duration + a], duration, 'days');
      },
      hard: (r) => {
        const a = r.int(2, 4), b = r.int(3, 6), c = r.int(2, 5), d = r.int(2, 5);
        const path1 = a + b, path2 = a + c + d;
        const duration = Math.max(path1, path2);
        const float = Math.abs(path1 - path2);
        return numDraft(`A–B takes ${a}+${b} = ${path1} days; A–C–D takes ${a}+${c}+${d} = ${path2} days. What is the float on the shorter path?`, float,
          `Float = duration − path length = ${duration} − ${Math.min(path1, path2)} = ${float} day${float === 1 ? '' : 's'}.`,
          [duration, Math.min(path1, path2), float + 1], float, 'days');
      },
    },
  },
];

function meanDraftFallback(r: Rng): Draft {
  const nums = Array.from({ length: 5 }, () => r.int(2, 12));
  const sum = nums.reduce((a, b) => a + b, 0);
  const mean = Math.round((sum / 5) * 10) / 10;
  return numDraft(`Find the mean of ${nums.join(', ')} (round to 1 dp).`, mean, `Sum = ${sum}; ${sum} ÷ 5 = ${mean}.`, [sum, sum / 4, Math.min(...nums) + 1], mean);
}

// ── draft helpers used above ────────────────────────────────────────────────

function reduce(n: number, d: number): [number, number] {
  const g = gcd(n, d);
  return [n / g, d / g];
}

/**
 * Distractors that are value-equal to the answer are the one way a multiple-
 * choice question can be unfair — two options both pass marking. Every draft
 * builder filters through here, so the invariant lives in one place rather
 * than in thirty generators.
 */
function cleanDistractors(expected: Expected, raw: (string | number)[]): string[] {
  const out: string[] = [];
  for (const d of raw) {
    const s = typeof d === 'number' ? numDisplay(d, expected.kind === 'num' ? expected.unit : undefined) : d;
    if (!s.trim()) continue;
    if (passes(expected, s)) continue; // value-equal to the answer — never offer it
    if (out.includes(s)) continue;
    out.push(s);
  }
  return out;
}

/** Raw value check used by cleanDistractors (markAnswer minus the empty case). */
function passes(expected: Expected, s: string): boolean {
  switch (expected.kind) {
    case 'num': {
      const v = parseNumber(s);
      return v !== null && Math.abs(v - expected.value) <= (expected.tolerance ?? (Number.isInteger(expected.value) ? 1e-9 : 0.005));
    }
    case 'frac': {
      const f = parseFraction(s);
      return f !== null && f.n * expected.den === expected.num * f.d;
    }
    case 'expr':
      return expected.accept.some((a) => normalizeExpr(a) === normalizeExpr(s));
    case 'text':
      return expected.accept.some((a) => fullyNormalized(a) === fullyNormalized(s));
    case 'pair': {
      const nums = extractNumbers(s);
      return nums.some((n) => Math.abs(n - expected.x) < 1e-9) && nums.some((n) => Math.abs(n - expected.y) < 1e-9);
    }
  }
}

function numDraft(prompt: string, value: number, solution: string, distractors: (string | number)[], _tol?: number, unit?: string): Draft {
  const expected: Expected = { kind: 'num', value, unit };
  return {
    prompt,
    expected,
    display: numDisplay(value, unit),
    solution,
    distractors: cleanDistractors(expected, distractors),
  };
}

function fracDraft(prompt: string, num: number, den: number, solution: string, distractors: string[]): Draft {
  const expected: Expected = { kind: 'frac', num, den };
  return {
    prompt,
    expected,
    display: fracDisplay(num, den),
    solution,
    distractors: cleanDistractors(expected, distractors),
  };
}

function exprDraft(prompt: string, accept: string[], solution: string, distractors: string[]): Draft {
  const expected: Expected = { kind: 'expr', accept };
  return {
    prompt,
    expected,
    display: accept[0],
    solution,
    distractors: cleanDistractors(expected, distractors),
  };
}

// ── question identity: concept:difficulty:seed ──────────────────────────────

export function questionId(conceptId: string, difficulty: Difficulty, seed: number): string {
  return `${conceptId}:${difficulty}:${seed}`;
}

export function parseQuestionId(id: string): { conceptId: string; difficulty: Difficulty; seed: number } | null {
  const parts = id.split(':');
  if (parts.length !== 3) return null;
  const [conceptId, difficulty, seedRaw] = parts;
  if (!DIFFICULTIES.includes(difficulty as Difficulty)) return null;
  const concept = CONCEPT_BY_ID.get(conceptId);
  if (!concept) return null;
  const seed = Number(seedRaw);
  if (!Number.isInteger(seed) || seed < 0 || seed > 2 ** 31) return null;
  return { conceptId, difficulty: difficulty as Difficulty, seed };
}

/**
 * The full catalogue: the GCSE-era concepts plus the Core Maths set defined
 * above. One registry, so every consumer (practice picker, set authoring,
 * marking) sees the same list without a second merge point.
 */
export const CONCEPTS: Concept[] = [...BASE_CONCEPTS, ...CM_CONCEPTS];

export const CONCEPT_BY_ID: ReadonlyMap<string, Concept> = new Map(CONCEPTS.map((c) => [c.id, c]));

export function conceptMarks(conceptId: string, difficulty: Difficulty): number {
  const c = CONCEPT_BY_ID.get(conceptId);
  if (!c) return 1;
  return c.marks[DIFFICULTIES.indexOf(difficulty)];
}

/** Generate the full question (answer included). Server-side only in spirit —
 *  this module is pure, so the server calls it and the client never sees the
 *  expected fields. */
export function buildDraft(conceptId: string, difficulty: Difficulty, seed: number): Draft {
  const concept = CONCEPT_BY_ID.get(conceptId);
  if (!concept) throw new Error(`maths: unknown concept "${conceptId}"`);
  // Mix the concept into the seed so two concepts sharing a seed still differ.
  const rng = makeRng((seed ^ hashString(conceptId)) >>> 0);
  return concept.gen[difficulty](rng);
}

export type MathsQuestion = {
  questionId: string;
  conceptId: string;
  conceptName: string;
  difficulty: Difficulty;
  marks: number;
  prompt: string;
  style: 'short' | 'mcq';
  options?: string[];
};

/** The question as the student sees it — no answer material. */
export function buildQuestion(id: string, style: 'short' | 'mcq'): MathsQuestion {
  const parsed = parseQuestionId(id);
  if (!parsed) throw new Error(`maths: bad question id "${id}"`);
  const draft = buildDraft(parsed.conceptId, parsed.difficulty, parsed.seed);
  const concept = CONCEPT_BY_ID.get(parsed.conceptId)!;
  const q: MathsQuestion = {
    questionId: id,
    conceptId: parsed.conceptId,
    conceptName: concept.name,
    difficulty: parsed.difficulty,
    marks: conceptMarks(parsed.conceptId, parsed.difficulty),
    prompt: draft.prompt,
    style,
  };
  if (style === 'mcq') {
    const rng = makeRng((parsed.seed ^ hashString(id + '|options')) >>> 0);
    q.options = shuffleOptions(draft, rng);
  }
  return q;
}

function shuffleOptions(draft: Draft, rng: Rng): string[] {
  const seen = new Set([draft.display]);
  const pool: string[] = [];
  for (const d of draft.distractors) {
    const key = d.trim();
    if (!seen.has(key) && key !== '') {
      seen.add(key);
      pool.push(key);
    }
  }
  // Top up with per-kind perturbations until there are three — the counter k
  // keeps advancing so a collision (e.g. the value is 1, so +1 and +2 both
  // collide with something already offered) cannot stall the loop.
  let k = 1;
  while (pool.length < 3 && k < 100) {
    const pad = padDistractor(draft, k++);
    // The invariant is marking, not string equality: a pad that value-equals
    // the answer (a text pad that normalises the same way) must be skipped,
    // or the MCQ would have two passing options.
    if (!seen.has(pad) && !markAnswer(draft, pad).correct) {
      seen.add(pad);
      pool.push(pad);
    }
  }
  return rng.shuffle([draft.display, ...pool.slice(0, 3)]);
}

function padDistractor(draft: Draft, k: number): string {
  const e = draft.expected;
  if (e.kind === 'num') return numDisplay(e.value + k, e.unit);
  // Numerator only: (n+k)/(d+k) walks towards 1 and collides with a 1/1 answer forever.
  if (e.kind === 'frac') return fracDisplay(e.num + k, e.den);
  if (e.kind === 'pair') return `(x = ${e.x + k}, y = ${e.y + k})`;
  if (e.kind === 'text') {
    // A text answer cannot be perturbed numerically. Mutating a word of the
    // phrase gives a distractor that reads plausibly and cannot evaluate to
    // the answer's meaning: swap the last word for one that fails marking.
    const words = draft.display.split(/\s+/);
    if (words.length > 1 && k <= words.length) {
      const candidate = [...words.slice(0, -1), `${words[words.length - 1]}${'‑'.repeat(k)}`].join(' ');
      return candidate;
    }
    return `${draft.display} (none of these)`;
  }
  return `${draft.display}${'′'.repeat(k)}`;
}

// ── marking ─────────────────────────────────────────────────────────────────
// The one deliberate dependency in domain/ is mathjs, and it exists for this
// section only: "2(x+3)" and "2x+6" are the same answer, and a string compare
// cannot see that. Equivalence is decided by parsing both expressions and
// sampling them at a few variable values; if either fails to parse we fall
// back to the cheap normalised string compare. Generators stay plain
// arithmetic — mathjs never builds questions.

export type Verdict = { correct: boolean; note?: string };

function parseNumber(raw: string): number | null {
  let s = raw
    // A digit before a letter ("24m", "5cm2") is a magnitude with a unit; a
    // digit after a letter is a word boundary no unit regex should cross (see
    // below). Remove thousands commas and separating spaces first.
    .replace(/[, ]/g, '')
    .replace(/[£$%°]/g, '')
    .replace(/[−–—]/g, '-')
    .trim();
  // strip a trailing unit like "cm", "km/h", "cm²", "ml"
  // Ordered longest-first so "m" cannot eat "mm" or "ml", and whole words
  // (units never glued to digits as algebra would be) — "25 years" keeps its
  // number, "25 yrs" does not leave "25 y". The `s` entry is last and word-
  // bounded for the same reason.
  s = s.replace(/(cm2|cm3|m2|m3|cm²|cm³|m²|m³|mm|ml|cm|km\/h|m\/s|km|hours?|hrs?|mins?|minutes?|years?|yrs?|days?|weeks?|litres?|cups?|degrees?|°)\.?$/i, '');
  // Whole words that double as units in context ("9 managers", "4000 cups",
  // "2.8 thousand") — word-bounded so they can never be suffixes of numbers.
  s = s.trim().replace(/\s?(managers?|litres?|cups?|thousand|units)\.?$/i, '');
  // The bare single-letter units the first pass cannot catch once the space is
  // gone ("45m", "3g", "2l") — but only when the letter is not a variable
  // glued to a coefficient's magnitude being preserved, i.e. only after a
  // digit-and-nothing-else so "45m" → 45 while "45x" stays an expression.
  s = s.trim().replace(/^(-?\d+(?:\.\d+)?)[mgl]$/i, '$1');
  // A prose answer whose digits the arithmetic evaluator would misread —
  // "the monthly account" — is marked by the text branch below. Refuse a
  // numeric reading here so a MCQ option's words cannot evaluate through
  // mathjs and accidentally collide with another option (or with nothing).
  if (/[a-df-z]/i.test(s.replace(/\/|\s|-/g, ''))) return null;
  s = s.trim().replace(/%$/, '');
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  // "a/b" fraction → decimal
  const f = s.match(/^(-?\d+)\/(\d+)$/);
  if (f) {
    const d = Number(f[2]);
    if (d === 0) return null;
    return Number(f[1]) / d;
  }
  // mixed number "1 1/2"
  const m = s.match(/^(-?\d+) (\d+)\/(\d+)$/);
  if (m) {
    const d = Number(m[3]);
    if (d === 0) return null;
    return (Number(m[1]) < 0 ? -1 : 1) * (Math.abs(Number(m[1])) + Number(m[2]) / d);
  }
  // Last resort: a typed arithmetic expression — 6×7, 2^5, √16, (3+4)/2.
  // The server marks from the string, so a correct but unevaluated answer is
  // still a correct answer.
  try {
    const ev = mathParse(prepareForMathjs(s))?.evaluate();
    if (typeof ev === 'number' && Number.isFinite(ev)) return ev;
  } catch {
    /* not an expression we can evaluate */
  }
  return null;
}

function parseFraction(raw: string): { n: number; d: number } | null {
  const s = raw.trim().replace(/[−–—]/g, '-');
  const frac = s.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (frac) return { n: Number(frac[1]), d: Number(frac[2]) };
  const mixed = s.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const sign = Number(mixed[1]) < 0 ? -1 : 1;
    return { n: sign * (Math.abs(Number(mixed[1])) * Number(mixed[3]) + Number(mixed[2])), d: Number(mixed[3]) };
  }
  const dec = parseNumber(s);
  if (dec !== null) {
    // decimal → approximate fraction with denominator 1000
    const scaled = Math.round(dec * 1000);
    return { n: scaled, d: 1000 };
  }
  return null;
}

function normalizeExpr(s: string): string {
  return s
    .normalize('NFKC') // NFKC folds ² into the digit 2 — see the rule below
    .replace(/\s+/g, '')
    .replace(/[×·]/g, '*')
    .replace(/[−–—]/g, '-')
    .replace(/÷/g, '/')
    .toLowerCase()
    // After NFKC, a superscript is a bare digit glued to its letter (x² → x2);
    // turn that back into the exponent form mathjs parses. A digit *before*
    // the letter (9x) is a coefficient and is left alone.
    .replace(/([a-z])([2-9])/g, '$1^$2')
    .replace(/\*/g, '')
    .replace(/\.+$/, '');
}

function extractNumbers(s: string): number[] {
  const matches = s.replace(/[−–—]/g, '-').match(/-?\d+(\.\d+)?/g);
  return matches ? matches.map(Number) : [];
}

/** Mark a raw answer against a draft. `raw` is the typed answer, or the chosen
 *  option's text for MCQ. */
export function markAnswer(draft: Draft, raw: string | null | undefined): Verdict {
  if (raw === null || raw === undefined || !raw.trim()) {
    return { correct: false, note: 'No answer given.' };
  }
  const e = draft.expected;
  const user = raw.trim();

  switch (e.kind) {
    case 'num': {
      const v = parseNumber(user);
      if (v === null) return { correct: false };
      const tol = e.tolerance ?? (Number.isInteger(e.value) ? 1e-9 : 0.005);
      if (Math.abs(v - e.value) <= tol) return { correct: true };
      if (Math.abs(v - e.value) <= (e.tolerance ?? 0.005) * 10 && !Number.isInteger(e.value)) {
        return { correct: false, note: 'Check your rounding.' };
      }
      return { correct: false };
    }
    case 'frac': {
      const f = parseFraction(user);
      if (!f || f.d === 0) return { correct: false };
      if (f.n * e.den === e.num * f.d) return { correct: true };
      const dec = f.n / f.d;
      if (Math.abs(dec - e.num / e.den) < 1e-6) return { correct: true };
      return { correct: false };
    }
    case 'expr': {
      if (e.accept.some((a) => expressionsEqual(a, user))) return { correct: true };
      return { correct: false };
    }
    case 'text': {
      const u = fullyNormalized(user);
      if (e.accept.some((a) => fullyNormalized(a) === u)) return { correct: true };
      return { correct: false };
    }
    case 'pair': {
      // The answer states both values as numbers — "3 or -4", "x = 3, y = -4".
      // Unordered (quadratic roots): both values present, each matched by a
      // different number. Ordered (simultaneous): the first number is x and
      // the second is y, so a swap cannot pass.
      const nums = extractNumbers(user);
      if (e.ordered) {
        if (nums.length >= 2 && Math.abs(nums[0] - e.x) < 1e-9 && Math.abs(nums[1] - e.y) < 1e-9) return { correct: true };
      } else {
        const hitsX = nums.filter((n) => Math.abs(n - e.x) < 1e-9).length;
        const hitsY = nums.filter((n) => Math.abs(n - e.y) < 1e-9).length;
        if (e.x === e.y ? hitsX >= 2 : hitsX >= 1 && hitsY >= 1) return { correct: true };
      }
      if (/\?|unknown/i.test(user) && nums.length > 0) return { correct: false, note: 'Give both values.' };
      return { correct: false };
    }
  }
}

/**
 * Are two algebraic expressions the same function? Parse both with mathjs and
 * sample them at a few variable values; identical outputs everywhere we look
 * (and at a couple of wilder points) is the practical definition of equal
 * here. Falls back to the normalised string compare when either fails to
 * parse — an unparseable answer can still be right, it just needs the cheap
 * test.
 */
export function expressionsEqual(a: string, b: string): boolean {
  const na = normalizeExpr(a);
  const nb = normalizeExpr(b);
  if (na === nb) return true;
  try {
    const pa = mathParse(prepareForMathjs(na));
    const pb = mathParse(prepareForMathjs(nb));
    if (!pa || !pb) return false;
    for (const x of [1.234, -2.718, 3.14159]) {
      const va = pa.evaluate({ x });
      const vb = pb.evaluate({ x });
      if (typeof va !== 'number' || typeof vb !== 'number') return false;
      if (Math.abs(va - vb) > 1e-9 * Math.max(1, Math.abs(va))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** mathjs needs explicit multiplication: 2x → 2*x, x(x+1) → x*(x+1). */
function prepareForMathjs(s: string): string {
  return s.replace(/(\d)([a-z(])/g, '$1*$2').replace(/([a-z)])\(/g, '$1*(');
}

// ── session composition ─────────────────────────────────────────────────────

export type Pool = { conceptId: string; difficulty: Difficulty | 'mixed' }[];

/** Deal `count` question ids from a pool. Pure given the rng. */
export function dealQuestions(pool: Pool, count: number, rng: Rng): { questionId: string; conceptId: string; difficulty: Difficulty; marks: number }[] {
  const out: { questionId: string; conceptId: string; difficulty: Difficulty; marks: number }[] = [];
  const order = rng.shuffle(pool);
  for (let i = 0; i < count; i++) {
    const entry = order[i % order.length];
    const difficulty = entry.difficulty === 'mixed' ? rng.pick(DIFFICULTIES) : entry.difficulty;
    const concept = CONCEPT_BY_ID.get(entry.conceptId);
    if (!concept) continue;
    out.push({
      questionId: questionId(entry.conceptId, difficulty, rng.int(1, 2 ** 30)),
      conceptId: entry.conceptId,
      difficulty,
      marks: conceptMarks(entry.conceptId, difficulty),
    });
  }
  return out;
}
