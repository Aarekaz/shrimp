import type { Agent } from "agents";
import type { Env } from "../env";

export type CloudMemoryType = "fact" | "episode" | "procedure";

export interface CloudMemory {
  id: string;
  type: CloudMemoryType;
  content: string;
  createdAt: string;
}

export function storeMemory(
  agent: Agent<Env, unknown>,
  type: CloudMemoryType,
  content: string,
): CloudMemory {
  const memory: CloudMemory = {
    id: crypto.randomUUID(),
    type,
    content,
    createdAt: new Date().toISOString(),
  };

  agent.sql`
    INSERT INTO memories (id, type, content, created_at)
    VALUES (${memory.id}, ${memory.type}, ${memory.content}, ${memory.createdAt})
  `;

  return memory;
}

export function recallMemories(
  agent: Agent<Env, unknown>,
  query: string,
  limit = 8,
): CloudMemory[] {
  const pattern = `%${query}%`;
  const rows = agent.sql<{
    id: string;
    type: CloudMemoryType;
    content: string;
    created_at: string;
  }>`
    SELECT id, type, content, created_at
    FROM memories
    WHERE content LIKE ${pattern}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    id: String(row.id),
    type: row.type,
    content: String(row.content),
    createdAt: String(row.created_at),
  }));
}
