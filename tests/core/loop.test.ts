import { describe, it, expect, mock } from 'bun:test';
import { z } from 'zod';
import { AgentLoop } from '../../src/core/loop';
import { ShrimpEventBus } from '../../src/core/events';
import { CapabilityRegistry } from '../../src/core/registry';
import { ApprovalGate } from '../../src/core/approval';
import type { ModelAdapter, ModelResponse, ModelChunk, LLMTool, Message, Capability, LoopEvent } from '../../src/core/types';
import { ok } from '../../src/core/types';

function createMockModel(responses: ModelResponse[]): ModelAdapter {
  let callCount = 0;
  return {
    async generate(_messages: Message[], _tools?: LLMTool[]): Promise<ModelResponse> {
      return responses[callCount++] ?? { content: 'No response', usage: { inputTokens: 0, outputTokens: 0 } };
    },
    async *stream(_messages: Message[], _tools?: LLMTool[]): AsyncIterable<ModelChunk> {
      const resp = responses[callCount++] ?? { content: 'No response', usage: { inputTokens: 0, outputTokens: 0 } };
      if (resp.content) {
        yield { delta: resp.content };
      }
      if (resp.toolCalls) {
        for (const tc of resp.toolCalls) {
          yield {
            delta: '',
            toolCallDelta: { id: tc.id, name: tc.name, inputDelta: JSON.stringify(tc.input) },
          };
        }
      }
    },
  };
}

async function collectEvents(gen: AsyncGenerator<LoopEvent>): Promise<LoopEvent[]> {
  const events: LoopEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
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

    const storeFn = mock(async () => ok({ title: 'Stored', output: { stored: 'abc-123' } }));
    const cap: Capability = {
      name: 'memory',
      description: 'Memory',
      tools: [{
        name: 'memory.store',
        description: 'Store a fact',
        parameters: z.object({ content: z.string() }),
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

  it('run() yields typed LoopEvents', async () => {
    const bus = new ShrimpEventBus();
    const registry = new CapabilityRegistry();
    const gate = new ApprovalGate({}, 'approve');
    const model = createMockModel([
      { content: 'Hello!', usage: { inputTokens: 10, outputTokens: 5 } },
    ]);

    const loop = new AgentLoop({ bus, registry, gate, model, identity: { name: 'Shrimp', owner: 'test' } });
    const events = await collectEvents(loop.run('Hi'));

    const types = events.map(e => e.type);
    expect(types).toContain('thinking');
    expect(types).toContain('chunk');
    expect(types).toContain('done');

    const done = events.find(e => e.type === 'done') as any;
    expect(done.content).toBe('Hello!');
  });

  it('emits task:approval-needed and denies when an approve-level tool has no interactive approver', async () => {
    const bus = new ShrimpEventBus();
    const registry = new CapabilityRegistry();
    const gate = new ApprovalGate({}, 'approve');

    const handler = mock(async () => ok({ title: 'sent', output: { sent: true } }));
    const cap: Capability = {
      name: 'email',
      description: 'Email',
      tools: [{
        name: 'email.send',
        description: 'Send an email',
        parameters: z.object({ to: z.string() }),
        approvalLevel: 'approve',
        handler,
      }],
      async start() {},
      async stop() {},
    };
    registry.register(cap);

    const approvalNeeded = mock(() => {});
    bus.on('task:approval-needed', approvalNeeded);

    const model = createMockModel([
      { content: '', toolCalls: [{ id: 'c1', name: 'email.send', input: { to: 'a@b.com' } }], usage: { inputTokens: 5, outputTokens: 5 } },
      { content: 'Could not send.', usage: { inputTokens: 5, outputTokens: 5 } },
    ]);

    const loop = new AgentLoop({ bus, registry, gate, model, identity: { name: 'Shrimp', owner: 'test' } });
    await loop.handleMessage('Email someone');

    expect(approvalNeeded).toHaveBeenCalledTimes(1);
    expect(handler).not.toHaveBeenCalled();
  });

  it('run() yields tool-call and tool-result events', async () => {
    const bus = new ShrimpEventBus();
    const registry = new CapabilityRegistry();
    const gate = new ApprovalGate({}, 'auto');

    const cap: Capability = {
      name: 'memory',
      description: 'Memory',
      tools: [{
        name: 'memory.store',
        description: 'Store',
        parameters: z.object({ content: z.string() }),
        approvalLevel: 'auto',
        handler: async () => ok({ title: 'Stored', output: { stored: true } }),
      }],
      async start() {},
      async stop() {},
    };
    registry.register(cap);

    const model = createMockModel([
      { content: '', toolCalls: [{ id: 'c1', name: 'memory.store', input: { content: 'test' } }], usage: { inputTokens: 5, outputTokens: 5 } },
      { content: 'Done.', usage: { inputTokens: 10, outputTokens: 3 } },
    ]);

    const loop = new AgentLoop({ bus, registry, gate, model, identity: { name: 'Shrimp', owner: 'test' } });
    const events = await collectEvents(loop.run('Store something'));

    const types = events.map(e => e.type);
    expect(types).toContain('tool-call');
    expect(types).toContain('tool-result');
    expect(types).toContain('done');
  });
});
