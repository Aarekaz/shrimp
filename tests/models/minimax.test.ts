import { describe, it, expect, mock, afterEach } from 'bun:test';
import { MiniMaxAdapter } from '../../src/models/minimax';

const originalFetch = globalThis.fetch;

describe('MiniMaxAdapter', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends messages and parses response', async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({
        choices: [{ message: { content: 'Hello! I am Shrimp.', tool_calls: undefined }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }))
    ) as any;

    const adapter = new MiniMaxAdapter({ apiKey: 'test-key', model: 'minimax-m2.7', baseUrl: 'https://api.minimax.chat/v1' });
    const result = await adapter.generate([{ role: 'user', content: 'Hello' }]);
    expect(result.content).toBe('Hello! I am Shrimp.');
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(5);
  });

  it('parses tool calls from response', async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({
        choices: [{
          message: {
            content: '',
            tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'memory.store', arguments: '{"content":"test","type":"fact"}' } }],
          },
          finish_reason: 'tool_calls',
        }],
        usage: { prompt_tokens: 15, completion_tokens: 20 },
      }))
    ) as any;

    const adapter = new MiniMaxAdapter({ apiKey: 'test-key', model: 'minimax-m2.7', baseUrl: 'https://api.minimax.chat/v1' });
    const result = await adapter.generate([{ role: 'user', content: 'Remember my name' }]);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].name).toBe('memory.store');
    expect(result.toolCalls![0].input).toEqual({ content: 'test', type: 'fact' });
  });

  it('formats tools as OpenAI function calling schema', async () => {
    let capturedBody: any;
    globalThis.fetch = mock(async (_url: any, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      }));
    }) as any;

    const adapter = new MiniMaxAdapter({ apiKey: 'test-key', model: 'minimax-m2.7', baseUrl: 'https://api.minimax.chat/v1' });
    await adapter.generate(
      [{ role: 'user', content: 'test' }],
      [{
        name: 'memory.store',
        description: 'Store a fact',
        inputSchema: { type: 'object', properties: { content: { type: 'string' } } },
        approvalLevel: 'auto',
        handler: async () => ({ ok: true, value: {} } as any),
      }],
    );
    expect(capturedBody.tools).toHaveLength(1);
    expect(capturedBody.tools[0].type).toBe('function');
    expect(capturedBody.tools[0].function.name).toBe('memory.store');
  });
});
