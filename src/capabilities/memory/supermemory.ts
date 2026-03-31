import { z } from 'zod';
import Supermemory from 'supermemory';
import type { Capability, Tool } from '../../core/types';
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
        parameters: z.object({
          content: z.string().describe('The information to remember'),
          type: z.enum(['fact', 'episode', 'procedure']).describe('Type of memory'),
        }),
        approvalLevel: 'auto' as const,
        handler: async (input: Record<string, unknown>) => {
          try {
            const content = `[${input.type}] ${input.content}`;
            await this.client.add({
              content,
              containerTag: this.userId,
            });
            return ok({ title: 'Memory stored', output: { stored: true, type: input.type } });
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
        parameters: z.object({
          query: z.string().describe('What to search for'),
        }),
        approvalLevel: 'auto' as const,
        handler: async (input: Record<string, unknown>) => {
          try {
            const profile = await this.client.profile({
              containerTag: this.userId,
              q: input.query as string,
            });

            const results = (profile as any)?.searchResults?.results ?? [];

            if (results.length === 0) {
              return ok({ title: 'Memory recall', output: { results: [], message: 'No matching memories found.' } });
            }

            return ok({
              title: 'Memory recall',
              output: {
                results: results.map((r: any) => ({
                  content: r.content ?? r.text ?? JSON.stringify(r),
                  score: r.score,
                })),
              },
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
        parameters: z.object({}),
        approvalLevel: 'auto' as const,
        handler: async () => {
          try {
            const profile = await this.client.profile({
              containerTag: this.userId,
            });
            return ok({ title: 'User profile', output: { profile } });
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
