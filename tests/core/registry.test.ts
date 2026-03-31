import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { CapabilityRegistry } from '../../src/core/registry';
import type { Capability, Tool } from '../../src/core/types';
import { ok } from '../../src/core/types';

function makeTool(name: string): Tool {
  return {
    name,
    description: `Test tool ${name}`,
    parameters: z.object({}),
    approvalLevel: 'auto',
    handler: async () => ok({ title: 'Done', output: { result: 'ok' } }),
  };
}

function makeCapability(name: string, tools: Tool[]): Capability {
  return {
    name,
    description: `Test capability ${name}`,
    tools,
    async start() {},
    async stop() {},
  };
}

describe('CapabilityRegistry', () => {
  it('registers and retrieves a capability', () => {
    const registry = new CapabilityRegistry();
    const cap = makeCapability('memory', [makeTool('memory.store')]);
    registry.register(cap);
    expect(registry.get('memory')).toBe(cap);
  });

  it('lists all registered capabilities', () => {
    const registry = new CapabilityRegistry();
    registry.register(makeCapability('memory', []));
    registry.register(makeCapability('browser', []));
    const names = registry.list().map(c => c.name);
    expect(names).toContain('memory');
    expect(names).toContain('browser');
  });

  it('resolves a tool by name across all capabilities', () => {
    const registry = new CapabilityRegistry();
    const tool = makeTool('memory.store');
    registry.register(makeCapability('memory', [tool]));
    const resolved = registry.resolveTool('memory.store');
    expect(resolved).toBe(tool);
  });

  it('returns undefined for unknown tools', () => {
    const registry = new CapabilityRegistry();
    expect(registry.resolveTool('nonexistent.tool')).toBeUndefined();
  });

  it('collects all tools for LLM injection', () => {
    const registry = new CapabilityRegistry();
    registry.register(makeCapability('memory', [makeTool('memory.store'), makeTool('memory.recall')]));
    registry.register(makeCapability('browser', [makeTool('browser.goto')]));
    const allTools = registry.allTools();
    expect(allTools).toHaveLength(3);
    expect(allTools.map(t => t.name)).toContain('browser.goto');
  });

  it('throws on duplicate capability name', () => {
    const registry = new CapabilityRegistry();
    registry.register(makeCapability('memory', []));
    expect(() => registry.register(makeCapability('memory', []))).toThrow();
  });

  it('allToolsForLLM converts Zod schema to JSON Schema', () => {
    const registry = new CapabilityRegistry();
    const tool: Tool = {
      name: 'memory.store',
      description: 'Store a memory entry',
      parameters: z.object({
        content: z.string(),
        type: z.enum(['fact', 'episode']),
      }),
      approvalLevel: 'auto',
      handler: async () => ok({ title: 'Stored', output: { stored: 'abc-123' } }),
    };
    registry.register(makeCapability('memory', [tool]));
    const llmTools = registry.allToolsForLLM();
    expect(llmTools).toHaveLength(1);
    const llmTool = llmTools[0];
    expect(llmTool.name).toBe('memory.store');
    expect(llmTool.inputSchema).toMatchObject({
      type: 'object',
      properties: {
        content: { type: 'string' },
        type: { type: 'string', enum: ['fact', 'episode'] },
      },
      required: ['content', 'type'],
    });
  });

  it('allToolsForLLM uses rawInputSchema when present', () => {
    const registry = new CapabilityRegistry();
    const rawSchema = { type: 'object', properties: { foo: { type: 'number' } } };
    const tool: Tool = {
      name: 'composio.action',
      description: 'A Composio action',
      parameters: z.object({}),
      rawInputSchema: rawSchema,
      approvalLevel: 'auto',
      handler: async () => ok({ title: 'Done', output: {} }),
    };
    registry.register(makeCapability('composio', [tool]));
    const llmTools = registry.allToolsForLLM();
    expect(llmTools[0].inputSchema).toBe(rawSchema);
  });
});
