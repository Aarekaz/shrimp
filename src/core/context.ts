import type { Message } from './types';

export interface ContextManagerConfig {
  maxTokens: number;
  keepRecentCount?: number;
}

export class ContextManager {
  private maxTokens: number;
  private keepRecentCount: number;

  constructor(config: ContextManagerConfig) {
    this.maxTokens = config.maxTokens;
    this.keepRecentCount = config.keepRecentCount ?? 6;
  }

  estimateTokens(messages: Message[]): number {
    let chars = 0;
    for (const msg of messages) {
      chars += msg.content.length;
      if (msg.toolCalls) chars += JSON.stringify(msg.toolCalls).length;
    }
    return Math.ceil(chars / 4);
  }

  summarize(messages: Message[]): string {
    const parts: string[] = [];
    for (const msg of messages) {
      if (msg.role === 'user') {
        parts.push(`User asked: ${msg.content.slice(0, 200)}`);
      } else if (msg.role === 'assistant' && msg.content) {
        parts.push(`Agent responded: ${msg.content.slice(0, 200)}`);
      } else if (msg.role === 'assistant' && msg.toolCalls) {
        const names = msg.toolCalls.map(tc => tc.name).join(', ');
        parts.push(`Agent called tools: ${names}`);
      }
    }
    return `[Summary of earlier conversation]\n${parts.join('\n')}`;
  }

  fit(messages: Message[]): Message[] {
    if (this.estimateTokens(messages) <= this.maxTokens) {
      return messages;
    }

    // Split into older messages and the recent N we must keep intact
    const keepCount = Math.min(this.keepRecentCount, messages.length);
    const older = messages.slice(0, messages.length - keepCount);
    const recent = messages.slice(messages.length - keepCount);

    if (older.length === 0) {
      // Can't compact further — return as-is
      return messages;
    }

    const summary = this.summarize(older);
    const summaryMessage: Message = { role: 'system', content: summary };

    return [summaryMessage, ...recent];
  }
}
