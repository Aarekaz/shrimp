import { z } from 'zod';
import type { Capability, Tool, LLMTool, ModelAdapter, Message, ToolUseContext, AgentTask } from '../../core/types';
import { ok, err } from '../../core/types';
import { AgentTaskManager } from '../../core/tasks';

// Always denied for sub-agents — prevents recursive spawning
const SUB_AGENT_DENIED_TOOLS = new Set(['agents.spawn', 'agents.delegate', 'agents.send', 'agents.tasks', 'agents.list']);

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
  maxIterations?: number;
}

class SubAgent {
  readonly name: string;
  readonly description: string;
  private model: ModelAdapter;
  private systemPrompt: string;
  private tools: Tool[];
  private permissions: Record<string, ToolPermission>;
  private maxIterations: number;

  constructor(config: SubAgentConfig) {
    this.name = config.name;
    this.description = config.description;
    this.model = config.model;
    this.systemPrompt = config.systemPrompt;
    this.tools = config.tools ?? [];
    this.permissions = config.permissions ?? {};
    this.maxIterations = config.maxIterations ?? 5;
  }

  filterTools(allTools: Tool[]): Tool[] {
    return allTools.filter(t => {
      // No-recurse guard: sub-agents cannot access agent tools
      if (SUB_AGENT_DENIED_TOOLS.has(t.name)) return false;
      return this.isAllowed(t.name);
    });
  }

  private isAllowed(toolName: string): boolean {
    const hasRules = Object.keys(this.permissions).length > 0;
    if (toolName in this.permissions) return this.permissions[toolName] === 'allow';
    for (const [pattern, permission] of Object.entries(this.permissions)) {
      if (pattern.endsWith('.*')) {
        const prefix = pattern.slice(0, -1);
        if (toolName.startsWith(prefix)) return permission === 'allow';
      }
    }
    return !hasRules;
  }

  async run(
    task: string,
    ctx?: ToolUseContext,
    allTools?: Tool[],
    pendingMessages?: () => string[],
    parentPromptPrefix?: string,
  ): Promise<string> {
    const tools = allTools ? this.filterTools(allTools) : this.filterTools(this.tools);
    const systemContent = parentPromptPrefix
      ? `${parentPromptPrefix}\n\n---\nSub-agent instructions:\n${this.systemPrompt}`
      : this.systemPrompt;
    const messages: Message[] = [
      { role: 'system', content: systemContent },
      { role: 'user', content: task },
    ];

    let iterations = 0;

    while (iterations < this.maxIterations) {
      iterations++;

      // Check for queued messages from parent (SendMessage)
      const pending = pendingMessages?.() ?? [];
      for (const msg of pending) {
        messages.push({ role: 'user', content: msg });
      }

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

        // Route through the same approval gate the parent uses. A sub-agent
        // must not be a way around the owner's approval policy.
        if (ctx?.gate) {
          const approval = await ctx.gate.check({
            taskId: crypto.randomUUID(),
            toolName: tool.name,
            toolInput: toolCall.input,
            description: `[sub-agent ${this.name}] ${tool.name}(${JSON.stringify(toolCall.input)})`,
            level: tool.approvalLevel,
          });
          if (approval.verdict === 'denied') {
            const reasonText = approval.reason === 'needs_user'
              ? 'requires user approval (sub-agents cannot prompt the user)'
              : 'is disabled by policy';
            messages.push({
              role: 'tool',
              content: JSON.stringify({ error: `Denied: ${tool.name} ${reasonText}.` }),
              toolCallId: toolCall.id,
            });
            continue;
          }
        } else if (tool.approvalLevel !== 'auto') {
          // No gate wired: fail closed for anything that isn't auto-approved.
          messages.push({
            role: 'tool',
            content: JSON.stringify({ error: `Denied: ${tool.name} requires an approval gate but none is configured for this sub-agent.` }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        try {
          const result = await tool.handler(toolCall.input, ctx);
          messages.push({
            role: 'tool',
            content: JSON.stringify(result.ok ? result.value : result.error),
            toolCallId: toolCall.id,
          });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          messages.push({
            role: 'tool',
            content: JSON.stringify({ error: msg.length > 200 ? msg.slice(0, 200) + '...' : msg }),
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
  description = 'Spawn, delegate to, and communicate with sub-agents';
  private agents = new Map<string, SubAgent>();
  readonly taskManager = new AgentTaskManager();

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
            name, description: agent.description,
          }));
          return ok({ title: 'Available agents', output: { agents: list } });
        },
      },
      {
        name: 'agents.spawn',
        description: 'Spawn a sub-agent in the background. Returns a task_id immediately. The agent runs async — check status with agents.tasks or send it messages with agents.send.',
        parameters: z.object({
          agent: z.string().describe('Name of the sub-agent to spawn'),
          task: z.string().describe('The task to give the sub-agent'),
        }),
        approvalLevel: 'notify' as const,
        handler: async (input: Record<string, unknown>, ctx?: ToolUseContext) => {
          const agentName = input.agent as string;
          const taskPrompt = input.task as string;
          const agent = this.agents.get(agentName);
          if (!agent) {
            return err({ code: 'AGENT_NOT_FOUND', message: `No agent "${agentName}"`, retryable: false });
          }

          const agentTask = this.taskManager.create(agentName, taskPrompt);
          this.taskManager.start(agentTask.id);

          // Get parent tools for filtering (via context registry)
          const allTools = ctx?.registry.allTools();

          const sharedPrefix = `You are a sub-agent of ${ctx?.identity.name}, working for ${ctx?.identity.owner}.`;

          // Fire and forget — runs in background
          const promise = agent.run(
            taskPrompt,
            ctx,
            allTools,
            () => this.taskManager.consumeMessages(agentTask.id),
            sharedPrefix,
          );

          promise.then(result => {
            this.taskManager.complete(agentTask.id, result);
            ctx?.bus.emit('agent-task:completed', {
              taskId: agentTask.id,
              agentName,
              result,
              durationMs: Date.now() - agentTask.startedAt.getTime(),
            });
          }).catch(e => {
            this.taskManager.fail(agentTask.id, e.message);
            ctx?.bus.emit('agent-task:failed', {
              taskId: agentTask.id,
              agentName,
              error: e.message,
            });
          });

          ctx?.bus.emit('agent-task:spawned', { taskId: agentTask.id, agentName, prompt: taskPrompt });

          return ok({
            title: `Spawned ${agentName}`,
            output: { task_id: agentTask.id, agent: agentName, status: 'running' },
          });
        },
      },
      {
        name: 'agents.delegate',
        description: 'Run a sub-agent in the foreground (blocks until complete). Use this for quick tasks. For long tasks, use agents.spawn instead.',
        parameters: z.object({
          agent: z.string().describe('Name of the sub-agent'),
          task: z.string().describe('The task description'),
        }),
        approvalLevel: 'notify' as const,
        handler: async (input: Record<string, unknown>, ctx?: ToolUseContext) => {
          const agentName = input.agent as string;
          const taskPrompt = input.task as string;
          const agent = this.agents.get(agentName);
          if (!agent) {
            return err({ code: 'AGENT_NOT_FOUND', message: `No agent "${agentName}"`, retryable: false });
          }

          const allTools = ctx?.registry.allTools();
          const sharedPrefix = `You are a sub-agent of ${ctx?.identity.name}, working for ${ctx?.identity.owner}.`;
          try {
            const result = await agent.run(taskPrompt, ctx, allTools, undefined, sharedPrefix);
            return ok({ title: `Agent: ${agentName}`, output: { agent: agentName, result } });
          } catch (e: any) {
            return err({ code: 'AGENT_ERROR', message: `Agent failed: ${e.message}`, retryable: true });
          }
        },
      },
      {
        name: 'agents.send',
        description: 'Send a message to a running background agent. The agent will receive it on its next iteration.',
        parameters: z.object({
          task_id: z.string().describe('The task_id returned by agents.spawn'),
          message: z.string().describe('The message to send to the agent'),
        }),
        approvalLevel: 'auto' as const,
        handler: async (input: Record<string, unknown>, ctx?: ToolUseContext) => {
          const taskId = input.task_id as string;
          const message = input.message as string;
          const task = this.taskManager.get(taskId);

          if (!task) {
            return err({ code: 'TASK_NOT_FOUND', message: `No task "${taskId}"`, retryable: false });
          }

          if (task.status !== 'running') {
            return ok({
              title: 'Task not running',
              output: { status: task.status, result: task.result, error: task.error },
            });
          }

          this.taskManager.queueMessage(taskId, message);
          ctx?.bus.emit('agent-task:message', { taskId, from: 'parent', message });

          return ok({ title: 'Message sent', output: { delivered: true, task_id: taskId } });
        },
      },
      {
        name: 'agents.tasks',
        description: 'List all agent tasks with their status. Shows running, completed, and failed tasks.',
        parameters: z.object({}),
        isReadOnly: true,
        approvalLevel: 'auto' as const,
        handler: async () => {
          const tasks = this.taskManager.all().map(t => ({
            id: t.id,
            agent: t.agentName,
            status: t.status,
            prompt: t.prompt.slice(0, 100),
            result: t.result?.slice(0, 200),
            error: t.error,
            duration: t.completedAt
              ? `${((t.completedAt.getTime() - t.startedAt.getTime()) / 1000).toFixed(1)}s`
              : `${((Date.now() - t.startedAt.getTime()) / 1000).toFixed(1)}s (running)`,
          }));
          return ok({
            title: `${tasks.length} task(s)`,
            output: { tasks, running: tasks.filter(t => t.status === 'running').length },
          });
        },
      },
    ];
  }

  async start(): Promise<void> {
    const count = this.agents.size;
    if (count > 0) {
      console.log(`  🤖 ${count} sub-agent(s): ${Array.from(this.agents.keys()).join(', ')}`);
    }
  }

  async stop(): Promise<void> {}
}
