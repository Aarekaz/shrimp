import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { AgentsCapability } from '../../../src/capabilities/agents/index';
import type { ModelAdapter, ModelResponse, LLMTool, Message, Tool } from '../../../src/core/types';
import { ok } from '../../../src/core/types';

function makeModel(response: ModelResponse): ModelAdapter {
  return {
    async generate(_messages: Message[], _tools?: LLMTool[]): Promise<ModelResponse> {
      return response;
    },
    async *stream() {
      yield { delta: 'mock' };
    },
  };
}

function makeTool(name: string): Tool {
  return {
    name,
    description: `Tool ${name}`,
    parameters: z.object({}),
    approvalLevel: 'auto',
    handler: async () => ok({ title: name, output: {} }),
  };
}

// We need access to SubAgent internals — use AgentsCapability with a model that
// captures the tools it was called with so we can assert on filtering.
describe('SubAgent permissions', () => {
  it('allows all tools when no permissions set', async () => {
    let capturedTools: LLMTool[] | undefined;
    const model: ModelAdapter = {
      async generate(_msgs: Message[], tools?: LLMTool[]): Promise<ModelResponse> {
        capturedTools = tools;
        return { content: 'done', usage: { inputTokens: 0, outputTokens: 0 } };
      },
      async *stream() { yield { delta: '' }; },
    };

    const cap = new AgentsCapability();
    cap.addAgent({
      name: 'test',
      description: 'test',
      model,
      systemPrompt: 'test',
      tools: [makeTool('memory.store'), makeTool('computer.screenshot'), makeTool('agents.list')],
    });

    // delegate will call run which calls model.generate with the filtered tools
    const handler = cap.tools.find(t => t.name === 'agents.delegate')!;
    await handler.handler({ agent: 'test', task: 'do something' });

    // All 3 tools passed through (no permissions = allow all)
    expect(capturedTools?.length).toBe(3);
  });

  it('denies tools matching a glob deny rule', async () => {
    let capturedTools: LLMTool[] | undefined;
    const model: ModelAdapter = {
      async generate(_msgs: Message[], tools?: LLMTool[]): Promise<ModelResponse> {
        capturedTools = tools;
        return { content: 'done', usage: { inputTokens: 0, outputTokens: 0 } };
      },
      async *stream() { yield { delta: '' }; },
    };

    const cap = new AgentsCapability();
    cap.addAgent({
      name: 'test',
      description: 'test',
      model,
      systemPrompt: 'test',
      tools: [makeTool('memory.store'), makeTool('computer.screenshot'), makeTool('agents.list')],
      permissions: { 'memory.*': 'allow', 'computer.*': 'deny', 'agents.*': 'deny' },
    });

    const handler = cap.tools.find(t => t.name === 'agents.delegate')!;
    await handler.handler({ agent: 'test', task: 'do something' });

    // Only memory.store should pass through
    expect(capturedTools?.length).toBe(1);
    expect(capturedTools?.[0].name).toBe('memory.store');
  });

  it('allows exact match override within a glob pattern', async () => {
    let capturedTools: LLMTool[] | undefined;
    const model: ModelAdapter = {
      async generate(_msgs: Message[], tools?: LLMTool[]): Promise<ModelResponse> {
        capturedTools = tools;
        return { content: 'done', usage: { inputTokens: 0, outputTokens: 0 } };
      },
      async *stream() { yield { delta: '' }; },
    };

    const cap = new AgentsCapability();
    cap.addAgent({
      name: 'test',
      description: 'test',
      model,
      systemPrompt: 'test',
      tools: [makeTool('memory.recall'), makeTool('memory.store'), makeTool('agents.list')],
      // Only recall allowed; everything else not in rules → deny (rules are set)
      permissions: { 'memory.recall': 'allow', 'agents.*': 'deny' },
    });

    const handler = cap.tools.find(t => t.name === 'agents.delegate')!;
    await handler.handler({ agent: 'test', task: 'do something' });

    // memory.recall: allowed (exact match)
    // memory.store: no match, rules exist → deny
    // agents.list: glob deny
    expect(capturedTools?.length).toBe(1);
    expect(capturedTools?.[0].name).toBe('memory.recall');
  });

  it('denies all tools when rules exist but none match', async () => {
    let capturedTools: LLMTool[] | undefined;
    const model: ModelAdapter = {
      async generate(_msgs: Message[], tools?: LLMTool[]): Promise<ModelResponse> {
        capturedTools = tools;
        return { content: 'done', usage: { inputTokens: 0, outputTokens: 0 } };
      },
      async *stream() { yield { delta: '' }; },
    };

    const cap = new AgentsCapability();
    cap.addAgent({
      name: 'test',
      description: 'test',
      model,
      systemPrompt: 'test',
      tools: [makeTool('computer.screenshot')],
      permissions: { 'memory.*': 'allow' }, // no match for computer.*
    });

    const handler = cap.tools.find(t => t.name === 'agents.delegate')!;
    await handler.handler({ agent: 'test', task: 'do something' });

    // computer.screenshot has no match, rules exist → deny
    expect(capturedTools).toBeUndefined(); // no tools passed (empty array → undefined)
  });
});
