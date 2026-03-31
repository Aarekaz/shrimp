import type { ModelAdapter, Message, Tool, ToolCall } from './types';
import type { ShrimpEventBus } from './events';
import type { CapabilityRegistry } from './registry';
import type { ApprovalGate } from './approval';

export interface AgentLoopConfig {
  bus: ShrimpEventBus;
  registry: CapabilityRegistry;
  gate: ApprovalGate;
  model: ModelAdapter;
  identity: { name: string; owner: string };
  maxIterations?: number;
  verbose?: boolean;
}

export class AgentLoop {
  private bus: ShrimpEventBus;
  private registry: CapabilityRegistry;
  private gate: ApprovalGate;
  private model: ModelAdapter;
  private identity: { name: string; owner: string };
  private maxIterations: number;
  private verbose: boolean;
  private conversationHistory: Message[] = [];

  constructor(config: AgentLoopConfig) {
    this.bus = config.bus;
    this.registry = config.registry;
    this.gate = config.gate;
    this.model = config.model;
    this.identity = config.identity;
    this.maxIterations = config.maxIterations ?? 10;
    this.verbose = config.verbose ?? false;
  }

  private log(icon: string, msg: string): void {
    if (this.verbose) {
      console.log(`  ${icon} ${msg}`);
    }
  }

  async handleMessage(userText: string): Promise<string> {
    this.conversationHistory.push({ role: 'user', content: userText });

    const systemPrompt = this.buildSystemPrompt();
    let iterations = 0;

    while (iterations < this.maxIterations) {
      iterations++;

      const messages: Message[] = [
        { role: 'system', content: systemPrompt },
        ...this.conversationHistory,
      ];

      const tools = this.registry.allToolsForLLM();
      this.log('🧠', `thinking... (iteration ${iterations}/${this.maxIterations})`);
      this.bus.emit('agent:thinking', { iteration: iterations, maxIterations: this.maxIterations });
      const response = await this.model.generate(messages, tools.length > 0 ? tools : undefined);
      this.log('📊', `tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`);

      if (!response.toolCalls || response.toolCalls.length === 0) {
        this.conversationHistory.push({ role: 'assistant', content: response.content });
        this.bus.emit('agent:response', { content: response.content, tokensIn: response.usage.inputTokens, tokensOut: response.usage.outputTokens });
        return response.content;
      }

      if (response.content) {
        this.log('💭', `thought: "${response.content}"`);
      }

      this.conversationHistory.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls,
      });

      for (const toolCall of response.toolCalls) {
        this.log('🔧', `calling ${toolCall.name}(${JSON.stringify(toolCall.input)})`);
        this.bus.emit('agent:tool-call', { toolName: toolCall.name, input: toolCall.input });
        const start = Date.now();
        const result = await this.executeTool(toolCall);
        const durationMs = Date.now() - start;
        this.log('✅', `result: ${JSON.stringify(result)}`);
        this.bus.emit('agent:tool-result', { toolName: toolCall.name, result, durationMs });
        this.conversationHistory.push({
          role: 'tool',
          content: JSON.stringify(result),
          toolCallId: toolCall.id,
        });
      }
    }

    const limitMsg = `I reached my reasoning limit (${this.maxIterations} iterations). Here's what I have so far.`;
    this.conversationHistory.push({ role: 'assistant', content: limitMsg });
    return limitMsg;
  }

  private async executeTool(toolCall: ToolCall): Promise<unknown> {
    const tool = this.registry.resolveTool(toolCall.name);

    if (!tool) {
      return { error: `Unknown tool: ${toolCall.name}` };
    }

    const approval = await this.gate.check({
      taskId: crypto.randomUUID(),
      toolName: toolCall.name,
      toolInput: toolCall.input,
      description: `${toolCall.name}(${JSON.stringify(toolCall.input)})`,
      level: tool.approvalLevel,
    });

    if (approval.verdict === 'denied') {
      return { error: `Action denied: ${toolCall.name} requires approval level that is currently disabled.` };
    }

    const input = approval.modifiedInput ?? toolCall.input;

    const parsed = tool.parameters.safeParse(input);
    if (!parsed.success) {
      return { error: `Tool ${toolCall.name} received invalid input: ${parsed.error.message}` };
    }

    try {
      const result = await tool.handler(input);
      if (result.ok) {
        return result.value.output;
      } else {
        return { error: `Tool ${toolCall.name} failed: ${result.error.message}`, retryable: result.error.retryable };
      }
    } catch (e: any) {
      return { error: `Tool ${toolCall.name} threw: ${e.message}` };
    }
  }

  private buildSystemPrompt(): string {
    const tools = this.registry.allTools();
    const toolDescriptions = tools
      .map(t => `- ${t.name}: ${t.description}`)
      .join('\n');

    return `You are ${this.identity.name}, a personal AI agent for ${this.identity.owner}.
Your owner's name is ${this.identity.owner} — you already know them. Greet them naturally, don't ask who they are.

You have access to these tools:
${toolDescriptions || '(no tools available)'}

Guidelines:
- Be concise and helpful.
- Use memory tools to store important facts your owner tells you.
- Only call memory.recall when the user asks you something you need to look up. Don't recall on every message.
- For simple greetings, just respond naturally without calling any tools.
- When you have a final answer, respond with text — don't call tools unnecessarily.`;
  }

  getHistory(): Message[] {
    return this.conversationHistory;
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }
}
