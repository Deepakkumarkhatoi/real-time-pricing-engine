import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  MARKET_WS_URL: z.string().url().default('wss://v3-prod.livefxhub.com/ws/algo'),
  MARKET_API_KEY: z.string().default(''),
  MARKET_SECRET_KEY: z.string().default(''),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  RECONNECT_BASE_MS: z.coerce.number().int().positive().default(1000),
  RECONNECT_MAX_MS: z.coerce.number().int().positive().default(30000),
  SNAPSHOT_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  MAX_CLIENT_BUFFER_BYTES: z.coerce.number().int().positive().default(1048576)
});

export const config = schema.parse(process.env);

export const SYMBOLS = [
  'AUDUSD','AUDCAD','AUDCHF','AUDJPY','AUDNZD','AUDSGD','CADCHF','CADJPY','CHFJPY','CHFSGD',
  'EURAUD','EURCAD','EURCHF','EURGBP','EURJPY','EURNZD','EURUSD','GBPAUD','GBPCAD','GBPCHF',
  'GBPJPY','GBPNZD','GBPUSD','NZDCAD','NZDCHF','NZDJPY','NZDUSD','USDCAD','USDCHF','USDCNH',
  'USDJPY','USDMXN','USDNOK','USDPLN','USDSEK','USDSGD','USDTRY','USDZAR','EURTRY','GBPTRY',
  'NOKJPY','SEKJPY','SGDJPY','ZARJPY','XAUUSD','XAGUSD','BTCUSD','ETHUSD','BNBUSD','SOLUSD',
  'XRPUSD','ADAUSD','DOGUSD','DOTUSD','LTCUSD','BCHUSD','XLMUSD','TRXUSD','UNIUSD','FILUSD','AVXUSD'
] as const;
