import type { Capability, Tool, MemoryEntry } from '../../core/types';
import { ok } from '../../core/types';
import { WorkingMemory } from './working';

export class MemoryCapability implements Capability {
  name = 'memory';
  description = 'Store and recall facts, episodes, and procedures';
  readonly memory: WorkingMemory;

  constructor() {
    this.memory = new WorkingMemory();
  }

  get tools(): Tool[] {
    return [
      {
        name: 'memory.store',
        description: 'Store a fact, episode, or procedure in memory. Use this to remember important information.',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'The information to remember' },
            type: { type: 'string', enum: ['fact', 'episode', 'procedure'], description: 'Type of memory' },
          },
          required: ['content', 'type'],
        },
        approvalLevel: 'auto' as const,
        handler: async (input: Record<string, unknown>) => {
          const entry: MemoryEntry = {
            id: crypto.randomUUID(),
            type: input.type as MemoryEntry['type'],
            content: input.content as string,
            timestamp: new Date(),
          };
          await this.memory.store(entry);
          return ok({ stored: entry.id });
        },
      },
      {
        name: 'memory.recall',
        description: 'Recall information from memory. Returns recent and relevant entries.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'What to search for in memory' },
          },
          required: ['query'],
        },
        approvalLevel: 'auto' as const,
        handler: async (input: Record<string, unknown>) => {
          const results = await this.memory.recall(input.query as string);
          if (results.length === 0) {
            return ok({ results: [], message: 'No matching memories found.' });
          }
          return ok({ results: results.map(r => ({ type: r.type, content: r.content })) });
        },
      },
      {
        name: 'memory.forget',
        description: 'Remove a specific memory entry by its ID.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The ID of the memory to forget' },
          },
          required: ['id'],
        },
        approvalLevel: 'auto' as const,
        handler: async (input: Record<string, unknown>) => {
          await this.memory.forget(input.id as string);
          return ok({ forgotten: true });
        },
      },
    ];
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
}
