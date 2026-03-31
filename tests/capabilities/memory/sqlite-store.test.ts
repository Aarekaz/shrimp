import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SQLiteMemoryStore } from '../../../src/capabilities/memory/sqlite-store';
import { unlinkSync } from 'fs';

const TEST_DB = './data/test-memory.db';

describe('SQLiteMemoryStore', () => {
  let store: SQLiteMemoryStore;

  beforeEach(() => { store = new SQLiteMemoryStore(TEST_DB); });
  afterEach(() => { store.close(); try { unlinkSync(TEST_DB); } catch {} });

  it('stores and recalls by substring', async () => {
    await store.store({ id: '1', type: 'fact', content: 'Owner name is Anurag', timestamp: new Date() });
    const results = await store.recall('Anurag');
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('Owner name is Anurag');
  });

  it('search ranks by relevance', async () => {
    await store.store({ id: '1', type: 'fact', content: 'Owner likes coffee', timestamp: new Date() });
    await store.store({ id: '2', type: 'fact', content: 'Owner likes tea and coffee and espresso', timestamp: new Date() });
    await store.store({ id: '3', type: 'fact', content: 'Owner name is Anurag', timestamp: new Date() });
    const results = await store.search('coffee');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].content).toContain('coffee');
  });

  it('persists across instances', async () => {
    await store.store({ id: '1', type: 'fact', content: 'persistent fact', timestamp: new Date() });
    store.close();
    const store2 = new SQLiteMemoryStore(TEST_DB);
    const results = await store2.recall('persistent');
    expect(results).toHaveLength(1);
    store2.close();
  });

  it('forgets by id', async () => {
    await store.store({ id: '1', type: 'fact', content: 'forget me', timestamp: new Date() });
    await store.forget('1');
    const results = await store.recall('forget');
    expect(results).toHaveLength(0);
  });

  it('recall returns newest first', async () => {
    await store.store({ id: '1', type: 'fact', content: 'old fact', timestamp: new Date('2024-01-01') });
    await store.store({ id: '2', type: 'fact', content: 'new fact', timestamp: new Date('2026-03-31') });
    const results = await store.recall('fact');
    expect(results[0].id).toBe('2');
  });

  it('lists all entries', async () => {
    await store.store({ id: '1', type: 'fact', content: 'one', timestamp: new Date() });
    await store.store({ id: '2', type: 'episode', content: 'two', timestamp: new Date() });
    const all = await store.all();
    expect(all).toHaveLength(2);
  });
});
