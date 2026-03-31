export interface ScheduledTask {
  id: string;
  type: 'once' | 'every';
  intervalMs: number;
  description?: string;
  nextRunAt: Date;
}

export class Scheduler {
  private timers = new Map<string, ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>();
  private tasks = new Map<string, ScheduledTask>();

  once(id: string, fn: () => void, delayMs: number, description?: string): void {
    this.cancel(id);
    const timer = setTimeout(() => {
      fn();
      this.timers.delete(id);
      this.tasks.delete(id);
    }, delayMs);
    this.timers.set(id, timer);
    this.tasks.set(id, {
      id, type: 'once', intervalMs: delayMs, description,
      nextRunAt: new Date(Date.now() + delayMs),
    });
  }

  every(id: string, fn: () => void, intervalMs: number, description?: string): void {
    this.cancel(id);
    const timer = setInterval(fn, intervalMs);
    this.timers.set(id, timer);
    this.tasks.set(id, {
      id, type: 'every', intervalMs, description,
      nextRunAt: new Date(Date.now() + intervalMs),
    });
  }

  cancel(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      clearInterval(timer);
      this.timers.delete(id);
      this.tasks.delete(id);
    }
  }

  list(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  stop(): void {
    for (const [id] of this.timers) {
      this.cancel(id);
    }
  }
}
