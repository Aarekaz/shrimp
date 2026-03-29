import { describe, it, expect } from 'bun:test';
import { WorkingMemory } from '../../../src/capabilities/memory/working';

describe('WorkingMemory', () => {
  it('stores and retrieves entries', async () => {
    const mem = new WorkingMemory();
    await mem.store({ id: '1', type: 'fact', content: 'Owner name is aarekaz', timestamp: new Date() });
    const results = await mem.recall('owner name');
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('Owner name is aarekaz');
  });

  it('forgets entries by id', async () => {
    const mem = new WorkingMemory();
    await mem.store({ id: '1', type: 'fact', content: 'test fact', timestamp: new Date() });
    await mem.forget('1');
    const results = await mem.recall('test');
    expect(results).toHaveLength(0);
  });

  it('lists all entries', async () => {
    const mem = new WorkingMemory();
    await mem.store({ id: '1', type: 'fact', content: 'fact one', timestamp: new Date() });
    await mem.store({ id: '2', type: 'episode', content: 'episode one', timestamp: new Date() });
    const all = await mem.all();
    expect(all).toHaveLength(2);
  });

  it('search returns entries containing query substring', async () => {
    const mem = new WorkingMemory();
    await mem.store({ id: '1', type: 'fact', content: 'Owner prefers window seats', timestamp: new Date() });
    await mem.store({ id: '2', type: 'fact', content: 'Owner email is x@y.com', timestamp: new Date() });
    const results = await mem.search('window');
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('window');
  });

  it('recall returns most recent entries first', async () => {
    const mem = new WorkingMemory();
    await mem.store({ id: '1', type: 'fact', content: 'old fact', timestamp: new Date('2024-01-01') });
    await mem.store({ id: '2', type: 'fact', content: 'new fact', timestamp: new Date('2026-03-29') });
    const results = await mem.recall('fact');
    expect(results[0].id).toBe('2');
  });
});
