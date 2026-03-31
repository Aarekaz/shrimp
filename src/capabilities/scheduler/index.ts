import { z } from 'zod';
import type { Capability, Tool } from '../../core/types';
import { ok, err } from '../../core/types';
import { Scheduler } from '../../core/scheduler';

export class SchedulerCapability implements Capability {
  name = 'scheduler';
  description = 'Schedule repeating tasks and one-time reminders';
  private scheduler = new Scheduler();

  get tools(): Tool[] {
    return [
      {
        name: 'scheduler.set',
        description: 'Schedule a repeating task. Runs at the given interval in minutes.',
        isReadOnly: false,
        parameters: z.object({
          id: z.string().describe('Unique task identifier'),
          intervalMinutes: z.number().positive().describe('How often to run, in minutes'),
          task: z.string().describe('Description of the task to perform'),
        }),
        approvalLevel: 'auto' as const,
        handler: async (input: Record<string, unknown>, ctx) => {
          const id = input.id as string;
          const intervalMinutes = input.intervalMinutes as number;
          const task = input.task as string;
          const intervalMs = intervalMinutes * 60 * 1000;

          this.scheduler.every(id, () => {
            console.log(`[scheduler] tick: ${id} — ${task}`);
            if (ctx?.bus) {
              ctx.bus.emit('task:scheduled', {
                taskId: id,
                goal: task,
                runAt: new Date(),
              });
            }
          }, intervalMs, task);

          return ok({
            title: 'Task scheduled',
            output: { id, intervalMinutes, task },
          });
        },
      },
      {
        name: 'scheduler.remind',
        description: 'Set a one-time reminder that fires after a delay.',
        isReadOnly: false,
        parameters: z.object({
          id: z.string().describe('Unique reminder identifier'),
          delayMinutes: z.number().positive().describe('How many minutes until the reminder fires'),
          message: z.string().describe('The reminder message'),
        }),
        approvalLevel: 'auto' as const,
        handler: async (input: Record<string, unknown>, ctx) => {
          const id = input.id as string;
          const delayMinutes = input.delayMinutes as number;
          const message = input.message as string;
          const delayMs = delayMinutes * 60 * 1000;

          this.scheduler.once(id, () => {
            console.log(`[scheduler] reminder: ${id} — ${message}`);
            if (ctx?.bus) {
              ctx.bus.emit('task:scheduled', {
                taskId: id,
                goal: message,
                runAt: new Date(),
              });
            }
          }, delayMs, message);

          return ok({
            title: 'Reminder set',
            output: { id, delayMinutes, message },
          });
        },
      },
      {
        name: 'scheduler.list',
        description: 'List all active scheduled tasks and reminders.',
        isReadOnly: true,
        parameters: z.object({}),
        approvalLevel: 'auto' as const,
        handler: async () => {
          const tasks = this.scheduler.list();
          return ok({
            title: 'Scheduled tasks',
            output: { tasks: tasks.map(t => ({
              id: t.id,
              type: t.type,
              description: t.description,
              intervalMs: t.intervalMs,
              nextRunAt: t.nextRunAt.toISOString(),
            })) },
          });
        },
      },
      {
        name: 'scheduler.cancel',
        description: 'Cancel a scheduled task or reminder by its ID.',
        isReadOnly: false,
        parameters: z.object({
          id: z.string().describe('The task ID to cancel'),
        }),
        approvalLevel: 'auto' as const,
        handler: async (input: Record<string, unknown>) => {
          const id = input.id as string;
          this.scheduler.cancel(id);
          return ok({ title: 'Task cancelled', output: { id, cancelled: true } });
        },
      },
    ];
  }

  async start(): Promise<void> {}

  async stop(): Promise<void> {
    this.scheduler.stop();
  }
}
