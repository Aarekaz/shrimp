import { describe, it, expect, mock } from 'bun:test';
import { AgentLoop } from '../../src/core/loop';
import { ShrimpEventBus } from '../../src/core/events';
import { CapabilityRegistry } from '../../src/core/registry';
import { ApprovalGate } from '../../src/core/approval';
import type { ModelAdapter, ModelResponse, Tool, Message, Capability } from '../../src/core/types';
import { ok } from '../../src/core/types';

function createMockModel(responses: ModelResponse[]): ModelAdapter {
  let callCount = 0;
  return {
    async generate(_messages: Message[], _tools?: Tool[]): Promise<ModelResponse> {
      return responses[callCount++] ?? { content: 'No response', usage: { inputTokens: 0, outputTokens: 0 } };
    },
    async *stream() {
      yield { delta: 'mock' };
    },
  };
}

describe('AgentLoop', () => {
  it('processes a user message and returns model response', async () => {
    const bus = new ShrimpEventBus();
    const registry = new CapabilityRegistry();
    const gate = new ApprovalGate({}, 'approve');
    const model = createMockModel([
      { content: 'Hello! I am Shrimp.', usage: { inputTokens: 10, outputTokens: 5 } },
    ]);

    const loop = new AgentLoop({ bus, registry, gate, model, identity: { name: 'Shrimp', owner: 'test' } });
    const response = await loop.handleMessage('Hello');
    expect(response).toBe('Hello! I am Shrimp.');
  });

  it('dispatches tool calls and feeds results back to model', async () => {
    const bus = new ShrimpEventBus();
    const registry = new CapabilityRegistry();
    const gate = new ApprovalGate({}, 'auto');

    const storeFn = mock(async () => ok({ stored: 'abc-123' }));
    const cap: Capability = {
      name: 'memory',
      description: 'Memory',
      tools: [{
        name: 'memory.store',
        description: 'Store a fact',
        inputSchema: { type: 'object', properties: { content: { type: 'string' } } },
        approvalLevel: 'auto',
        handler: storeFn,
      }],
      async start() {},
      async stop() {},
    };
    registry.register(cap);

    const model = createMockModel([
      {
        content: '',
        toolCalls: [{ id: 'c1', name: 'memory.store', input: { content: 'test fact' } }],
        usage: { inputTokens: 10, outputTokens: 15 },
      },
      {
        content: 'Got it, I stored that fact.',
        usage: { inputTokens: 20, outputTokens: 10 },
      },
    ]);

    const loop = new AgentLoop({ bus, registry, gate, model, identity: { name: 'Shrimp', owner: 'test' } });
    const response = await loop.handleMessage('Remember that I like coffee');
    expect(storeFn).toHaveBeenCalledTimes(1);
    expect(response).toBe('Got it, I stored that fact.');
  });

  it('stops after max iterations to prevent infinite loops', async () => {
    const bus = new ShrimpEventBus();
    const registry = new CapabilityRegistry();
    const gate = new ApprovalGate({}, 'auto');

    const model = createMockModel(
      Array(20).fill({
        content: '',
        toolCalls: [{ id: 'c1', name: 'nonexistent.tool', input: {} }],
        usage: { inputTokens: 5, outputTokens: 5 },
      })
    );

    const loop = new AgentLoop({ bus, registry, gate, model, identity: { name: 'Shrimp', owner: 'test' }, maxIterations: 3 });
    const response = await loop.handleMessage('Do something');
    expect(response).toContain('limit');
  });
});
