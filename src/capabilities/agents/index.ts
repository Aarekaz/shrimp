import type { Capability, Tool, ModelAdapter, Message } from '../../core/types';
import { ok, err } from '../../core/types';

export interface SubAgentConfig {
  name: string;
  description: string;
  model: ModelAdapter;
  systemPrompt: string;
  tools?: Tool[];
}

class SubAgent {
  readonly name: string;
  readonly description: string;
  private model: ModelAdapter;
  private systemPrompt: string;
  private tools: Tool[];

  constructor(config: SubAgentConfig) {
    this.name = config.name;
    this.description = config.description;
    this.model = config.model;
    this.systemPrompt = config.systemPrompt;
    this.tools = config.tools ?? [];
  }

  async run(task: string): Promise<string> {
    const messages: Message[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: task },
    ];

    let iterations = 0;
    const maxIterations = 5;

    while (iterations < maxIterations) {
      iterations++;

      const response = await this.model.generate(
        messages,
        this.tools.length > 0 ? this.tools : undefined,
      );

      if (!response.toolCalls || response.toolCalls.length === 0) {
        return response.content;
      }

      messages.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls,
      });

      for (const toolCall of response.toolCalls) {
        const tool = this.tools.find(t => t.name === toolCall.name);
        if (!tool) {
          messages.push({
            role: 'tool',
            content: JSON.stringify({ error: `Unknown tool: ${toolCall.name}` }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        try {
          const result = await tool.handler(toolCall.input);
          messages.push({
            role: 'tool',
            content: JSON.stringify(result.ok ? result.value : result.error),
            toolCallId: toolCall.id,
          });
        } catch (e: any) {
          messages.push({
            role: 'tool',
            content: JSON.stringify({ error: e.message }),
            toolCallId: toolCall.id,
          });
        }
      }
    }

    return 'Sub-agent reached iteration limit.';
  }
}

export class AgentsCapability implements Capability {
  name = 'agents';
  description = 'Delegate tasks to specialized sub-agents';
  private agents = new Map<string, SubAgent>();

  addAgent(config: SubAgentConfig): void {
    this.agents.set(config.name, new SubAgent(config));
  }

  get tools(): Tool[] {
    return [
      {
        name: 'agents.list',
        description: 'List all available sub-agents and their specialties.',
        inputSchema: { type: 'object', properties: {} },
        approvalLevel: 'auto' as const,
        handler: async () => {
          const list = Array.from(this.agents.entries()).map(([name, agent]) => ({
            name,
            description: agent.description,
          }));
          return ok({ agents: list });
        },
      },
      {
        name: 'agents.delegate',
        description: 'Delegate a task to a specialized sub-agent. Use this when a task is better handled by a specialist (e.g., coding, research, writing).',
        inputSchema: {
          type: 'object',
          properties: {
            agent: {
              type: 'string',
              description: 'Name of the sub-agent to delegate to. Use agents.list to see available agents.',
            },
            task: {
              type: 'string',
              description: 'The task description to give the sub-agent. Be specific about what you need.',
            },
          },
          required: ['agent', 'task'],
        },
        approvalLevel: 'notify' as const,
        handler: async (input: Record<string, unknown>) => {
          const agentName = input.agent as string;
          const task = input.task as string;

          const agent = this.agents.get(agentName);
          if (!agent) {
            const available = Array.from(this.agents.keys()).join(', ');
            return err({
              code: 'AGENT_NOT_FOUND',
              message: `No agent named "${agentName}". Available: ${available || 'none'}`,
              retryable: false,
            });
          }

          try {
            const result = await agent.run(task);
            return ok({ agent: agentName, result });
          } catch (e: any) {
            return err({
              code: 'AGENT_ERROR',
              message: `Agent "${agentName}" failed: ${e.message}`,
              retryable: true,
            });
          }
        },
      },
    ];
  }

  async start(): Promise<void> {
    const count = this.agents.size;
    if (count > 0) {
      console.log(`  🤖 ${count} sub-agent(s) registered: ${Array.from(this.agents.keys()).join(', ')}`);
    }
  }

  async stop(): Promise<void> {}
}
