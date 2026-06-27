import { z } from "zod";
import { recallMemories, storeMemory } from "../storage/memories";
import type { CloudTool } from "./index";

export function createMemoryTools(): CloudTool[] {
  return [
    {
      name: "memory.store",
      description: "Store a fact, episode, or procedure in persistent memory.",
      parameters: z.object({
        type: z.enum(["fact", "episode", "procedure"]),
        content: z.string(),
      }),
      approvalLevel: "auto",
      isReadOnly: false,
      handler: async (input, agent) => {
        const memory = storeMemory(
          agent,
          input.type as "fact" | "episode" | "procedure",
          String(input.content),
        );
        return { title: "Memory stored", output: { id: memory.id } };
      },
    },
    {
      name: "memory.recall",
      description: "Recall matching memories.",
      parameters: z.object({
        query: z.string(),
      }),
      approvalLevel: "auto",
      isReadOnly: true,
      handler: async (input, agent) => {
        const results = recallMemories(agent, String(input.query));
        return { title: "Memory recall", output: { results } };
      },
    },
  ];
}
