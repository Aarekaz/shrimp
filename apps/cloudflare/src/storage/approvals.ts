import type { Agent } from "agents";
import type { Env } from "../env";

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";

export interface PendingApproval {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  status: ApprovalStatus;
  createdAt: string;
  resolvedAt?: string;
}

export function createApproval(
  agent: Agent<Env, unknown>,
  toolName: string,
  input: Record<string, unknown>,
): PendingApproval {
  const approval: PendingApproval = {
    id: crypto.randomUUID(),
    toolName,
    input,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  agent.sql`
    INSERT INTO approvals (id, tool_name, input_json, status, created_at)
    VALUES (${approval.id}, ${approval.toolName}, ${JSON.stringify(approval.input)}, ${approval.status}, ${approval.createdAt})
  `;

  return approval;
}

export function resolveApproval(
  agent: Agent<Env, unknown>,
  id: string,
  status: "approved" | "denied",
): boolean {
  const resolvedAt = new Date().toISOString();
  const pending = agent.sql<{ id: string }>`
    SELECT id
    FROM approvals
    WHERE id = ${id} AND status = 'pending'
    LIMIT 1
  `;

  if (pending.length === 0) return false;

  agent.sql`
    UPDATE approvals
    SET status = ${status}, resolved_at = ${resolvedAt}
    WHERE id = ${id} AND status = 'pending'
  `;

  return true;
}

export function listApprovals(agent: Agent<Env, unknown>): PendingApproval[] {
  const rows = agent.sql<{
    id: string;
    tool_name: string;
    input_json: string;
    status: ApprovalStatus;
    created_at: string;
    resolved_at?: string;
  }>`
    SELECT id, tool_name, input_json, status, created_at, resolved_at
    FROM approvals
    ORDER BY created_at DESC
    LIMIT 50
  `;

  return rows.map((row) => ({
    id: String(row.id),
    toolName: String(row.tool_name),
    input: JSON.parse(String(row.input_json)) as Record<string, unknown>,
    status: row.status,
    createdAt: String(row.created_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : undefined,
  }));
}
