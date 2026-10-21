import { createClient, type RedisClientType } from 'redis';
import type { PersistedState } from './types';

const STATE_KEY = 'pricing-engine:state:v1';

export class StatePersistence {
  private client: RedisClientType;
  constructor(url: string) { this.client = createClient({ url }); }
  async connect(): Promise<void> {
    this.client.on('error', (err) => console.error('[redis] error:', err.message));
    await this.client.connect();
  }
  async load(): Promise<PersistedState | null> {
    const raw = await this.client.get(STATE_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as PersistedState; }
    catch { console.error('[redis] persisted state is invalid JSON; ignoring it'); return null; }
  }
  async save(state: PersistedState): Promise<void> {
    await this.client.set(STATE_KEY, JSON.stringify(state));
  }
  async close(): Promise<void> { if (this.client.isOpen) await this.client.quit(); }
}
