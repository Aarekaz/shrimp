import Supermemory from 'supermemory';
import type { Capability, Tool, MemoryEntry } from '../../core/types';
import { ok, err } from '../../core/types';

export interface SuperMemoryConfig {
  apiKey: string;
  userId?: string;
}

export class SuperMemoryCapability implements Capability {
  name = 'memory';
  description = 'Persistent memory powered by SuperMemory — store facts, recall context, search semantically';
  private client: Supermemory;
  private userId: string;

  constructor(config: SuperMemoryConfig) {
    this.client = new Supermemory({ apiKey: config.apiKey });
    this.userId = config.userId ?? 'default';
  }

  get tools(): Tool[] {
    return [
      {
        name: 'memory.store',
        description: 'Store a fact, episode, or procedure in persistent memory. This survives restarts. Use this to remember important information about the user or tasks.',
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
          try {
            const content = `[${input.type}] ${input.content}`;
            await this.client.add({
              content,
              containerTag: this.userId,
            });
            return ok({ stored: true, type: input.type });
          } catch (e: any) {
            return err({
              code: 'SUPERMEMORY_STORE_ERROR',
              message: e.message ?? 'Failed to store memory',
              retryable: true,
            });
          }
        },
      },
      {
        name: 'memory.recall',
        description: 'Recall information from persistent memory. Uses semantic search to find relevant memories. Returns the most relevant results for your query.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'What to search for in memory' },
          },
          required: ['query'],
        },
        approvalLevel: 'auto' as const,
        handler: async (input: Record<string, unknown>) => {
          try {
            const profile = await this.client.profile({
              containerTag: this.userId,
              q: input.query as string,
            });

            const results = (profile as any)?.searchResults?.results ?? [];

            if (results.length === 0) {
              return ok({ results: [], message: 'No matching memories found.' });
            }

            return ok({
              results: results.map((r: any) => ({
                content: r.content ?? r.text ?? JSON.stringify(r),
                score: r.score,
              })),
            });
          } catch (e: any) {
            return err({
              code: 'SUPERMEMORY_RECALL_ERROR',
              message: e.message ?? 'Failed to recall memory',
              retryable: true,
            });
          }
        },
      },
      {
        name: 'memory.profile',
        description: 'Get the user profile — a summary of everything known about the user from past interactions.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        approvalLevel: 'auto' as const,
        handler: async () => {
          try {
            const profile = await this.client.profile({
              containerTag: this.userId,
            });
            return ok({ profile });
          } catch (e: any) {
            return err({
              code: 'SUPERMEMORY_PROFILE_ERROR',
              message: e.message ?? 'Failed to get user profile',
              retryable: true,
            });
          }
        },
      },
    ];
  }

  async start(): Promise<void> {
    console.log('  🧠 SuperMemory connected (persistent, semantic search)');
  }

  async stop(): Promise<void> {}
}
