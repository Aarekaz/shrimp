import type { ModelAdapter, ModelResponse, ModelChunk, Message, LLMTool, ToolCall } from '../core/types';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 5000, 10000]; // ms

export interface OpenAICompatibleConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

function parseErrorMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body);
    const msg = parsed?.error?.message ?? parsed?.message ?? '';
    if (status === 429) {
      // Extract retry time if present
      const retryMatch = msg.match(/retry in (\d+\.?\d*)/i);
      const retryTime = retryMatch ? retryMatch[1] + 's' : 'a moment';
      return `Rate limited (429). Retrying in ${retryTime}...`;
    }
    if (status === 401 || status === 403) return `Authentication failed. Check your API key.`;
    if (status === 404) return `Model not found: check your model name.`;
    if (status >= 500) return `Server error (${status}). The provider may be having issues.`;
    return msg || `API error ${status}`;
  } catch {
    return `API error ${status}`;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const friendlyMsg = parseErrorMessage(response.status, errorBody);

        // Retry on rate limits and server errors
        if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
          const delay = RETRY_DELAYS[attempt] ?? 10000;
          console.log(`  ⏳ ${friendlyMsg} Retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await sleep(delay);
          continue;
        }

        throw new Error(friendlyMsg);
      }

      const data = await response.json() as any;
      const choice = data.choices?.[0];
      if (!choice) {
        throw new Error('Model returned empty response — no choices.');
      }

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

    throw new Error('Max retries exceeded. The model provider may be down.');
  }

  async *stream(messages: Message[], tools?: LLMTool[]): AsyncIterable<ModelChunk> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: messages.map(m => this.toOpenAIMessage(m)),
      stream: true,
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

    let response: Response | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        const friendlyMsg = parseErrorMessage(res.status, errorBody);

        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          const delay = RETRY_DELAYS[attempt] ?? 10000;
          console.log(`  ⏳ ${friendlyMsg} Retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await sleep(delay);
          continue;
        }

        throw new Error(friendlyMsg);
      }

      response = res;
      break;
    }

    if (!response) {
      throw new Error('Max retries exceeded.');
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body for streaming');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          const chunk: ModelChunk = { delta: delta.content ?? '' };

          if (delta.tool_calls) {
            const tc = delta.tool_calls[0];
            chunk.toolCallDelta = {
              id: tc.id,
              name: tc.function?.name,
              inputDelta: tc.function?.arguments,
            };
          }

          yield chunk;
        } catch {
          // skip unparseable lines
        }
      }
    }
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
