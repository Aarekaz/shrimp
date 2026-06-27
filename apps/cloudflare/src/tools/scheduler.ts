import { z } from "zod";
import type { CloudTool } from "./index";

export function createSchedulerTools(): CloudTool[] {
  return [
    {
      name: "scheduler.remind",
      description: "Schedule a reminder after a delay in seconds.",
      parameters: z.object({
        delaySeconds: z.number(),
        message: z.string(),
      }),
      approvalLevel: "auto",
      isReadOnly: false,
      handler: async (input, agent) => {
        const delaySeconds = Number(input.delaySeconds);
        const message = String(input.message);
        const scheduler = agent as typeof agent & {
          schedule<T>(
            when: Date | string | number,
            callback: "sendReminder",
            payload?: T,
          ): Promise<unknown>;
        };
        const scheduleResult = await scheduler.schedule(delaySeconds, "sendReminder", { message });
        return { title: "Reminder scheduled", output: scheduleResult };
      },
    },
  ];
}
