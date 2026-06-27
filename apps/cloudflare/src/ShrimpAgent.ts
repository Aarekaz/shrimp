import { Agent } from "agents";
import type { Env } from "./env";
import { generateWithWorkersAI } from "./model/workers-ai";
import { addMessage, listMessages } from "./storage/messages";
import { ensureSchema } from "./storage/schema";
import { resolveCloudTool } from "./tools/registry";

export interface ShrimpAgentState {
  createdAt: string;
  schemaReady: boolean;
}

export class ShrimpAgent extends Agent<Env, ShrimpAgentState> {
  initialState: ShrimpAgentState = {
    createdAt: new Date().toISOString(),
    schemaReady: false,
  };

  async onStart(): Promise<void> {
    await ensureSchema(this);
    if (!this.state.schemaReady) {
      this.setState({ ...this.state, schemaReady: true });
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname.endsWith("/chat") && request.method === "POST") {
        const body = await request.json<{ message?: string }>();
        if (!body.message || typeof body.message !== "string") {
          return Response.json({ error: "message is required" }, { status: 400 });
        }
        const reply = await this.runChatTurn(body.message);
        return Response.json({ reply });
      }

      if (url.pathname.endsWith("/history")) {
        return Response.json({ messages: listMessages(this, 100) });
      }

      return Response.json({ error: "Not found" }, { status: 404 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Response.json({ error: message }, { status: 500 });
    }
  }

  async sendReminder(payload: { message: string }): Promise<void> {
    await ensureSchema(this);
    addMessage(this, "assistant", `Reminder: ${payload.message}`);
  }

  private async runChatTurn(userMessage: string): Promise<string> {
    await ensureSchema(this);
    addMessage(this, "user", userMessage);

    const commandResult = await this.runCommand(userMessage);
    if (commandResult !== undefined) {
      addMessage(this, "assistant", commandResult);
      return commandResult;
    }

    const maxHistory = this.env.SHRIMP_FREE_MODE === "true" ? 30 : 80;
    const history = listMessages(this, maxHistory);
    const messages = [
      {
        role: "system" as const,
        content: `You are Shrimp, a hosted personal AI agent for ${this.env.SHRIMP_OWNER}. Be concise and useful.`,
      },
      ...history
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({
          role: message.role as "user" | "assistant",
          content: message.content,
        })),
    ];

    const result = await generateWithWorkersAI(this.env.AI, this.env.SHRIMP_MODEL, messages);
    addMessage(this, "assistant", result.text);
    return result.text;
  }

  private async runCommand(userMessage: string): Promise<string | undefined> {
    const [command, ...rest] = userMessage.trim().split(/\s+/);
    const text = rest.join(" ");

    if (command === "/remember") {
      const [rawType, ...contentParts] = rest;
      const type = rawType === "episode" || rawType === "procedure" ? rawType : "fact";
      const content = type === rawType ? contentParts.join(" ") : rest.join(" ");
      const tool = resolveCloudTool("memory.store");
      if (!tool) return "memory.store is unavailable.";
      const result = await tool.handler({ type, content }, this);
      return JSON.stringify(result.output, null, 2);
    }

    if (command === "/recall") {
      const tool = resolveCloudTool("memory.recall");
      if (!tool) return "memory.recall is unavailable.";
      const result = await tool.handler({ query: text }, this);
      return JSON.stringify(result.output, null, 2);
    }

    if (command === "/fetch") {
      const tool = resolveCloudTool("http.fetch");
      if (!tool) return "http.fetch is unavailable.";
      const result = await tool.handler({ url: text }, this);
      return JSON.stringify(result.output, null, 2);
    }

    if (command === "/remind") {
      const [delayRaw, ...messageParts] = rest;
      const delaySeconds = Number(delayRaw);
      if (!Number.isFinite(delaySeconds) || delaySeconds < 1) {
        return "Usage: /remind 5 Check this later";
      }
      const tool = resolveCloudTool("scheduler.remind");
      if (!tool) return "scheduler.remind is unavailable.";
      const result = await tool.handler({ delaySeconds, message: messageParts.join(" ") }, this);
      return JSON.stringify(result.output, null, 2);
    }

    if (command === "/approvals") {
      const tool = resolveCloudTool("approvals.list");
      if (!tool) return "approvals.list is unavailable.";
      const result = await tool.handler({}, this);
      return JSON.stringify(result.output, null, 2);
    }

    return undefined;
  }
}
