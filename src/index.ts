import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { config } from './config';
import { MarketState } from './marketState';
import { PriceBroadcaster } from './broadcaster';
import { StatePersistence } from './persistence';
import { UpstreamFeed } from './upstream';

async function main(): Promise<void> {
  const state = new MarketState();
  const persistence = new StatePersistence(config.REDIS_URL);
  let redisReady = false;
  try {
    await persistence.connect();
    const restored = await persistence.load();
    if (restored) { state.restoreState(restored); console.log(`[state] restored ${state.all().length} symbols from Redis`); }
    redisReady = true;
  } catch (error) {
    console.error('[state] Redis unavailable. Persistence is disabled until restart; start Redis and restart the app.', error instanceof Error ? error.message : error);
  }

  const app = express();
  app.get('/health', (_req, res) => res.json({ status: 'ok', redis: redisReady, symbols: state.all().length, uptimeSeconds: Math.round(process.uptime()) }));
  app.get('/prices', (_req, res) => res.json(state.all()));
  app.get('/prices/:symbol', (req, res) => {
    const result = state.get(req.params.symbol.toUpperCase());
    if (!result) { res.status(404).json({ error: 'No price data for this symbol yet' }); return; }
    res.json(result);
  });

  const server = createServer(app);
  const wss = new WebSocketServer({ server, perMessageDeflate: true, maxPayload: 16 * 1024 });
  const broadcaster = new PriceBroadcaster(wss, config.MAX_CLIENT_BUFFER_BYTES, (symbol) => state.get(symbol));
  server.listen(config.PORT, () => console.log(`[server] HTTP + WebSocket listening on http://localhost:${config.PORT}`));

  const feed = new UpstreamFeed((tick) => {
    const snapshot = state.ingest(tick);
    if (snapshot) broadcaster.publish(snapshot);
  });
  feed.start();

  const snapshotTimer = setInterval(async () => {
    if (!redisReady) return;
    try { await persistence.save(state.exportState()); }
    catch (error) { console.error('[state] snapshot failed:', error instanceof Error ? error.message : error); }
  }, config.SNAPSHOT_INTERVAL_MS);
  snapshotTimer.unref();

  const shutdown = async (signal: string) => {
    console.log(`[server] ${signal} received; shutting down`);
    clearInterval(snapshotTimer);
    feed.stop();
    wss.clients.forEach((client) => client.close(1001, 'Server shutting down'));
    server.close();
    if (redisReady) {
      try { await persistence.save(state.exportState()); await persistence.close(); }
      catch (error) { console.error('[state] final save failed:', error instanceof Error ? error.message : error); }
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => { console.error('[startup] fatal error:', error); process.exit(1); });
