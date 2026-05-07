import { z } from 'zod';
import { Cron } from 'croner';
import type { Capability, Tool, ToolUseContext } from '../../core/types';
import { ok, err } from '../../core/types';
import { AutomationStore, type Automation } from './store';

const POLL_INTERVAL_MS = 30_000;

function newId(): string {
  return `auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nextRunFromCron(schedule: string, from: Date = new Date()): Date {
  const cron = new Cron(schedule, { timezone: 'UTC' });
  const next = cron.nextRun(from);
  if (!next) {
    throw new Error(`Cron expression "${schedule}" has no future run`);
  }
  return next;
}

export interface AutomationsCapabilityConfig {
  dbPath: string;
  pollIntervalMs?: number;
}

export class AutomationsCapability implements Capability {
  name = 'automations';
  description = 'Schedule recurring tasks that fire as sub-agents on a cron expression';
  events = ['automation:fire', 'automation:created', 'automation:deleted'];

  private store: AutomationStore;
  private pollIntervalMs: number;
  private timer?: ReturnType<typeof setInterval>;
  private ctx?: ToolUseContext;

  constructor(config: AutomationsCapabilityConfig) {
    this.store = new AutomationStore(config.dbPath);
    this.pollIntervalMs = config.pollIntervalMs ?? POLL_INTERVAL_MS;
  }

  get tools(): Tool[] {
    return [
      {
        name: 'automations.create',
        description: 'Schedule a recurring task. The schedule is a 5-field cron expression in UTC (e.g. "0 8 * * *" for daily at 08:00 UTC). The task is the prompt the sub-agent will receive each time it fires.',
        isReadOnly: false,
        approvalLevel: 'approve' as const,
        parameters: z.object({
          name: z.string().describe('Short human-readable name'),
          schedule: z.string().describe('5-field cron expression in UTC, e.g. "0 8 * * *"'),
          task: z.string().describe('Task prompt the sub-agent will execute each tick'),
        }),
        handler: async (input: Record<string, unknown>, ctx) => {
          const name = input.name as string;
          const schedule = input.schedule as string;
          const task = input.task as string;

          let nextRunAt: Date;
          try {
            nextRunAt = nextRunFromCron(schedule);
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            return err({ code: 'INVALID_CRON', message: msg, retryable: false });
          }

          const automation: Automation = {
            id: newId(),
            name,
            schedule,
            task,
            enabled: true,
            nextRunAt,
            createdAt: new Date(),
          };
          this.store.insert(automation);
          ctx?.bus.emit('automation:created', { id: automation.id, name, schedule, nextRunAt });
          return ok({
            title: `Scheduled: ${name}`,
            output: { id: automation.id, schedule, nextRunAt: nextRunAt.toISOString() },
          });
        },
      },
      {
        name: 'automations.list',
        description: 'List scheduled automations.',
        isReadOnly: true,
        approvalLevel: 'auto' as const,
        parameters: z.object({
          enabledOnly: z.boolean().optional().describe('If true, only return enabled automations'),
        }),
        handler: async (input: Record<string, unknown>) => {
          const enabledOnly = (input.enabledOnly as boolean | undefined) ?? false;
          const automations = this.store.list(enabledOnly).map(a => ({
            id: a.id,
            name: a.name,
            schedule: a.schedule,
            task: a.task,
            enabled: a.enabled,
            lastRunAt: a.lastRunAt?.toISOString() ?? null,
            nextRunAt: a.nextRunAt.toISOString(),
          }));
          return ok({ title: `${automations.length} automation(s)`, output: { automations } });
        },
      },
      {
        name: 'automations.toggle',
        description: 'Enable or disable an automation. Disabled automations stay in storage but do not fire.',
        isReadOnly: false,
        approvalLevel: 'notify' as const,
        parameters: z.object({
          id: z.string(),
          enabled: z.boolean(),
        }),
        handler: async (input: Record<string, unknown>) => {
          const id = input.id as string;
          const enabled = input.enabled as boolean;
          const ok_ = this.store.setEnabled(id, enabled);
          if (!ok_) return err({ code: 'NOT_FOUND', message: `No automation "${id}"`, retryable: false });
          return ok({ title: enabled ? 'Enabled' : 'Disabled', output: { id, enabled } });
        },
      },
      {
        name: 'automations.delete',
        description: 'Delete an automation permanently.',
        isReadOnly: false,
        approvalLevel: 'approve' as const,
        parameters: z.object({
          id: z.string(),
        }),
        handler: async (input: Record<string, unknown>, ctx) => {
          const id = input.id as string;
          const ok_ = this.store.delete(id);
          if (!ok_) return err({ code: 'NOT_FOUND', message: `No automation "${id}"`, retryable: false });
          ctx?.bus.emit('automation:deleted', { id });
          return ok({ title: 'Deleted', output: { id } });
        },
      },
    ];
  }

  async start(): Promise<void> {
    this.timer = setInterval(() => this.tick().catch(() => { /* swallow; surfaced on bus */ }), this.pollIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.store.close();
  }

  // Server wires this in so the polling tick has access to bus/registry/identity for firing.
  attachContext(ctx: ToolUseContext): void {
    this.ctx = ctx;
  }

  private async tick(): Promise<void> {
    if (!this.ctx) return;
    const now = Date.now();
    const due = this.store.due(now);
    for (const a of due) {
      try {
        const nextRunAt = nextRunFromCron(a.schedule, new Date(now + 1));
        this.store.setRun(a.id, new Date(now), nextRunAt);
        this.ctx.bus.emit('automation:fire', {
          automationId: a.id,
          name: a.name,
          task: a.task,
          firedAt: new Date(now).toISOString(),
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.ctx.bus.emit('agent:error', { message: `Automation "${a.name}" failed to schedule next run: ${msg}` });
      }
    }
  }
}
