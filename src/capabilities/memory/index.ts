import { z } from 'zod';
import type { Capability, Tool, MemoryEntry, ToolUseContext } from '../../core/types';
import { ok } from '../../core/types';
import { WorkingMemory } from './working';
import { SQLiteMemoryStore } from './sqlite-store';
import { ProcedureStore } from './procedures';

export class MemoryCapability implements Capability {
  name = 'memory';
  description = 'Store and recall facts, episodes, and procedures';
  private store: WorkingMemory | SQLiteMemoryStore;
  private procedureStore?: ProcedureStore;

  constructor(dbPath?: string) {
    this.store = dbPath ? new SQLiteMemoryStore(dbPath) : new WorkingMemory();
    if (dbPath) {
      this.procedureStore = new ProcedureStore(dbPath.replace('.db', '-procedures.db'));
    }
  }

  get tools(): Tool[] {
    return [
      {
        name: 'memory.store',
        description: 'Store a fact, episode, or procedure in memory. Use this to remember important information.',
        isReadOnly: false,
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
          await this.store.store(entry);
          return ok({ title: 'Memory stored', output: { stored: entry.id } });
        },
      },
      {
        name: 'memory.recall',
        description: 'Recall information from memory. Returns recent and relevant entries.',
        isReadOnly: true,
        parameters: z.object({
          query: z.string().describe('What to search for'),
        }),
        approvalLevel: 'auto' as const,
        handler: async (input: Record<string, unknown>) => {
          const results = await this.store.recall(input.query as string);
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
        isReadOnly: false,
        parameters: z.object({
          id: z.string().describe('The ID of the memory to forget'),
        }),
        approvalLevel: 'auto' as const,
        handler: async (input: Record<string, unknown>) => {
          await this.store.forget(input.id as string);
          return ok({ title: 'Memory forgotten', output: { forgotten: true } });
        },
      },
      {
        name: 'memory.procedures',
        description: 'Look up learned procedures — multi-step patterns the agent has seen before. Check this when a task seems familiar.',
        parameters: z.object({ query: z.string().describe('What kind of task to look up') }),
        isReadOnly: true,
        approvalLevel: 'auto' as const,
        handler: async (input: Record<string, unknown>, ctx?: ToolUseContext) => {
          if (!this.procedureStore) {
            return ok({ title: 'No procedure store', output: { found: false } });
          }
          const candidates = this.procedureStore.findCandidatesByTrigger(input.query as string);
          const viable = candidates.find(proc =>
            proc.steps.every(name => ctx?.registry.resolveTool(name) !== undefined),
          );
          if (!viable) return ok({ title: 'No procedure found', output: { found: false } });
          this.procedureStore.incrementUsage(viable.id);
          return ok({
            title: `Procedure: ${viable.name}`,
            output: { found: true, id: viable.id, name: viable.name, steps: viable.steps, usedCount: viable.usedCount },
          });
        },
      },
      {
        name: 'memory.procedures.forget',
        description: 'Mark a procedure as unhelpful. After enough demerits, it will be skipped on recall. Use this when a recalled procedure led you astray.',
        parameters: z.object({
          id: z.string().describe('The procedure id from memory.procedures'),
        }),
        isReadOnly: false,
        approvalLevel: 'auto' as const,
        handler: async (input: Record<string, unknown>) => {
          if (!this.procedureStore) {
            return ok({ title: 'No procedure store', output: { demerited: false } });
          }
          const demerited = this.procedureStore.demerit(input.id as string);
          return ok({
            title: demerited ? 'Procedure demerited' : 'Procedure not found',
            output: { demerited },
          });
        },
      },
    ];
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
}
