import type { CapabilityError } from './types';

export interface EventMap {
  'email:received': { id: string; from: string; subject: string; body: string; timestamp: Date };
  'email:sent': { id: string; to: string; subject: string };
  'channel:message': { channel: string; from: string; text: string; replyTo?: string };
  'browser:page-loaded': { url: string; title: string };
  'task:scheduled': { taskId: string; goal: string; runAt: Date };
  'task:completed': { taskId: string; result: string };
  'task:failed': { taskId: string; error: CapabilityError };
  'task:approval-needed': { taskId: string; question: string; options: string[] };
  'memory:fact-updated': { key: string; oldValue?: string; newValue: string };
  // Agent loop events (for dashboard)
  'agent:thinking': { iteration: number; maxIterations: number };
  'agent:tool-call': { toolName: string; input: Record<string, unknown> };
  'agent:tool-result': { toolName: string; result: unknown; durationMs: number };
  'agent:response': { content: string; tokensIn: number; tokensOut: number };
  'agent:chunk': { delta: string };
  'agent:error': { message: string };
  // Agent task lifecycle events
  'agent-task:spawned': { taskId: string; agentName: string; prompt: string };
  'agent-task:completed': { taskId: string; agentName: string; result: string; durationMs: number };
  'agent-task:failed': { taskId: string; agentName: string; error: string };
  'agent-task:message': { taskId: string; from: string; message: string };
}

type EventHandler<T> = (payload: T) => void;

export interface EventRecord {
  event: string;
  payload: any;
  timestamp: Date;
}

export class ShrimpEventBus {
  private listeners = new Map<string, Set<EventHandler<any>>>();
  private history: EventRecord[] = [];
  private maxHistory = 500;

  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  once<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
    const wrapper: EventHandler<EventMap[K]> = (payload) => {
      this.off(event, wrapper);
      handler(payload);
    };
    this.on(event, wrapper);
  }

  off<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.history.push({ event, payload, timestamp: new Date() });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(payload);
      }
    }
  }

  getHistory(): EventRecord[] {
    return this.history;
  }
}
