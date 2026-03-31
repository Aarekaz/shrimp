import { z } from 'zod';
import type { Capability, Tool, LLMTool, ModelAdapter, Message } from '../../core/types';
import { ok, err } from '../../core/types';

function toolToLLM(tool: Tool): LLMTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.rawInputSchema ?? { type: 'object', properties: {} },
  };
}

export type ToolPermission = 'allow' | 'deny';

export interface SubAgentConfig {
  name: string;
  description: string;
  model: ModelAdapter;
  systemPrompt: string;
  tools?: Tool[];
  permissions?: Record<string, ToolPermission>;
}

class SubAgent {
  readonly name: string;
  readonly description: string;
  private model: ModelAdapter;
  private systemPrompt: string;
  private tools: Tool[];
  private permissions: Record<string, ToolPermission>;

  constructor(config: SubAgentConfig) {
    this.name = config.name;
    this.description = config.description;
    this.model = config.model;
    this.systemPrompt = config.systemPrompt;
    this.tools = config.tools ?? [];
    this.permissions = config.permissions ?? {};
  }

  isAllowed(toolName: string): boolean {
    const hasRules = Object.keys(this.permissions).length > 0;

    // Exact match first
    if (toolName in this.permissions) {
      return this.permissions[toolName] === 'allow';
    }

    // Glob match (e.g. 'computer.*')
    for (const [pattern, permission] of Object.entries(this.permissions)) {
      if (pattern.endsWith('.*')) {
        const prefix = pattern.slice(0, -1); // 'computer.'
        if (toolName.startsWith(prefix)) {
          return permission === 'allow';
        }
      }
    }

    // Default: deny if rules exist but no match; allow if no rules
    return !hasRules;
  }

  filterTools(allTools: Tool[]): Tool[] {
    return allTools.filter(t => this.isAllowed(t.name));
  }

  async run(task: string, allTools?: Tool[]): Promise<string> {
    const tools = allTools ? this.filterTools(allTools) : this.filterTools(this.tools);
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
        tools.length > 0 ? tools.map(toolToLLM) : undefined,
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
        const tool = tools.find(t => t.name === toolCall.name);
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
        parameters: z.object({}),
        isReadOnly: true,
        approvalLevel: 'auto' as const,
        handler: async () => {
          const list = Array.from(this.agents.entries()).map(([name, agent]) => ({
            name,
            description: agent.description,
          }));
          return ok({ title: 'Available agents', output: { agents: list } });
        },
      },
      {
        name: 'agents.delegate',
        description: 'Delegate a task to a specialized sub-agent. Use this when a task is better handled by a specialist (e.g., coding, research, writing).',
        parameters: z.object({
          agent: z.string().describe('Name of the sub-agent to delegate to. Use agents.list to see available agents.'),
          task: z.string().describe('The task description to give the sub-agent. Be specific about what you need.'),
        }),
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
            return ok({ title: `Agent: ${agentName}`, output: { agent: agentName, result } });
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
