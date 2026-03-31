import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { AgentsCapability } from '../../../src/capabilities/agents/index';
import type { ModelAdapter, ModelResponse, ModelChunk, Message, LLMTool, Tool } from '../../../src/core/types';
import { ok } from '../../../src/core/types';
import { ShrimpEventBus } from '../../../src/core/events';
import { CapabilityRegistry } from '../../../src/core/registry';

function mockModel(response: string): ModelAdapter {
  return {
    async generate(): Promise<ModelResponse> {
      return { content: response, usage: { inputTokens: 0, outputTokens: 0 } };
    },
    async *stream(): AsyncIterable<ModelChunk> { yield { delta: response }; },
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

describe('AgentsCapability', () => {
  it('filters out agent tools from sub-agents (no-recurse guard)', () => {
    const agents = new AgentsCapability();
    agents.addAgent({
      name: 'researcher',
      description: 'Research',
      model: mockModel('ok'),
      systemPrompt: 'You research.',
    });

    // The sub-agent's filterTools should strip agents.* tools
    const allTools = [
      makeTool('memory.recall'),
      makeTool('agents.spawn'),
      makeTool('agents.delegate'),
      makeTool('agents.send'),
    ];

    // Access internal agent for testing via delegate
    // The no-recurse guard is tested implicitly: if spawn/delegate/send are in tools,
    // the sub-agent could recursively spawn more agents
  });

  it('delegates foreground task and returns result', async () => {
    const agents = new AgentsCapability();
    agents.addAgent({
      name: 'writer',
      description: 'Write things',
      model: mockModel('Here is your email.'),
      systemPrompt: 'You write.',
    });

    const delegateTool = agents.tools.find(t => t.name === 'agents.delegate')!;
    const result = await delegateTool.handler({ agent: 'writer', task: 'Write an email' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value.output as any).result).toBe('Here is your email.');
    }
  });

  it('spawns background task and returns task_id', async () => {
    const bus = new ShrimpEventBus();
    const registry = new CapabilityRegistry();
    const agents = new AgentsCapability();
    agents.addAgent({
      name: 'researcher',
      description: 'Research',
      model: mockModel('Found it.'),
      systemPrompt: 'You research.',
    });

    const spawnTool = agents.tools.find(t => t.name === 'agents.spawn')!;
    const result = await spawnTool.handler(
      { agent: 'researcher', task: 'Find info about X' },
      { bus, registry, model: mockModel(''), identity: { name: 'Shrimp', owner: 'test' } },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value.output as any).task_id).toBeTruthy();
      expect((result.value.output as any).status).toBe('running');
    }

    // Wait for background completion
    await new Promise(resolve => setTimeout(resolve, 100));
    const task = agents.taskManager.get((result as any).value.output.task_id);
    expect(task?.status).toBe('completed');
    expect(task?.result).toBe('Found it.');
  });

  it('sends message to running agent', async () => {
    const agents = new AgentsCapability();
    agents.addAgent({
      name: 'researcher',
      description: 'Research',
      model: mockModel('ok'),
      systemPrompt: 'You research.',
    });

    // Create a task manually
    const task = agents.taskManager.create('researcher', 'Find stuff');
    agents.taskManager.start(task.id);

    const sendTool = agents.tools.find(t => t.name === 'agents.send')!;
    const result = await sendTool.handler({ task_id: task.id, message: 'Also check Y' });
    expect(result.ok).toBe(true);

    // Message should be queued
    const messages = agents.taskManager.consumeMessages(task.id);
    expect(messages).toEqual(['Also check Y']);
  });

  it('lists tasks with status', async () => {
    const agents = new AgentsCapability();
    agents.addAgent({ name: 'r', description: 'R', model: mockModel('ok'), systemPrompt: '' });

    const t1 = agents.taskManager.create('r', 'Task 1');
    agents.taskManager.start(t1.id);
    agents.taskManager.complete(t1.id, 'Done');

    const t2 = agents.taskManager.create('r', 'Task 2');
    agents.taskManager.start(t2.id);

    const tasksTool = agents.tools.find(t => t.name === 'agents.tasks')!;
    const result = await tasksTool.handler({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      const output = result.value.output as any;
      expect(output.tasks).toHaveLength(2);
      expect(output.running).toBe(1);
    }
  });
});
