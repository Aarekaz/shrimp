import type { ZodType } from 'zod';

// --- Result type (no thrown exceptions) ---
export type Result<T, E = CapabilityError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// --- Capability Errors ---
export interface CapabilityError {
  code: string;
  message: string;
  retryable: boolean;
}

// --- Tool System ---
export type ApprovalLevel = 'auto' | 'notify' | 'approve' | 'never';

export interface ToolResult {
  title: string;
  output: unknown;
  metadata?: Record<string, unknown>;
}

export interface LLMTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface Tool {
  name: string;
  description: string;
  parameters: ZodType;
  rawInputSchema?: Record<string, unknown>;
  approvalLevel: ApprovalLevel;
  isReadOnly?: boolean;    // true = safe to run in parallel with other read-only tools
  handler: (input: Record<string, unknown>) => Promise<Result<ToolResult>>;
}

// --- Model Types ---
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ModelResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface ModelChunk {
  delta: string;
  toolCallDelta?: { id?: string; name?: string; inputDelta?: string };
}

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  role: MessageRole;
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

// --- Capability Interface ---
export interface Capability {
  name: string;
  description: string;
  tools: Tool[];
  events?: string[];
  listeners?: string[];
  start(): Promise<void>;
  stop(): Promise<void>;
}

// --- Model Adapter ---
export interface ModelAdapter {
  generate(messages: Message[], tools?: LLMTool[]): Promise<ModelResponse>;
  stream(messages: Message[], tools?: LLMTool[]): AsyncIterable<ModelChunk>;
}

// --- Channel Adapter ---
export interface IncomingMessage {
  channel: string;
  from: string;
  text: string;
  replyTo?: string;
}

export interface SendOptions {
  replyTo?: string;
  format?: 'text' | 'markdown';
}

export interface ChannelAdapter {
  name: string;
  send(message: string, options?: SendOptions): Promise<void>;
  onMessage(handler: (msg: IncomingMessage) => void): void;
}

// --- Approval ---
export interface ApprovalRequest {
  taskId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  description: string;
  level: ApprovalLevel;
  timeoutMs?: number;
}

export interface ApprovalResult {
  verdict: 'approved' | 'denied' | 'modified';
  modifiedInput?: Record<string, unknown>;
}

// --- Memory ---
export interface MemoryEntry {
  id: string;
  type: 'fact' | 'episode' | 'procedure';
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}
