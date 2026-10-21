import type { Tick } from './types';

function toMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (value.trim() !== '' && Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normalizeMessage(raw: unknown): Tick[] {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw); } catch { return []; }
  }
  const ticks: Tick[] = [];
  for (const item of unwrap(value)) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const symbol = row.symbol ?? row.s;
    const buy = row.buy ?? row.bid ?? row.b;
    const sell = row.sell ?? row.ask ?? row.a;
    const timestamp = toMillis(row.timestamp ?? row.time ?? row.ts ?? Date.now());
    const nBuy = typeof buy === 'number' ? buy : Number(buy);
    const nSell = typeof sell === 'number' ? sell : Number(sell);
    if (typeof symbol === 'string' && symbol.length > 0 && Number.isFinite(nBuy) && Number.isFinite(nSell) && timestamp !== null) {
      ticks.push({ symbol: symbol.toUpperCase(), buy: nBuy, sell: nSell, timestamp });
    }
  }
  return ticks;
}

function unwrap(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(unwrap);
  if (!value || typeof value !== 'object') return [];
  const object = value as Record<string, unknown>;
  for (const key of ['data', 'prices', 'result', 'payload']) {
    if (key in object && object[key] !== value) {
      const nested = unwrap(object[key]);
      if (nested.length) return nested;
    }
  }
  return [value];
}
