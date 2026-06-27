import type { Agent } from "agents";
import type { Env } from "../env";

export type CloudMessageRole = "system" | "user" | "assistant" | "tool";

export interface CloudMessage {
  id: string;
  role: CloudMessageRole;
  content: string;
  createdAt: string;
}

export function addMessage(
  agent: Agent<Env, unknown>,
  role: CloudMessageRole,
  content: string,
): CloudMessage {
  const message: CloudMessage = {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
  };

  agent.sql`
    INSERT INTO messages (id, role, content, created_at)
    VALUES (${message.id}, ${message.role}, ${message.content}, ${message.createdAt})
  `;

  return message;
}

export function listMessages(agent: Agent<Env, unknown>, limit = 50): CloudMessage[] {
  const rows = agent.sql<{
    id: string;
    role: CloudMessageRole;
    content: string;
    created_at: string;
  }>`
    SELECT id, role, content, created_at
    FROM messages
    ORDER BY created_at ASC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    id: String(row.id),
    role: row.role,
    content: String(row.content),
    createdAt: String(row.created_at),
  }));
}
