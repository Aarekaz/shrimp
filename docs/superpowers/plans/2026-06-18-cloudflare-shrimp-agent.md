# Cloudflare Shrimp Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Cloudflare-native Shrimp target that runs as a hosted, low-cost personal agent while preserving Shrimp's identity as the harness: tools, memory, approvals, sessions, events, and runtime adapters around any model.

**Architecture:** Add `apps/cloudflare` as a separate Cloudflare Agents SDK app instead of bending the current Bun app into a hybrid runtime. The first Cloudflare target uses Agents SDK/Durable Objects/Workers AI directly, borrows design lessons from Think and Flue, and extracts shared Shrimp contracts only after the MVP proves which code is truly portable. The local Bun app remains working throughout.

**Tech Stack:** Cloudflare Agents SDK, Durable Object SQLite, Workers AI, Wrangler, TypeScript, Vite or minimal static UI, WebSockets or Cloudflare Agent Chat protocol, Bun tests for local core, Vitest or Wrangler test harness for Cloudflare app.

---

## Source Context

Current Shrimp runtime:

- `src/server.ts` wires Bun runtime, local SQLite sessions/memory, capabilities, dashboard, and `Bun.serve`.
- `src/core/loop.ts`, `src/core/registry.ts`, `src/core/approval.ts`, `src/core/types.ts`, and `src/core/events.ts` contain the reusable harness concepts.
- `src/capabilities/memory/sqlite-store.ts`, `src/core/session.ts`, and `src/capabilities/automations/store.ts` depend on `bun:sqlite`.
- `src/capabilities/channels/cli.ts` depends on `node:readline`.
- `src/capabilities/browser/index.ts` depends on Playwright/local browser assumptions.
- Existing product gap: approval concepts exist, but the current local dashboard does not yet provide a complete interactive approval surface.

Cloudflare facts verified on June 18, 2026:

- Cloudflare Agents are composed of communication channels, a harness, the Agents SDK runtime, tools, and observability.
- Agents SDK provides durable identity, state, local SQL, WebSockets, scheduling, fibers, and recovery.
- Cloudflare's docs explicitly say you can use Project Think for an opinionated harness or build your own loop on the Agents SDK runtime.
- Think is useful reference material, but it is an opinionated complete harness.
- Flue is a higher-level framework above a harness; adopting it wholesale would make Shrimp less distinct.
- Workflow approval is the right pattern for long-running approval gates; MCP elicitation is the right pattern when an MCP server needs structured user input during a tool call.
- Agents alone are recommended for chat, quick API calls, real-time collaborative features, and tasks under about 30 seconds; Agents plus Workflows are recommended for report generation, guaranteed delivery, long waits, and approval flows.

## Product Position

Shrimp should become:

```text
Shrimp core: runtime-neutral harness contracts
Local Shrimp: Bun runtime adapter
Cloudflare Shrimp: Agents SDK runtime adapter
```

Do not make Shrimp a Flue wrapper in the first implementation. Use Flue as a design reference for durable event logs, framework DX, channels, and Cloudflare target shape.

Do not adopt Think as the core implementation in the first implementation. Use Think as a reference for memory, streaming, tool approval, sub-agent RPC, durable recovery, and client protocol.

Do use Agents SDK directly for the first Cloudflare target so Shrimp owns the harness behavior.

## Use Case Matrix

| Use Case | MVP | Later | Implementation Notes |
| --- | --- | --- | --- |
| Hosted personal chat | Yes | Improve UI | One durable agent instance per user/session |
| Free/default model | Yes | Add model picker | Workers AI first; external providers optional |
| Persistent message history | Yes | Branching/compaction | Durable Object SQLite |
| Persistent memory | Yes | Search/ranking | Durable Object SQLite table |
| Store/recall facts | Yes | Semantic memory | `memory.store`, `memory.recall` |
| Approval for risky actions | Yes | Workflow approvals | In-agent approval for short waits, Workflows for long waits |
| Tool activity feed | Yes | Full observability | Persist tool events and stream to UI |
| HTTP fetch tool | Yes | Authenticated connectors | Restrict private IPs/internal URLs |
| Reminders/schedules | Yes | Recurring automations | Agents SDK scheduling |
| Long background jobs | No | Yes | Cloudflare Workflows |
| Sub-agents | No | Yes | Agent-to-agent RPC or multiple DO instances |
| MCP client | No | Yes | Remote MCP only; no stdio MCP on Workers |
| Browser automation | No | Yes | Cloudflare Browser tool, not Playwright |
| Code execution/sandbox | No | Yes | Cloudflare Sandbox/Code Mode, approval-gated |
| Local computer control | No | No hosted support | Keep local-only |
| Composio | No | Maybe | Requires compatible HTTP APIs and secret handling |
| Voice/email/Slack | No | Yes | Cloudflare channels after chat works |
| Public/shared access | Minimal | Yes | Add access token or Cloudflare Access before sharing |
| Cost guardrails | Yes | Better quotas | Free-mode model and iteration limits |
| Recovery after interruption | Basic | Fibers/event replay | Persist messages/tool events before execution |
| agents.cloudflare.com visibility | Maybe | Yes | Use standard Agents SDK conventions and Wrangler deploy |

## Target Repository Shape

```text
apps/
  cloudflare/
    package.json
    wrangler.jsonc
    tsconfig.json
    src/
      index.ts
      env.ts
      ShrimpAgent.ts
      protocol.ts
      model/
        workers-ai.ts
        openai-compatible.ts
      storage/
        schema.ts
        messages.ts
        memories.ts
        approvals.ts
        tool-events.ts
      tools/
        index.ts
        memory.ts
        http.ts
        scheduler.ts
        approvals.ts
      ui/
        index.html
        app.ts
        styles.css
    tests/
      tools.test.ts
      storage.test.ts
      agent.test.ts
docs/
  CLOUDFLARE.md
```

Do not refactor the root app into workspaces in the first PR unless package management forces it. Keep Cloudflare dependencies isolated in `apps/cloudflare/package.json`.

## Runtime Mapping

| Local Shrimp | Cloudflare Shrimp |
| --- | --- |
| `Bun.serve` | Worker `fetch` + `routeAgentRequest` |
| Hono dashboard | Static UI + Agent WebSocket/HTTP endpoints |
| `bun:sqlite` files | Durable Object SQLite |
| `SessionStore` | messages table per agent instance |
| `SQLiteMemoryStore` | memories table per agent instance |
| `SchedulerCapability` timers | Agents SDK `schedule()` |
| `AutomationsCapability` polling | Agents schedules first, Workflows later |
| `OpenAICompatibleAdapter` | Workers AI adapter first, OpenAI-compatible optional |
| Playwright browser | Cloudflare Browser tool later |
| stdio MCP | remote MCP client later |
| CLI | local-only for now |

## Phase 0: Cloudflare Spike And Decision Lock

### Task 0.1: Add Cloudflare Architecture Decision Record

**Files:**
- Create: `docs/CLOUDFLARE.md`

- [ ] **Step 1: Create `docs/CLOUDFLARE.md`**

Write this initial content:

```markdown
# Shrimp on Cloudflare

Shrimp supports two runtimes:

- Local runtime: Bun, local SQLite, CLI, local dashboard, local browser/computer integrations.
- Cloudflare runtime: Agents SDK, Durable Object SQLite, Workers AI, WebSockets, platform scheduling.

The Cloudflare target is not a direct deployment of the local Bun server. It is a runtime adapter for the same product concepts: chat, tools, memory, approvals, sessions, and events.

## Architecture Decision

Shrimp owns the harness semantics. Cloudflare provides durable runtime primitives.

We will use Agents SDK directly for the first target. Project Think and Flue are references, not core dependencies for the MVP.

## MVP Use Cases

- Hosted personal chat
- Workers AI by default
- Persistent messages
- Persistent memory
- Tool activity feed
- Approval-gated tool execution
- HTTP fetch tool
- Scheduled reminders

## Explicit Non-MVP Items

- Local computer control
- Playwright browser control
- stdio MCP
- Composio
- Sub-agents
- Voice, Slack, email
- Long-running report workflows

## Free Mode

Free mode uses Workers AI and keeps tool/model usage bounded. It should fail closed when limits are reached.
```

- [ ] **Step 2: Commit**

```bash
git add docs/CLOUDFLARE.md
git commit -m "docs: define Cloudflare target architecture"
```

### Task 0.2: Create Cloudflare App Skeleton

**Files:**
- Create: `apps/cloudflare/package.json`
- Create: `apps/cloudflare/tsconfig.json`
- Create: `apps/cloudflare/wrangler.jsonc`
- Create: `apps/cloudflare/src/index.ts`
- Create: `apps/cloudflare/src/env.ts`

- [ ] **Step 1: Create package file**

Create `apps/cloudflare/package.json`:

```json
{
  "name": "@shrimp/cloudflare",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev --port 8787",
    "deploy": "wrangler deploy",
    "dry-run": "wrangler deploy --dry-run",
    "types": "wrangler types ./src/worker-configuration.d.ts",
    "typecheck": "tsc --noEmit",
    "check": "npm run types && npm run typecheck && npm run dry-run"
  },
  "dependencies": {
    "agents": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "typescript": "latest",
    "wrangler": "latest"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Create `apps/cloudflare/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "types": ["@cloudflare/workers-types"],
    "allowJs": false,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Create Wrangler config**

Create `apps/cloudflare/wrangler.jsonc`:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "shrimp-agent",
  "main": "src/index.ts",
  "compatibility_date": "2026-06-18",
  "compatibility_flags": ["nodejs_compat"],
  "ai": {
    "binding": "AI"
  },
  "durable_objects": {
    "bindings": [
      {
        "name": "SHRIMP_AGENT",
        "class_name": "ShrimpAgent"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["ShrimpAgent"]
    }
  ],
  "vars": {
    "SHRIMP_MODEL": "@cf/meta/llama-3.1-8b-instruct",
    "SHRIMP_OWNER": "user",
    "SHRIMP_MAX_ITERATIONS": "6",
    "SHRIMP_FREE_MODE": "true"
  }
}
```

- [ ] **Step 4: Create environment types**

Create `apps/cloudflare/src/env.ts`:

```ts
export interface Env {
  AI: Ai;
  SHRIMP_AGENT: DurableObjectNamespace;
  SHRIMP_MODEL: string;
  SHRIMP_OWNER: string;
  SHRIMP_MAX_ITERATIONS: string;
  SHRIMP_FREE_MODE: string;
}
```

- [ ] **Step 5: Create temporary Worker entrypoint**

Create `apps/cloudflare/src/index.ts`:

```ts
import { routeAgentRequest } from "agents";
import type { Env } from "./env";
import { ShrimpAgent } from "./ShrimpAgent";

export { ShrimpAgent };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const agentResponse = await routeAgentRequest(request, env, { cors: true });
    if (agentResponse) return agentResponse;

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "shrimp-agent" });
    }

    return new Response("Shrimp Agent", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
```

- [ ] **Step 6: Add temporary `ShrimpAgent` stub**

Create `apps/cloudflare/src/ShrimpAgent.ts`:

```ts
import { Agent } from "agents";
import type { Env } from "./env";

export interface ShrimpAgentState {
  createdAt: string;
}

export class ShrimpAgent extends Agent<Env, ShrimpAgentState> {
  initialState: ShrimpAgentState = {
    createdAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 7: Install and verify**

Run:

```bash
cd apps/cloudflare
npm install
npm run check
```

Expected:

```text
wrangler types succeeds
tsc succeeds
wrangler deploy --dry-run succeeds
```

- [ ] **Step 8: Commit**

```bash
git add apps/cloudflare
git commit -m "feat: add Cloudflare Shrimp app skeleton"
```

## Phase 1: Cloudflare Storage Contract

### Task 1.1: Add Durable Object SQL Schema

**Files:**
- Create: `apps/cloudflare/src/storage/schema.ts`
- Modify: `apps/cloudflare/src/ShrimpAgent.ts`

- [ ] **Step 1: Create schema helper**

Create `apps/cloudflare/src/storage/schema.ts`:

```ts
import type { Agent } from "agents";
import type { Env } from "../env";

export async function ensureSchema(agent: Agent<Env, unknown>): Promise<void> {
  await agent.sql`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `;

  await agent.sql`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `;

  await agent.sql`
    CREATE TABLE IF NOT EXISTS tool_events (
      id TEXT PRIMARY KEY,
      tool_name TEXT NOT NULL,
      input_json TEXT NOT NULL,
      output_json TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `;

  await agent.sql`
    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      tool_name TEXT NOT NULL,
      input_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    )
  `;
}
```

- [ ] **Step 2: Call schema from `ShrimpAgent.onStart`**

Update `apps/cloudflare/src/ShrimpAgent.ts`:

```ts
import { Agent } from "agents";
import type { Env } from "./env";
import { ensureSchema } from "./storage/schema";

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
}
```

- [ ] **Step 3: Verify locally**

Run:

```bash
cd apps/cloudflare
npm run check
```

- [ ] **Step 4: Commit**

```bash
git add apps/cloudflare/src/storage/schema.ts apps/cloudflare/src/ShrimpAgent.ts
git commit -m "feat: initialize Cloudflare Shrimp storage schema"
```

### Task 1.2: Add Message And Memory Stores

**Files:**
- Create: `apps/cloudflare/src/storage/messages.ts`
- Create: `apps/cloudflare/src/storage/memories.ts`

- [ ] **Step 1: Create message store**

Create `apps/cloudflare/src/storage/messages.ts`:

```ts
import type { Agent } from "agents";
import type { Env } from "../env";

export type CloudMessageRole = "system" | "user" | "assistant" | "tool";

export interface CloudMessage {
  id: string;
  role: CloudMessageRole;
  content: string;
  createdAt: string;
}

export async function addMessage(agent: Agent<Env, unknown>, role: CloudMessageRole, content: string): Promise<CloudMessage> {
  const message: CloudMessage = {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
  };

  await agent.sql`
    INSERT INTO messages (id, role, content, created_at)
    VALUES (${message.id}, ${message.role}, ${message.content}, ${message.createdAt})
  `;

  return message;
}

export async function listMessages(agent: Agent<Env, unknown>, limit = 50): Promise<CloudMessage[]> {
  const rows = await agent.sql`
    SELECT id, role, content, created_at
    FROM messages
    ORDER BY created_at ASC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    id: String(row.id),
    role: row.role as CloudMessageRole,
    content: String(row.content),
    createdAt: String(row.created_at),
  }));
}
```

- [ ] **Step 2: Create memory store**

Create `apps/cloudflare/src/storage/memories.ts`:

```ts
import type { Agent } from "agents";
import type { Env } from "../env";

export type CloudMemoryType = "fact" | "episode" | "procedure";

export interface CloudMemory {
  id: string;
  type: CloudMemoryType;
  content: string;
  createdAt: string;
}

export async function storeMemory(agent: Agent<Env, unknown>, type: CloudMemoryType, content: string): Promise<CloudMemory> {
  const memory: CloudMemory = {
    id: crypto.randomUUID(),
    type,
    content,
    createdAt: new Date().toISOString(),
  };

  await agent.sql`
    INSERT INTO memories (id, type, content, created_at)
    VALUES (${memory.id}, ${memory.type}, ${memory.content}, ${memory.createdAt})
  `;

  return memory;
}

export async function recallMemories(agent: Agent<Env, unknown>, query: string, limit = 8): Promise<CloudMemory[]> {
  const pattern = `%${query}%`;
  const rows = await agent.sql`
    SELECT id, type, content, created_at
    FROM memories
    WHERE content LIKE ${pattern}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    id: String(row.id),
    type: row.type as CloudMemoryType,
    content: String(row.content),
    createdAt: String(row.created_at),
  }));
}
```

- [ ] **Step 3: Verify**

```bash
cd apps/cloudflare
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/cloudflare/src/storage/messages.ts apps/cloudflare/src/storage/memories.ts
git commit -m "feat: add Cloudflare message and memory stores"
```

## Phase 2: Model Adapter And Harness MVP

### Task 2.1: Add Workers AI Adapter

**Files:**
- Create: `apps/cloudflare/src/model/workers-ai.ts`

- [ ] **Step 1: Create model adapter**

Create `apps/cloudflare/src/model/workers-ai.ts`:

```ts
export interface WorkersAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface WorkersAITextResult {
  text: string;
}

export async function generateWithWorkersAI(ai: Ai, model: string, messages: WorkersAIMessage[]): Promise<WorkersAITextResult> {
  const result = await ai.run(model, { messages });
  const output = result as { response?: string; text?: string };
  return { text: output.response ?? output.text ?? "" };
}
```

- [ ] **Step 2: Verify**

```bash
cd apps/cloudflare
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/cloudflare/src/model/workers-ai.ts
git commit -m "feat: add Workers AI model adapter"
```

### Task 2.2: Add Minimal Chat Turn

**Files:**
- Modify: `apps/cloudflare/src/ShrimpAgent.ts`
- Modify: `apps/cloudflare/src/index.ts`

- [ ] **Step 1: Add HTTP chat route helper in Worker**

Modify `apps/cloudflare/src/index.ts` so `/api/agent/:name/chat` forwards to the named Durable Object:

```ts
const chatMatch = url.pathname.match(/^\/api\/agent\/([^/]+)\/chat$/);
if (chatMatch && request.method === "POST") {
  const id = env.SHRIMP_AGENT.idFromName(chatMatch[1]);
  const stub = env.SHRIMP_AGENT.get(id);
  return stub.fetch(request);
}
```

Place this before the fallback response.

- [ ] **Step 2: Add `fetch` handler to `ShrimpAgent`**

Update `apps/cloudflare/src/ShrimpAgent.ts`:

```ts
import { Agent } from "agents";
import type { Env } from "./env";
import { generateWithWorkersAI } from "./model/workers-ai";
import { addMessage, listMessages } from "./storage/messages";
import { ensureSchema } from "./storage/schema";

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
    if (url.pathname.endsWith("/chat") && request.method === "POST") {
      const body = await request.json<{ message?: string }>();
      if (!body.message || typeof body.message !== "string") {
        return Response.json({ error: "message is required" }, { status: 400 });
      }
      const reply = await this.runChatTurn(body.message);
      return Response.json({ reply });
    }

    if (url.pathname.endsWith("/history")) {
      return Response.json({ messages: await listMessages(this, 100) });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  }

  private async runChatTurn(userMessage: string): Promise<string> {
    await addMessage(this, "user", userMessage);
    const history = await listMessages(this, 40);
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
    await addMessage(this, "assistant", result.text);
    return result.text;
  }
}
```

- [ ] **Step 3: Verify locally**

Run:

```bash
cd apps/cloudflare
npm run dev
```

Then in another terminal:

```bash
curl -s -X POST http://localhost:8787/api/agent/default/chat \
  -H 'content-type: application/json' \
  -d '{"message":"Say hello in one sentence"}'
```

Expected:

```json
{"reply":"..."}
```

- [ ] **Step 4: Commit**

```bash
git add apps/cloudflare/src/ShrimpAgent.ts apps/cloudflare/src/index.ts
git commit -m "feat: add Cloudflare Shrimp chat turn"
```

## Phase 3: Tools And Approval Policy

### Task 3.1: Add Tool Contracts

**Files:**
- Create: `apps/cloudflare/src/tools/index.ts`

- [ ] **Step 1: Create tool types**

Create `apps/cloudflare/src/tools/index.ts`:

```ts
import type { Agent } from "agents";
import { z } from "zod";
import type { Env } from "../env";

export type ApprovalLevel = "auto" | "notify" | "approve" | "never";

export interface CloudToolResult {
  title: string;
  output: unknown;
}

export interface CloudTool {
  name: string;
  description: string;
  parameters: z.ZodType;
  approvalLevel: ApprovalLevel;
  isReadOnly: boolean;
  handler: (input: Record<string, unknown>, agent: Agent<Env, unknown>) => Promise<CloudToolResult>;
}

export function zodToSimpleJsonSchema(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToSimpleJsonSchema(value as z.ZodType);
      if (!(value instanceof z.ZodOptional)) required.push(key);
    }
    return { type: "object", properties, required };
  }
  if (schema instanceof z.ZodString) return { type: "string" };
  if (schema instanceof z.ZodNumber) return { type: "number" };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodEnum) return { type: "string", enum: schema.options };
  return {};
}
```

- [ ] **Step 2: Verify**

```bash
cd apps/cloudflare
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/cloudflare/src/tools/index.ts
git commit -m "feat: add Cloudflare tool contracts"
```

### Task 3.2: Add Memory Tools

**Files:**
- Create: `apps/cloudflare/src/tools/memory.ts`

- [ ] **Step 1: Create memory tools**

Create `apps/cloudflare/src/tools/memory.ts`:

```ts
import { z } from "zod";
import type { CloudTool } from "./index";
import { recallMemories, storeMemory } from "../storage/memories";

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
        const memory = await storeMemory(agent, input.type as "fact" | "episode" | "procedure", String(input.content));
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
        const results = await recallMemories(agent, String(input.query));
        return { title: "Memory recall", output: { results } };
      },
    },
  ];
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/cloudflare/src/tools/memory.ts
git commit -m "feat: add Cloudflare memory tools"
```

### Task 3.3: Add HTTP Fetch Tool With Network Safety

**Files:**
- Create: `apps/cloudflare/src/tools/http.ts`

- [ ] **Step 1: Create HTTP tool**

Create `apps/cloudflare/src/tools/http.ts`:

```ts
import { z } from "zod";
import type { CloudTool } from "./index";

function assertPublicHttpUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http and https URLs are allowed");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Local and private hostnames are not allowed");
  }
  return url;
}

export function createHttpTools(): CloudTool[] {
  return [
    {
      name: "http.fetch",
      description: "Fetch a public HTTP or HTTPS URL and return text content.",
      parameters: z.object({
        url: z.string(),
      }),
      approvalLevel: "auto",
      isReadOnly: true,
      handler: async (input) => {
        const url = assertPublicHttpUrl(String(input.url));
        const response = await fetch(url, {
          headers: { "user-agent": "ShrimpAgent/0.1" },
        });
        const text = await response.text();
        return {
          title: `Fetched ${url.hostname}`,
          output: {
            status: response.status,
            contentType: response.headers.get("content-type"),
            text: text.slice(0, 12000),
            truncated: text.length > 12000,
          },
        };
      },
    },
  ];
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/cloudflare/src/tools/http.ts
git commit -m "feat: add safe HTTP fetch tool"
```

### Task 3.4: Add Short Approval Store

**Files:**
- Create: `apps/cloudflare/src/storage/approvals.ts`
- Create: `apps/cloudflare/src/tools/approvals.ts`

- [ ] **Step 1: Add approval storage**

Create `apps/cloudflare/src/storage/approvals.ts`:

```ts
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

export async function createApproval(agent: Agent<Env, unknown>, toolName: string, input: Record<string, unknown>): Promise<PendingApproval> {
  const approval: PendingApproval = {
    id: crypto.randomUUID(),
    toolName,
    input,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  await agent.sql`
    INSERT INTO approvals (id, tool_name, input_json, status, created_at)
    VALUES (${approval.id}, ${approval.toolName}, ${JSON.stringify(approval.input)}, ${approval.status}, ${approval.createdAt})
  `;
  return approval;
}

export async function resolveApproval(agent: Agent<Env, unknown>, id: string, status: "approved" | "denied"): Promise<boolean> {
  const resolvedAt = new Date().toISOString();
  const result = await agent.sql`
    UPDATE approvals
    SET status = ${status}, resolved_at = ${resolvedAt}
    WHERE id = ${id} AND status = 'pending'
  `;
  return result.rowsWritten > 0;
}

export async function listApprovals(agent: Agent<Env, unknown>): Promise<PendingApproval[]> {
  const rows = await agent.sql`
    SELECT id, tool_name, input_json, status, created_at, resolved_at
    FROM approvals
    ORDER BY created_at DESC
    LIMIT 50
  `;
  return rows.map((row) => ({
    id: String(row.id),
    toolName: String(row.tool_name),
    input: JSON.parse(String(row.input_json)),
    status: row.status as ApprovalStatus,
    createdAt: String(row.created_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : undefined,
  }));
}
```

- [ ] **Step 2: Add approval tools**

Create `apps/cloudflare/src/tools/approvals.ts`:

```ts
import { z } from "zod";
import type { CloudTool } from "./index";
import { listApprovals, resolveApproval } from "../storage/approvals";

export function createApprovalTools(): CloudTool[] {
  return [
    {
      name: "approvals.list",
      description: "List recent approval requests.",
      parameters: z.object({}),
      approvalLevel: "auto",
      isReadOnly: true,
      handler: async (_input, agent) => {
        return { title: "Approvals", output: { approvals: await listApprovals(agent) } };
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
        const resolved = await resolveApproval(agent, String(input.id), input.decision as "approved" | "denied");
        return { title: "Approval resolved", output: { resolved } };
      },
    },
  ];
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/cloudflare/src/storage/approvals.ts apps/cloudflare/src/tools/approvals.ts
git commit -m "feat: add Cloudflare approval storage and tools"
```

## Phase 4: Agent Loop With Tool Calling

### Task 4.1: Add Tool Registry

**Files:**
- Create: `apps/cloudflare/src/tools/registry.ts`

- [ ] **Step 1: Build registry**

Create `apps/cloudflare/src/tools/registry.ts`:

```ts
import type { CloudTool } from "./index";
import { createApprovalTools } from "./approvals";
import { createHttpTools } from "./http";
import { createMemoryTools } from "./memory";

export function allCloudTools(): CloudTool[] {
  return [
    ...createMemoryTools(),
    ...createHttpTools(),
    ...createApprovalTools(),
  ];
}

export function resolveCloudTool(name: string): CloudTool | undefined {
  return allCloudTools().find((tool) => tool.name === name);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/cloudflare/src/tools/registry.ts
git commit -m "feat: add Cloudflare tool registry"
```

### Task 4.2: Add Deterministic Tool-Command MVP

**Files:**
- Modify: `apps/cloudflare/src/ShrimpAgent.ts`

- [ ] **Step 1: Add deterministic command format before model tool calling**

For the first reliable MVP, support explicit commands in chat:

```text
/remember fact I prefer dark mode
/recall dark mode
/fetch https://example.com
/approvals
```

In `runChatTurn`, before calling Workers AI, parse these commands and route them to tools. This proves storage/tools/approvals before model-driven function calling.

- [ ] **Step 2: Implement command handling**

Add a private method:

```ts
private async runCommand(userMessage: string): Promise<string | undefined> {
  const [command, ...rest] = userMessage.trim().split(/\s+/);
  const text = rest.join(" ");

  if (command === "/remember") {
    const [type, ...contentParts] = rest;
    const tool = resolveCloudTool("memory.store");
    if (!tool) return "memory.store is unavailable.";
    const result = await tool.handler({ type: type || "fact", content: contentParts.join(" ") }, this);
    return JSON.stringify(result.output);
  }

  if (command === "/recall") {
    const tool = resolveCloudTool("memory.recall");
    if (!tool) return "memory.recall is unavailable.";
    const result = await tool.handler({ query: text }, this);
    return JSON.stringify(result.output);
  }

  if (command === "/fetch") {
    const tool = resolveCloudTool("http.fetch");
    if (!tool) return "http.fetch is unavailable.";
    const result = await tool.handler({ url: text }, this);
    return JSON.stringify(result.output);
  }

  if (command === "/approvals") {
    const tool = resolveCloudTool("approvals.list");
    if (!tool) return "approvals.list is unavailable.";
    const result = await tool.handler({}, this);
    return JSON.stringify(result.output);
  }

  return undefined;
}
```

Call it from `runChatTurn` before Workers AI:

```ts
const commandResult = await this.runCommand(userMessage);
if (commandResult !== undefined) {
  await addMessage(this, "assistant", commandResult);
  return commandResult;
}
```

- [ ] **Step 3: Verify commands**

Run:

```bash
cd apps/cloudflare
npm run dev
```

Then:

```bash
curl -s -X POST http://localhost:8787/api/agent/default/chat \
  -H 'content-type: application/json' \
  -d '{"message":"/remember fact I prefer dark mode"}'

curl -s -X POST http://localhost:8787/api/agent/default/chat \
  -H 'content-type: application/json' \
  -d '{"message":"/recall dark mode"}'
```

Expected: second response includes the stored memory.

- [ ] **Step 4: Commit**

```bash
git add apps/cloudflare/src/ShrimpAgent.ts
git commit -m "feat: add deterministic tool commands to Cloudflare agent"
```

## Phase 5: Web UI

### Task 5.1: Add Minimal Hosted UI

**Files:**
- Create: `apps/cloudflare/src/ui/index.html`
- Create: `apps/cloudflare/src/ui/styles.css`
- Create: `apps/cloudflare/src/ui/app.ts`
- Modify: `apps/cloudflare/src/index.ts`

- [ ] **Step 1: Create HTML**

Create `apps/cloudflare/src/ui/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Shrimp Agent</title>
    <link rel="stylesheet" href="/ui/styles.css">
  </head>
  <body>
    <main class="shell">
      <section class="chat">
        <div id="messages" class="messages"></div>
        <form id="form" class="composer">
          <input id="input" autocomplete="off" placeholder="Message Shrimp">
          <button type="submit">Send</button>
        </form>
      </section>
      <aside class="panel">
        <h1>Shrimp</h1>
        <p>Cloudflare hosted agent</p>
        <ul>
          <li>/remember fact ...</li>
          <li>/recall ...</li>
          <li>/fetch https://...</li>
          <li>/approvals</li>
        </ul>
      </aside>
    </main>
    <script type="module" src="/ui/app.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create CSS**

Create `apps/cloudflare/src/ui/styles.css`:

```css
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #0b0d10;
  color: #f5f7fa;
}
.shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
}
.chat {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.messages {
  flex: 1;
  overflow: auto;
  padding: 24px;
}
.message {
  max-width: 760px;
  margin-bottom: 12px;
  padding: 12px 14px;
  border: 1px solid #242933;
  background: #11151b;
  border-radius: 8px;
  white-space: pre-wrap;
}
.message.user {
  margin-left: auto;
  background: #182233;
}
.composer {
  display: flex;
  gap: 8px;
  padding: 16px;
  border-top: 1px solid #242933;
}
.composer input {
  flex: 1;
  padding: 12px;
  border: 1px solid #313947;
  border-radius: 8px;
  background: #0f1319;
  color: #f5f7fa;
}
.composer button {
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  background: #ff6b3d;
  color: white;
  font-weight: 700;
}
.panel {
  padding: 24px;
  border-left: 1px solid #242933;
  background: #0f1319;
}
@media (max-width: 800px) {
  .shell { grid-template-columns: 1fr; }
  .panel { display: none; }
}
```

- [ ] **Step 3: Create client script**

Create `apps/cloudflare/src/ui/app.ts`:

```ts
const messages = document.getElementById("messages")!;
const form = document.getElementById("form") as HTMLFormElement;
const input = document.getElementById("input") as HTMLInputElement;

function addMessage(role: "user" | "assistant", content: string) {
  const el = document.createElement("div");
  el.className = `message ${role}`;
  el.textContent = content;
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  addMessage("user", text);

  const response = await fetch("/api/agent/default/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: text }),
  });
  const data = await response.json<{ reply?: string; error?: string }>();
  addMessage("assistant", data.reply ?? data.error ?? "No response");
});
```

- [ ] **Step 4: Serve UI assets**

In `apps/cloudflare/src/index.ts`, serve `/`, `/ui/styles.css`, and `/ui/app.js`. If build tooling does not bundle `app.ts` directly, change it to plain `app.js`.

- [ ] **Step 5: Verify**

Run:

```bash
cd apps/cloudflare
npm run dev
```

Open:

```text
http://localhost:8787
```

Verify chat and command tools work from the browser.

- [ ] **Step 6: Commit**

```bash
git add apps/cloudflare/src/ui apps/cloudflare/src/index.ts
git commit -m "feat: add Cloudflare Shrimp web UI"
```

## Phase 6: Scheduling And Background Work

### Task 6.1: Add Reminder Command

**Files:**
- Create: `apps/cloudflare/src/tools/scheduler.ts`
- Modify: `apps/cloudflare/src/tools/registry.ts`
- Modify: `apps/cloudflare/src/ShrimpAgent.ts`

- [ ] **Step 1: Add scheduler tool**

Create `apps/cloudflare/src/tools/scheduler.ts`:

```ts
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
        const scheduleResult = await agent.schedule(delaySeconds, "sendReminder", { message });
        return { title: "Reminder scheduled", output: scheduleResult };
      },
    },
  ];
}
```

- [ ] **Step 2: Register scheduler tool**

Add `...createSchedulerTools()` to `allCloudTools()`.

- [ ] **Step 3: Add Agent scheduled method**

In `ShrimpAgent`, add:

```ts
async sendReminder(payload: { message: string }): Promise<void> {
  await addMessage(this, "assistant", `Reminder: ${payload.message}`);
}
```

- [ ] **Step 4: Add command**

Support:

```text
/remind 60 Stand up
```

- [ ] **Step 5: Verify with local scheduled test**

Run:

```bash
cd apps/cloudflare
npm run dev
```

Then send:

```json
{"message":"/remind 5 Check this reminder"}
```

Expected: a reminder appears in persisted history after the scheduled method runs.

- [ ] **Step 6: Commit**

```bash
git add apps/cloudflare/src/tools/scheduler.ts apps/cloudflare/src/tools/registry.ts apps/cloudflare/src/ShrimpAgent.ts
git commit -m "feat: add Cloudflare reminder scheduling"
```

## Phase 7: Deployment And Free-Mode Guardrails

### Task 7.1: Add Deploy Documentation

**Files:**
- Modify: `docs/CLOUDFLARE.md`

- [ ] **Step 1: Add commands**

Append:

```markdown
## Local Development

```bash
cd apps/cloudflare
npm install
npm run dev
```

Open `http://localhost:8787`.

## Deploy

```bash
cd apps/cloudflare
npx wrangler login
npm run deploy
```

## Free-Mode Guardrails

Free mode uses:

- Workers AI default model
- `SHRIMP_MAX_ITERATIONS=6`
- Short message history window
- No browser automation
- No sandbox execution
- No paid external model unless configured explicitly

If Cloudflare free-tier limits are exceeded, requests should fail closed with a clear error.
```

- [ ] **Step 2: Commit**

```bash
git add docs/CLOUDFLARE.md
git commit -m "docs: add Cloudflare deploy path"
```

### Task 7.2: Add Guardrail Config

**Files:**
- Modify: `apps/cloudflare/src/ShrimpAgent.ts`

- [ ] **Step 1: Enforce free-mode iteration and history limits**

In `runChatTurn`, enforce:

```ts
const maxHistory = this.env.SHRIMP_FREE_MODE === "true" ? 30 : 80;
const history = await listMessages(this, maxHistory);
```

Keep deterministic command outputs bounded to 12,000 characters.

- [ ] **Step 2: Verify**

```bash
cd apps/cloudflare
npm run check
```

- [ ] **Step 3: Commit**

```bash
git add apps/cloudflare/src/ShrimpAgent.ts
git commit -m "chore: enforce Cloudflare free-mode limits"
```

## Phase 8: Later Capability Tracks

These tracks are not part of the first deployable MVP. Implement them after chat, memory, approvals, scheduling, and deployment are stable.

### Track 8.1: Model Providers And AI Gateway

Use cases:

- User wants better model quality than Workers AI free model.
- User wants OpenRouter/OpenAI/Anthropic/Gemini behind Cloudflare.
- User wants observability and caching.

Plan:

- Add `apps/cloudflare/src/model/openai-compatible.ts`.
- Add secrets via `wrangler secret put OPENROUTER_API_KEY`.
- Add `SHRIMP_MODEL_PROVIDER=workers-ai|openrouter|openai`.
- Optionally route through AI Gateway.

### Track 8.2: Remote MCP

Use cases:

- Connect Shrimp to existing MCP servers.
- Use OAuth-backed tool surfaces.

Plan:

- Use Cloudflare Agents MCP client.
- Support remote HTTP/SSE MCP only.
- Block stdio MCP in hosted mode.
- Store MCP server config in Durable Object SQL.
- Approval-gate high-risk MCP tools.

### Track 8.3: Browser Tool

Use cases:

- Inspect a page.
- Capture screenshot.
- Extract structured data from public pages.

Plan:

- Use Cloudflare Browser tool, not Playwright.
- Keep browser disabled in free mode unless quota and pricing are understood.
- Approval-gate form submission and clicks.

### Track 8.4: Sandbox And Code Execution

Use cases:

- Run small JS snippets.
- Analyze data.
- Transform files.

Plan:

- Use Cloudflare Sandbox or Code Mode.
- Add explicit approvals for network/file/write operations.
- Persist generated artifacts to workspace storage or R2 later.

### Track 8.5: Workflows

Use cases:

- Long reports.
- Multi-step research.
- Long waits for approval.
- Guaranteed retry and recovery.

Plan:

- Add `AgentWorkflow`.
- Move long approval flows to `waitForApproval()`.
- Keep regular chat turns in Agent.

### Track 8.6: Sub-Agents

Use cases:

- Researcher/writer/coder/planner equivalents.
- Parallel background work.

Plan:

- Start with named modes inside one Agent.
- Later use separate agent instances and RPC.
- Add budget and approval boundaries per sub-agent.

### Track 8.7: Channels

Use cases:

- Slack agent.
- Email agent.
- Webhooks.
- Push notifications.

Plan:

- Add one channel at a time.
- Chat remains canonical debug surface.
- Every channel writes messages/tool events to the same storage contract.

## Acceptance Criteria For First Public Cloudflare MVP

The first deploy is acceptable when all of this is true:

- `cd apps/cloudflare && npm run check` passes.
- `npm run dev` starts at `http://localhost:8787`.
- Browser chat works.
- `/health` returns JSON.
- `/remember fact ...` stores memory.
- `/recall ...` retrieves memory.
- `/fetch https://example.com` returns bounded public content.
- `/remind 5 ...` schedules and persists a reminder result.
- `npm run deploy` succeeds.
- Deployed URL supports the same chat and memory checks.
- `docs/CLOUDFLARE.md` clearly lists what works and what is not supported.

## Execution Order

1. Phase 0: architecture doc and app skeleton.
2. Phase 1: Durable Object SQL schema and stores.
3. Phase 2: Workers AI chat.
4. Phase 3: tools and approvals.
5. Phase 4: deterministic tool-command MVP.
6. Phase 5: web UI.
7. Phase 6: scheduling.
8. Phase 7: deploy docs and guardrails.
9. Phase 8 tracks only after the deployed MVP is stable.

## Self-Review

Spec coverage:

- Hosted/free personal use is covered by Workers AI, free-mode guardrails, and `apps/cloudflare`.
- Cloudflare stack usage is covered by Agents SDK, Durable Object SQLite, scheduling, Wrangler, and later Workflows/MCP/Browser/Sandbox tracks.
- Flue/Think are handled as references while preserving Shrimp's harness ownership.
- Current local Shrimp remains undisturbed.
- Every major use case is mapped to MVP or later.

Placeholder scan:

- No phase uses "figure it out later" as an implementation step.
- Later tracks are intentionally scoped as non-MVP and name the Cloudflare primitive to use.

Type consistency:

- Cloudflare storage uses `CloudMessage`, `CloudMemory`, `PendingApproval`.
- Cloudflare tools use `CloudTool`, `CloudToolResult`, and `ApprovalLevel`.
- `ShrimpAgent` remains the central Durable Object class in `wrangler.jsonc`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-18-cloudflare-shrimp-agent.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per phase, review between phases, and keep each PR small.
2. **Inline Execution** - execute phases in this session using executing-plans with checkpoints after each phase.
