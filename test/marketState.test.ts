import { describe, expect, it } from 'vitest';
import { MarketState } from '../src/marketState';

function tick(symbol: string, buy: number, sell: number, timestamp: number) {
  return { symbol, buy, sell, timestamp };
}

describe('MarketState', () => {
  it('calculates high, low and change from mid-price samples', () => {
    const state = new MarketState();
    const now = Date.now();
    state.ingest(tick('TEST', 10, 12, now - 2000));
    const result = state.ingest(tick('TEST', 12, 14, now - 1000));
    expect(result?.high24h).toBe(13);
    expect(result?.low24h).toBe(11);
    expect(result?.change24hPct).toBeCloseTo(((13 - 11) / 11) * 100);
  });

  it('ignores duplicate symbol timestamps', () => {
    const state = new MarketState();
    const now = Date.now();
    state.ingest(tick('TEST', 10, 12, now - 1000));
    state.ingest(tick('TEST', 12, 14, now - 1000));
    expect(state.exportState().TEST.samples).toHaveLength(1);
  });

  it('restores persisted samples', () => {
    const now = Date.now();
    const state = new MarketState();
    state.restoreState({ TEST: { samples: [{ timestamp: now - 1000, mid: 11 }], latest: tick('TEST', 10, 12, now - 1000) } });
    expect(state.get('TEST')?.high24h).toBe(11);
  });
});
