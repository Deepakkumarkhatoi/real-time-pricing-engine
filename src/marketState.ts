import type { PersistedState, PriceSnapshot, Sample, Tick } from './types';

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_SAMPLES_PER_SYMBOL = 200_000;


export class MarketState {
  private readonly states = new Map<string, { samples: Sample[]; latest?: Tick }>();

  ingest(tick: Tick): PriceSnapshot | null {
    if (!tick.symbol || !Number.isFinite(tick.buy) || !Number.isFinite(tick.sell) ||
        tick.buy <= 0 || tick.sell <= 0 || !Number.isFinite(tick.timestamp)) return null;

    const now = Date.now();
    // Avoid letting badly future-dated ticks poison the rolling window.
    if (tick.timestamp > now + 60_000 || tick.timestamp < now - 7 * WINDOW_MS) return null;

    const state = this.states.get(tick.symbol) ?? { samples: [] };
    const mid = (tick.buy + tick.sell) / 2;
    const sample: Sample = { timestamp: tick.timestamp, mid };
    const samples = state.samples;

    const index = lowerBound(samples, tick.timestamp);
    if (index < samples.length && samples[index].timestamp === tick.timestamp) {
      // Same symbol/timestamp: duplicate. Do not double-count it.
      return this.snapshotFor(tick.symbol, state, now);
    }
    samples.splice(index, 0, sample);

    const cutoff = now - WINDOW_MS;
    let firstInWindow = lowerBound(samples, cutoff);
    if (firstInWindow > 1) samples.splice(0, firstInWindow - 1);
    if (samples.length > MAX_SAMPLES_PER_SYMBOL) {
      samples.splice(0, samples.length - MAX_SAMPLES_PER_SYMBOL);
    }

    if (!state.latest || tick.timestamp >= state.latest.timestamp) state.latest = tick;
    this.states.set(tick.symbol, state);
    return this.snapshotFor(tick.symbol, state, now);
  }

  get(symbol: string): PriceSnapshot | null {
    const state = this.states.get(symbol);
    return state ? this.snapshotFor(symbol, state, Date.now()) : null;
  }

  all(): PriceSnapshot[] {
    return [...this.states.keys()].map((symbol) => this.get(symbol)).filter((v): v is PriceSnapshot => v !== null);
  }

  exportState(): PersistedState {
    const result: PersistedState = {};
    for (const [symbol, state] of this.states) {
      result[symbol] = { samples: state.samples, latest: state.latest };
    }
    return result;
  }

  restoreState(input: unknown): void {
    if (!input || typeof input !== 'object') return;
    const entries = Object.entries(input as Record<string, unknown>);
    const cutoff = Date.now() - WINDOW_MS - 60_000;
    for (const [symbol, raw] of entries) {
      if (!raw || typeof raw !== 'object') continue;
      const candidate = raw as { samples?: unknown; latest?: unknown };
      if (!Array.isArray(candidate.samples)) continue;
      const samples = candidate.samples.filter((s): s is Sample =>
        !!s && typeof s === 'object' && Number.isFinite((s as Sample).timestamp) &&
        Number.isFinite((s as Sample).mid) && (s as Sample).mid > 0 &&
        (s as Sample).timestamp >= cutoff
      ).sort((a, b) => a.timestamp - b.timestamp);
      const unique: Sample[] = [];
      for (const s of samples) {
        if (!unique.length || unique[unique.length - 1].timestamp !== s.timestamp) unique.push(s);
      }
      const latest = isTick(candidate.latest) ? candidate.latest : undefined;
      this.states.set(symbol, { samples: unique, latest });
    }
  }

  private snapshotFor(symbol: string, state: { samples: Sample[]; latest?: Tick }, now: number): PriceSnapshot | null {
    const latest = state.latest;
    if (!latest) return null;
    const cutoff = now - WINDOW_MS;
    const windowSamples = state.samples.filter((s) => s.timestamp >= cutoff && s.timestamp <= now + 60_000);
    if (windowSamples.length === 0) {
      return { symbol, buy: latest.buy, sell: latest.sell, high24h: null, low24h: null, change24hPct: null, timestamp: latest.timestamp };
    }
    let high = -Infinity;
    let low = Infinity;
    for (const s of windowSamples) {
      if (s.mid > high) high = s.mid;
      if (s.mid < low) low = s.mid;
    }

    const baseline = windowSamples[0].mid;
    const current = (latest.buy + latest.sell) / 2;
    const change = baseline !== 0 ? ((current - baseline) / baseline) * 100 : null;
    return {
      symbol, buy: latest.buy, sell: latest.sell,
      high24h: high, low24h: low,
      change24hPct: change === null || !Number.isFinite(change) ? null : change,
      timestamp: latest.timestamp
    };
  }
}

function lowerBound(samples: Sample[], timestamp: number): number {
  let low = 0, high = samples.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (samples[mid].timestamp < timestamp) low = mid + 1;
    else high = mid;
  }
  return low;
}

function isTick(value: unknown): value is Tick {
  if (!value || typeof value !== 'object') return false;
  const t = value as Tick;
  return typeof t.symbol === 'string' && Number.isFinite(t.buy) && Number.isFinite(t.sell) && Number.isFinite(t.timestamp);
}
