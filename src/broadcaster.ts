import { WebSocket, WebSocketServer } from 'ws';
import type { PriceSnapshot } from './types';

interface ClientState { subscriptions: Set<string>; }

export class PriceBroadcaster {
  private readonly clients = new Map<WebSocket, ClientState>();
  constructor(
    private readonly wss: WebSocketServer,
    private readonly maxBufferedBytes: number,
    private readonly getSnapshot: (symbol: string) => PriceSnapshot | null
  ) {
    wss.on('connection', (socket) => {
      this.clients.set(socket, { subscriptions: new Set() });
      socket.send(JSON.stringify({ type: 'welcome', message: 'Send {"action":"subscribe","symbols":["EURUSD"]} to subscribe.' }));
      socket.on('message', (raw) => this.onClientMessage(socket, raw.toString()));
      socket.on('close', () => this.clients.delete(socket));
      socket.on('error', () => this.clients.delete(socket));
    });
  }

  publish(snapshot: PriceSnapshot): void {
    // Compact field names keep each update small. Clients can map b/s/h/l/c/t to full names.
    const payload = JSON.stringify({ s: snapshot.symbol, b: snapshot.buy, a: snapshot.sell, h: snapshot.high24h, l: snapshot.low24h, c: snapshot.change24hPct, t: snapshot.timestamp });
    for (const [socket, client] of this.clients) {
      if (socket.readyState !== WebSocket.OPEN || !client.subscriptions.has(snapshot.symbol)) continue;
      if (socket.bufferedAmount > this.maxBufferedBytes) {
        socket.close(1013, 'Client cannot keep up with market updates');
        continue;
      }
      socket.send(payload, { compress: true });
    }
  }

  sendSnapshot(socket: WebSocket, snapshot: PriceSnapshot): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ s: snapshot.symbol, b: snapshot.buy, a: snapshot.sell, h: snapshot.high24h, l: snapshot.low24h, c: snapshot.change24hPct, t: snapshot.timestamp }));
  }

  private onClientMessage(socket: WebSocket, raw: string): void {
    let message: unknown;
    try { message = JSON.parse(raw); } catch { socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' })); return; }
    if (!message || typeof message !== 'object') return;
    const obj = message as { action?: unknown; symbols?: unknown };
    const state = this.clients.get(socket);
    if (!state) return;
    if (obj.action === 'subscribe' && Array.isArray(obj.symbols)) {
      const symbols = obj.symbols.filter((s): s is string => typeof s === 'string').map((s) => s.toUpperCase());
      state.subscriptions = new Set(symbols);
      socket.send(JSON.stringify({ type: 'subscribed', symbols: [...state.subscriptions] }));
      for (const symbol of state.subscriptions) {
        const snapshot = this.getSnapshot(symbol);
        if (snapshot) this.sendSnapshot(socket, snapshot);
      }
    } else if (obj.action === 'unsubscribe' && Array.isArray(obj.symbols)) {
      for (const s of obj.symbols) if (typeof s === 'string') state.subscriptions.delete(s.toUpperCase());
      socket.send(JSON.stringify({ type: 'unsubscribed', symbols: obj.symbols }));
    } else {
      socket.send(JSON.stringify({ type: 'error', message: 'Unsupported action. Use subscribe or unsubscribe.' }));
    }
  }
}
