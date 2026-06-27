import { z } from "zod";
import { listApprovals, resolveApproval } from "../storage/approvals";
import type { CloudTool } from "./index";

export function createApprovalTools(): CloudTool[] {
  return [
    {
      name: "approvals.list",
      description: "List recent approval requests.",
      parameters: z.object({}),
      approvalLevel: "auto",
      isReadOnly: true,
      handler: async (_input, agent) => {
        return { title: "Approvals", output: { approvals: listApprovals(agent) } };
      },
    },
    {
      name: "approvals.resolve",
      description: "Approve or deny a pending tool request.",
      parameters: z.object({
        id: z.string(),
        decision: z.enum(["approved", "denied"]),
      }),
      approvalLevel: "auto",
      isReadOnly: false,
      handler: async (input, agent) => {
        const resolved = resolveApproval(
          agent,
          String(input.id),
          input.decision as "approved" | "denied",
        );
        return { title: "Approval resolved", output: { resolved } };
      },
    },
  ];
}
