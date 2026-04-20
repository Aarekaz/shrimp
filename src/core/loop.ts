import type { ModelAdapter, Message, ToolCall, ToolUseContext, LoopEvent } from './types';
import type { ShrimpEventBus } from './events';
import type { CapabilityRegistry } from './registry';
import type { ApprovalGate } from './approval';
import type { SessionStore } from './session';
import { ContextManager } from './context';
import { CostTracker } from './cost';

const MAX_TOOL_OUTPUT_CHARS = 50_000;
const TOOL_OUTPUT_PREVIEW_CHARS = 2_000;

export interface AgentLoopConfig {
  bus: ShrimpEventBus;
  registry: CapabilityRegistry;
  gate: ApprovalGate;
  model: ModelAdapter;
  modelName?: string;
  identity: { name: string; owner: string };
  maxIterations?: number;
  verbose?: boolean;
  sessionStore?: SessionStore;
  maxContextTokens?: number;
  coordinatorMode?: boolean;
}

export class AgentLoop {
  private bus: ShrimpEventBus;
  private registry: CapabilityRegistry;
  private gate: ApprovalGate;
  private model: ModelAdapter;
  private modelName: string;
  private identity: { name: string; owner: string };
  private maxIterations: number;
  private verbose: boolean;
  private conversationHistory: Message[] = [];
  private sessionStore?: SessionStore;
  private sessionId?: string;
  private contextManager: ContextManager;
  readonly costTracker: CostTracker;

  private coordinatorMode: boolean;

  // Memoized system prompt
  private cachedSystemPrompt: string | null = null;
  private cachedToolCount: number = -1;

  constructor(config: AgentLoopConfig) {
    this.bus = config.bus;
    this.registry = config.registry;
    this.gate = config.gate;
    this.model = config.model;
    this.modelName = config.modelName ?? 'unknown';
    this.identity = config.identity;
    this.maxIterations = config.maxIterations ?? 10;
    this.verbose = config.verbose ?? false;
    this.sessionStore = config.sessionStore;
    this.contextManager = new ContextManager({ maxTokens: config.maxContextTokens ?? 50000 });
    this.costTracker = new CostTracker();
    this.coordinatorMode = config.coordinatorMode ?? false;
    if (this.sessionStore) {
      const session = this.sessionStore.create(`Session — ${new Date().toLocaleString()}`);
      this.sessionId = session.id;
    }
  }

  // --- The single async generator that powers everything ---

  async *run(userText: string): AsyncGenerator<LoopEvent> {
    this.persistMessage({ role: 'user', content: userText });

    const systemPrompt = this.buildSystemPrompt();
    const ctx = this.buildToolContext();
    let iterations = 0;

    while (iterations < this.maxIterations) {
      iterations++;

      const fittedHistory = this.contextManager.fit(this.conversationHistory);
      const messages: Message[] = [
        { role: 'system', content: systemPrompt },
        ...fittedHistory,
      ];

      const llmTools = this.registry.allToolsForLLM();
      this.log('🧠', `thinking... (iteration ${iterations}/${this.maxIterations})`);
      yield { type: 'thinking', iteration: iterations, maxIterations: this.maxIterations };
      this.bus.emit('agent:thinking', { iteration: iterations, maxIterations: this.maxIterations });

      // Stream from model
      let content = '';
      const toolCallBuffers = new Map<number, { id: string; name: string; args: string }>();

      for await (const chunk of this.model.stream(messages, llmTools.length > 0 ? llmTools : undefined)) {
        if (chunk.delta) {
          content += chunk.delta;
          yield { type: 'chunk', delta: chunk.delta };
        }

        if (chunk.toolCallDelta) {
          const idx = 0;
          const existing = toolCallBuffers.get(idx) ?? { id: '', name: '', args: '' };
          if (chunk.toolCallDelta.id) existing.id = chunk.toolCallDelta.id;
          if (chunk.toolCallDelta.name) existing.name = chunk.toolCallDelta.name;
          if (chunk.toolCallDelta.inputDelta) existing.args += chunk.toolCallDelta.inputDelta;
          toolCallBuffers.set(idx, existing);
        }
      }

      // Estimate cost (streaming doesn't give us exact counts)
      const estimatedTokens = Math.ceil(content.length / 4);
      this.costTracker.add(this.modelName, 0, estimatedTokens);

      // Convert buffered tool calls
      const toolCalls: ToolCall[] = [];
      for (const [, buf] of toolCallBuffers) {
        if (buf.name) {
          try {
            toolCalls.push({ id: buf.id || crypto.randomUUID(), name: buf.name, input: JSON.parse(buf.args || '{}') });
          } catch {
            toolCalls.push({ id: buf.id || crypto.randomUUID(), name: buf.name, input: {} });
          }
        }
      }

      if (toolCalls.length === 0) {
        this.persistMessage({ role: 'assistant', content });
        this.bus.emit('agent:response', { content, tokensIn: 0, tokensOut: estimatedTokens });
        yield { type: 'response', content, tokensIn: 0, tokensOut: estimatedTokens };
        this.maybeLearnProcedure(userText);
        yield { type: 'done', content };
        return;
      }

      // Tool calls — persist assistant message, execute tools
      this.persistMessage({ role: 'assistant', content, toolCalls });

      // Partition and execute
      const readOnly: ToolCall[] = [];
      const writable: ToolCall[] = [];
      for (const tc of toolCalls) {
        const tool = this.registry.resolveTool(tc.name);
        if (tool?.isReadOnly) readOnly.push(tc);
        else writable.push(tc);
      }

      if (readOnly.length > 0) {
        this.log('⚡', `running ${readOnly.length} read-only tool(s) in parallel`);
        const results = await Promise.all(readOnly.map(tc => this.executeToolWithEvents(tc, ctx)));
        for (const event of results.flat()) yield event;
      }

      for (const tc of writable) {
        const events = await this.executeToolWithEvents(tc, ctx);
        for (const event of events) yield event;
      }
    }

    const limitMsg = `I reached my reasoning limit (${this.maxIterations} iterations).`;
    this.persistMessage({ role: 'assistant', content: limitMsg });
    yield { type: 'error', message: limitMsg };
    yield { type: 'done', content: limitMsg };
  }

  // --- Convenience wrappers ---

  async handleMessage(userText: string): Promise<string> {
    let finalContent = '';
    for await (const event of this.run(userText)) {
      if (event.type === 'done') {
        finalContent = event.content;
      }
    }
    return finalContent;
  }

  async *handleMessageStreaming(userText: string): AsyncGenerator<string> {
    for await (const event of this.run(userText)) {
      if (event.type === 'chunk') {
        yield event.delta;
      }
    }
  }

  // --- Tool execution ---

  private async executeToolWithEvents(toolCall: ToolCall, ctx: ToolUseContext): Promise<LoopEvent[]> {
    const events: LoopEvent[] = [];

    this.log('🔧', `calling ${toolCall.name}(${JSON.stringify(toolCall.input)})`);
    this.bus.emit('agent:tool-call', { toolName: toolCall.name, input: toolCall.input });
    events.push({ type: 'tool-call', toolName: toolCall.name, input: toolCall.input });

    const start = Date.now();
    const result = await this.executeTool(toolCall, ctx);
    const durationMs = Date.now() - start;

    this.log('✅', `result: ${JSON.stringify(result)}`);
    this.bus.emit('agent:tool-result', { toolName: toolCall.name, result, durationMs });
    events.push({ type: 'tool-result', toolName: toolCall.name, result, durationMs });

    const content = this.truncateToolOutput(result);
    this.persistMessage({ role: 'tool', content, toolCallId: toolCall.id });

    return events;
  }

  private async executeTool(toolCall: ToolCall, ctx: ToolUseContext): Promise<unknown> {
    const tool = this.registry.resolveTool(toolCall.name);

    if (!tool) {
      return { error: `Unknown tool: ${toolCall.name}` };
    }

    const approvalTaskId = crypto.randomUUID();
    const approval = await this.gate.check({
      taskId: approvalTaskId,
      toolName: toolCall.name,
      toolInput: toolCall.input,
      description: `${toolCall.name}(${JSON.stringify(toolCall.input)})`,
      level: tool.approvalLevel,
    });

    if (approval.verdict === 'denied') {
      if (approval.reason === 'needs_user') {
        this.bus.emit('task:approval-needed', {
          taskId: approvalTaskId,
          question: `Approve ${toolCall.name}(${JSON.stringify(toolCall.input)})?`,
          options: ['approve', 'deny'],
        });
        return { error: `Action denied: ${toolCall.name} requires user approval and no interactive approver is configured.` };
      }
      return { error: `Action denied: ${toolCall.name} is currently disabled.` };
    }

    const input = approval.modifiedInput ?? toolCall.input;

    const parsed = tool.parameters.safeParse(input);
    if (!parsed.success) {
      return { error: `Tool ${toolCall.name} received invalid input: ${parsed.error.message}` };
    }

    try {
      const result = await tool.handler(input, ctx);
      if (result.ok) {
        return result.value.output;
      } else {
        const msg = `${toolCall.name}: ${result.error.message}`;
        this.bus.emit('agent:error', { message: msg });
        return { error: msg, retryable: result.error.retryable };
      }
    } catch (e: unknown) {
      const { formatError } = await import('./errors');
      const err = formatError(e);
      const msg = `${toolCall.name}: ${err.message}`;
      this.bus.emit('agent:error', { message: msg });
      return { error: msg };
    }
  }

  // --- Context ---

  private buildToolContext(): ToolUseContext {
    return {
      bus: this.bus,
      registry: this.registry,
      gate: this.gate,
      model: this.model,
      identity: this.identity,
      sessionId: this.sessionId,
    };
  }

  // --- Helpers ---

  private persistMessage(message: Message): void {
    this.conversationHistory.push(message);
    if (this.sessionStore && this.sessionId) {
      this.sessionStore.addMessage(this.sessionId, message);
    }
  }

  private log(icon: string, msg: string): void {
    if (this.verbose) {
      console.log(`  ${icon} ${msg}`);
    }
  }

  private maybeLearnProcedure(userText: string): void {
    const recentAssistant = this.conversationHistory
      .filter(m => m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0);

    if (recentAssistant.length === 0) return;

    const lastTurn = recentAssistant[recentAssistant.length - 1];
    const toolNames = lastTurn.toolCalls?.map(tc => tc.name) ?? [];

    if (toolNames.length < 3) return;

    this.bus.emit('memory:fact-updated', {
      key: `procedure:${toolNames.join('→')}`,
      newValue: `When user says "${userText.slice(0, 50)}", call: ${toolNames.join(' → ')}`,
    });
  }

  private buildCoordinatorPrompt(): string {
    const tools = this.registry.allTools();
    const toolDescriptions = tools
      .map(t => `- ${t.name}: ${t.description}`)
      .join('\n');

    return `You are ${this.identity.name} in COORDINATOR mode for ${this.identity.owner}.

You are an orchestrator. You do NOT execute tasks yourself. Instead, you:
1. Break complex tasks into sub-tasks
2. Spawn background agents using agents.spawn
3. Monitor progress using agents.tasks
4. Send follow-up instructions using agents.send
5. Synthesize results when agents complete

Available tools:
${toolDescriptions}

Rules:
- ALWAYS use agents.spawn for work (background), not agents.delegate (blocking)
- Check agents.tasks to monitor what's running and what's done
- When an agent completes, synthesize its result for the user
- You can run multiple agents in parallel for speed
- Use agents.send to redirect or refine a running agent's task
- For memory operations, delegate to an agent — don't call memory tools directly`;
  }

  private buildSystemPrompt(): string {
    if (this.coordinatorMode) {
      // Don't cache coordinator prompt separately — it changes with tools too
      const currentToolCount = this.registry.allTools().length;
      if (this.cachedSystemPrompt && this.cachedToolCount === currentToolCount) {
        return this.cachedSystemPrompt;
      }
      this.cachedSystemPrompt = this.buildCoordinatorPrompt();
      this.cachedToolCount = currentToolCount;
      return this.cachedSystemPrompt;
    }

    const currentToolCount = this.registry.allTools().length;
    if (this.cachedSystemPrompt && this.cachedToolCount === currentToolCount) {
      return this.cachedSystemPrompt;
    }

    const tools = this.registry.allTools();
    const toolDescriptions = tools
      .map(t => `- ${t.name}: ${t.description}`)
      .join('\n');

    this.cachedSystemPrompt = `You are ${this.identity.name}, a personal AI agent for ${this.identity.owner}.
Your owner's name is ${this.identity.owner} — you already know them. Greet them naturally, don't ask who they are.

You have access to these tools:
${toolDescriptions || '(no tools available)'}

Guidelines:
- Be concise and helpful.
- Use memory tools to store important facts your owner tells you.
- Only call memory.recall when the user asks you something you need to look up. Don't recall on every message.
- For simple greetings, just respond naturally without calling any tools.
- When you have a final answer, respond with text — don't call tools unnecessarily.
- If a task seems familiar, check memory.procedures to see if you've learned a pattern for it.`;

    this.cachedToolCount = currentToolCount;
    return this.cachedSystemPrompt;
  }

  invalidateSystemPrompt(): void {
    this.cachedSystemPrompt = null;
    this.cachedToolCount = -1;
  }

  getSystemPrompt(): string {
    return this.buildSystemPrompt();
  }

  loadSession(sessionId: string): boolean {
    if (!this.sessionStore) return false;
    const session = this.sessionStore.get(sessionId);
    if (!session) return false;
    this.sessionId = sessionId;
    this.conversationHistory = this.sessionStore.getMessages(sessionId);
    this.invalidateSystemPrompt();
    return true;
  }

  private truncateToolOutput(output: unknown): string {
    const str = JSON.stringify(output);
    if (str.length <= MAX_TOOL_OUTPUT_CHARS) return str;

    const preview = str.slice(0, TOOL_OUTPUT_PREVIEW_CHARS);
    const lastNewline = preview.lastIndexOf('\\n');
    const cutPoint = lastNewline > TOOL_OUTPUT_PREVIEW_CHARS * 0.5 ? lastNewline : TOOL_OUTPUT_PREVIEW_CHARS;

    return `[Output truncated — ${str.length} chars, showing first ${cutPoint}]\n${str.slice(0, cutPoint)}\n...\n[Full output available in tool result]`;
  }

  getHistory(): Message[] {
    return this.conversationHistory;
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }
}
