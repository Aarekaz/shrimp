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
}

type EventHandler<T> = (payload: T) => void;

export class ShrimpEventBus {
  private listeners = new Map<string, Set<EventHandler<any>>>();

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
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(payload);
      }
    }
  }
}
