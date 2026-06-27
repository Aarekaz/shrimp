import type { CloudTool } from "./index";
import { createApprovalTools } from "./approvals";
import { createHttpTools } from "./http";
import { createMemoryTools } from "./memory";
import { createSchedulerTools } from "./scheduler";

export function allCloudTools(): CloudTool[] {
  return [
    ...createMemoryTools(),
    ...createHttpTools(),
    ...createSchedulerTools(),
    ...createApprovalTools(),
  ];
}

export function resolveCloudTool(name: string): CloudTool | undefined {
  return allCloudTools().find((tool) => tool.name === name);
}
