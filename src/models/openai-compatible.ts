import type { ModelAdapter, ModelResponse, ModelChunk, Message, LLMTool, ToolCall } from '../core/types';

export interface OpenAICompatibleConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

interface OpenAIMessage {
  role: string;
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export class OpenAICompatibleAdapter implements ModelAdapter {
  constructor(private config: OpenAICompatibleConfig) {}

  async generate(messages: Message[], tools?: LLMTool[]): Promise<ModelResponse> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: messages.map(m => this.toOpenAIMessage(m)),
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));
    }

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Model API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json() as any;
    const choice = data.choices[0];
    const msg = choice.message;

    const toolCalls: ToolCall[] | undefined = msg.tool_calls?.map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments),
    }));

    return {
      content: msg.content ?? '',
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }

  async *stream(messages: Message[], tools?: LLMTool[]): AsyncIterable<ModelChunk> {
    const response = await this.generate(messages, tools);
    yield { delta: response.content };
  }

  private toOpenAIMessage(msg: Message): OpenAIMessage {
    const base: OpenAIMessage = {
      role: msg.role,
      content: msg.content,
    };

    if (msg.toolCalls) {
      base.tool_calls = msg.toolCalls.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.input) },
      }));
      base.content = msg.content || null;
    }

    if (msg.toolCallId) {
      base.tool_call_id = msg.toolCallId;
      base.role = 'tool';
    }

    return base;
  }
}
