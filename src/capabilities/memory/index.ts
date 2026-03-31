import { z } from 'zod';
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
        parameters: z.object({
          content: z.string().describe('The information to remember'),
          type: z.enum(['fact', 'episode', 'procedure']).describe('Type of memory'),
        }),
        approvalLevel: 'auto' as const,
        handler: async (input: Record<string, unknown>) => {
          const entry: MemoryEntry = {
            id: crypto.randomUUID(),
            type: input.type as MemoryEntry['type'],
            content: input.content as string,
            timestamp: new Date(),
          };
          await this.memory.store(entry);
          return ok({ title: 'Memory stored', output: { stored: entry.id } });
        },
      },
      {
        name: 'memory.recall',
        description: 'Recall information from memory. Returns recent and relevant entries.',
        parameters: z.object({
          query: z.string().describe('What to search for'),
        }),
        approvalLevel: 'auto' as const,
        handler: async (input: Record<string, unknown>) => {
          const results = await this.memory.recall(input.query as string);
          if (results.length === 0) {
            return ok({ title: 'Memory recall', output: { results: [], message: 'No matching memories found.' } });
          }
          return ok({
            title: 'Memory recall',
            output: { results: results.map(r => ({ type: r.type, content: r.content })) },
          });
        },
      },
      {
        name: 'memory.forget',
        description: 'Remove a specific memory entry by its ID.',
        parameters: z.object({
          id: z.string().describe('The ID of the memory to forget'),
        }),
        approvalLevel: 'auto' as const,
        handler: async (input: Record<string, unknown>) => {
          await this.memory.forget(input.id as string);
          return ok({ title: 'Memory forgotten', output: { forgotten: true } });
        },
      },
    ];
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
}
