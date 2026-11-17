import type { Column, SheetRow } from './sheet';

/** Boss-key sheet: a plausible, boring budget table. Deterministic so it looks the same every time. */

export const BOSS_COLUMNS: Column[] = [
  { key: 'no', header: 'No', width: 52, align: 'right', kind: 'num' },
  { key: 'dept', header: 'Department', width: 150 },
  { key: 'owner', header: 'Owner', width: 130 },
  { key: 'item', header: 'Line item', width: 260 },
  { key: 'q3', header: 'Q3 Actual', width: 110, align: 'right', kind: 'num' },
  { key: 'q4', header: 'Q4 Budget', width: 110, align: 'right', kind: 'num' },
  { key: 'fc', header: 'Q4 Forecast', width: 110, align: 'right', kind: 'num' },
  { key: 'var', header: 'Variance', width: 100, align: 'right', kind: 'num' },
  { key: 'status', header: 'Status', width: 120, kind: 'chip' },
];

const DEPTS = ['Engineering', 'Marketing', 'Sales', 'Operations', 'Customer Success', 'Finance'];
const OWNERS = ['H. Nguyen', 'T. Tran', 'L. Pham', 'M. Le', 'D. Vu', 'A. Hoang', 'K. Do'];
const ITEMS = [
  'Cloud infrastructure', 'SaaS licenses', 'Contractors', 'Paid search', 'Events & sponsorships',
  'Travel', 'Hardware refresh', 'Training budget', 'Recruiting fees', 'Office supplies',
  'Customer onboarding', 'Support tooling', 'Data warehouse', 'Security audit', 'Content production',
];
const STATUS = ['On track', 'At risk', 'Under review', 'Approved'];

let cache: SheetRow[] | null = null;

export function bossRows(): SheetRow[] {
  if (cache) return cache;
  let seed = 20261117;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  cache = Array.from({ length: 34 }, (_, i) => {
    const q3 = Math.round(8000 + rnd() * 120000);
    const q4 = Math.round(q3 * (0.85 + rnd() * 0.4));
    const fc = Math.round(q4 * (0.9 + rnd() * 0.2));
    const variance = ((fc - q4) / q4) * 100;
    return {
      key: `boss-${i}`,
      no: String(i + 1),
      depth: 0,
      values: {
        no: String(i + 1),
        dept: DEPTS[Math.floor(rnd() * DEPTS.length)],
        owner: OWNERS[Math.floor(rnd() * OWNERS.length)],
        item: ITEMS[Math.floor(rnd() * ITEMS.length)],
        q3: `$${fmt(q3)}`,
        q4: `$${fmt(q4)}`,
        fc: `$${fmt(fc)}`,
        var: `${variance >= 0 ? '' : '-'}${Math.abs(variance).toFixed(1)}%`,
        status: STATUS[Math.floor(rnd() * STATUS.length)],
      },
    };
  });
  return cache;
}
