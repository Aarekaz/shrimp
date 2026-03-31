import { describe, it, expect } from 'bun:test';
import { ContextManager } from '../../src/core/context';
import type { Message } from '../../src/core/types';

function makeMessages(count: number, contentLength = 10): Message[] {
  return Array.from({ length: count }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as Message['role'],
    content: `${'x'.repeat(contentLength)} msg${i}`,
  }));
}

describe('ContextManager', () => {
  it('returns all messages when under token limit', () => {
    const manager = new ContextManager({ maxTokens: 10000, keepRecentCount: 6 });
    const messages = makeMessages(4, 10);
    const result = manager.fit(messages);
    expect(result).toEqual(messages);
    expect(result.length).toBe(4);
  });

  it('compacts old messages when over token limit', () => {
    // 20 messages each with 100 chars → ~500 tokens (ceil(2000/4))
    // Set a low limit of 100 tokens to force compaction
    const manager = new ContextManager({ maxTokens: 100, keepRecentCount: 4 });
    const messages = makeMessages(20, 40); // 20 * ~42 chars = ~840 chars → ~210 tokens

    const result = manager.fit(messages);

    // Result should be shorter than input
    expect(result.length).toBeLessThan(messages.length);

    // Most recent 4 messages should be preserved intact
    const recent = messages.slice(-4);
    const resultRecent = result.slice(-4);
    expect(resultRecent).toEqual(recent);

    // First message should be the system summary
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('[Summary');
  });

  it('always keeps last N messages intact', () => {
    const manager = new ContextManager({ maxTokens: 50, keepRecentCount: 3 });
    const messages = makeMessages(10, 30); // enough to force compaction

    const result = manager.fit(messages);

    // Last 3 messages should be the same objects
    const lastThree = messages.slice(-3);
    const resultLastThree = result.slice(-3);
    expect(resultLastThree).toEqual(lastThree);
  });

  it('estimates tokens as roughly chars/4', () => {
    const manager = new ContextManager({ maxTokens: 1000 });
    const messages: Message[] = [{ role: 'user', content: 'a'.repeat(400) }];
    const tokens = manager.estimateTokens(messages);
    expect(tokens).toBe(100); // 400 / 4
  });
});
