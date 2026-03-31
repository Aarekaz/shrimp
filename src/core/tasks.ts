import type { AgentTask } from './types';

export class AgentTaskManager {
  private tasks = new Map<string, AgentTask>();
  private messageQueues = new Map<string, string[]>();

  create(agentName: string, prompt: string): AgentTask {
    const task: AgentTask = {
      id: crypto.randomUUID(),
      agentName,
      prompt,
      status: 'pending',
      startedAt: new Date(),
      tokenUsage: { input: 0, output: 0 },
    };
    this.tasks.set(task.id, task);
    this.messageQueues.set(task.id, []);
    return task;
  }

  get(id: string): AgentTask | undefined {
    return this.tasks.get(id);
  }

  start(id: string): void {
    const task = this.tasks.get(id);
    if (task) task.status = 'running';
  }

  complete(id: string, result: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = 'completed';
      task.result = result;
      task.completedAt = new Date();
    }
  }

  fail(id: string, error: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = 'failed';
      task.error = error;
      task.completedAt = new Date();
    }
  }

  running(): AgentTask[] {
    return Array.from(this.tasks.values()).filter(t => t.status === 'running');
  }

  all(): AgentTask[] {
    return Array.from(this.tasks.values());
  }

  queueMessage(id: string, message: string): void {
    const queue = this.messageQueues.get(id);
    if (queue) queue.push(message);
  }

  consumeMessages(id: string): string[] {
    const queue = this.messageQueues.get(id) ?? [];
    this.messageQueues.set(id, []);
    return queue;
  }
}
