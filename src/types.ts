export interface Tick {
  symbol: string;
  buy: number;
  sell: number;
  timestamp: number; 
}

export interface Sample {
  timestamp: number;
  mid: number;
}

export interface PriceSnapshot {
  symbol: string;
  buy: number;
  sell: number;
  high24h: number | null;
  low24h: number | null;
  change24hPct: number | null;
  timestamp: number;
}

export interface PersistedSymbolState {
  samples: Sample[];
  latest?: Tick;
}

export type PersistedState = Record<string, PersistedSymbolState>;
