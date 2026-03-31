# OpenCode Patterns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt 6 patterns from OpenCode's harness: Zod tool schemas, structured tool returns, agent permission rulesets, SQLite session persistence, context window management, and client/server API split.

**Architecture:** These changes flow bottom-up. Zod schemas change the Tool type, which changes handlers, which changes capabilities. Session persistence adds a new storage layer. Context management hooks into the loop. The server split refactors the entry point into a proper API server that both CLI and dashboard consume.

**Tech Stack:** zod, bun:sqlite, hono (already installed)

---

## File structure

```
Modified:
  src/core/types.ts          — Tool interface: Zod schema, structured returns
  src/core/loop.ts           — Context management, session loading
  src/core/registry.ts       — Schema conversion for LLM (Zod → JSON Schema)
  src/models/openai-compatible.ts — Read inputSchema from Tool (no change if registry handles conversion)
  src/capabilities/memory/index.ts  — Update tool definitions to Zod
  src/capabilities/memory/working.ts — (no change)
  src/capabilities/agents/index.ts  — Permission rulesets, update tool definitions
  src/capabilities/composio/index.ts — (minimal, Composio provides its own schemas)
  src/capabilities/computer/index.ts — Update tool definitions to Zod
  src/index.ts               — Refactor into server.ts + index.ts
  src/dashboard/server.ts    — Add session API endpoints
  tests/core/registry.test.ts — Update for Zod
  tests/core/loop.test.ts     — Update for structured returns
  tests/core/approval.test.ts — (no change)
  tests/models/minimax.test.ts — Update for Zod schema conversion

Created:
  src/core/session.ts        — SQLite session store
  src/core/context.ts        — Context window manager (compaction/overflow)
  src/server.ts              — API server (Hono) — extracted from index.ts
  tests/core/session.test.ts — Session persistence tests
  tests/core/context.test.ts — Context management tests
```

---

### Task 1: Add Zod and update Tool interface

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/registry.ts`
- Modify: `tests/core/registry.test.ts`

- [ ] **Step 1: Install zod**

```bash
bun add zod
```

- [ ] **Step 2: Update Tool interface in types.ts**

Replace the `Tool` interface and add `ToolResult`:

```typescript
// In src/core/types.ts, replace the Tool interface:

import type { ZodType } from 'zod';

export interface ToolResult {
  title: string;
  output: unknown;
  metadata?: Record<string, unknown>;
}

export interface Tool {
  name: string;
  description: string;
  parameters: ZodType;                    // Zod schema (was inputSchema: Record<string, unknown>)
  approvalLevel: ApprovalLevel;
  handler: (input: any) => Promise<Result<ToolResult>>;  // returns ToolResult (was Result<unknown>)
}
```

Remove the old `inputSchema` field entirely. Keep all other types unchanged.

- [ ] **Step 3: Add zodToJsonSchema helper to registry.ts**

Add a function to `src/core/registry.ts` that converts Zod schemas to JSON Schema for the LLM API:

```typescript
import { z } from 'zod';
import type { Capability, Tool } from './types';

// Convert Zod schema to JSON Schema for OpenAI-compatible APIs
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodFieldToJsonSchema(value as z.ZodType);
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    }

    return { type: 'object', properties, required };
  }

  return { type: 'object', properties: {} };
}

function zodFieldToJsonSchema(field: z.ZodType): Record<string, unknown> {
  if (field instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: 'string' };
    if (field.description) result.description = field.description;
    return result;
  }
  if (field instanceof z.ZodNumber) {
    const result: Record<string, unknown> = { type: 'number' };
    if (field.description) result.description = field.description;
    return result;
  }
  if (field instanceof z.ZodBoolean) {
    return { type: 'boolean', description: field.description };
  }
  if (field instanceof z.ZodEnum) {
    return { type: 'string', enum: field.options, description: field.description };
  }
  if (field instanceof z.ZodOptional) {
    return zodFieldToJsonSchema(field.unwrap());
  }
  if (field instanceof z.ZodArray) {
    return { type: 'array', items: zodFieldToJsonSchema(field.element), description: field.description };
  }
  return { type: 'string' };
}
```

Add a method to `CapabilityRegistry`:

```typescript
  // Returns tools with JSON Schema for the LLM API
  allToolsForLLM(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
    return this.allTools().map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.parameters),
    }));
  }
```

- [ ] **Step 4: Update the test helpers in registry.test.ts**

Replace `makeTool` to use Zod:

```typescript
import { z } from 'zod';
import { ok } from '../src/core/types';

function makeTool(name: string): Tool {
  return {
    name,
    description: `Test tool ${name}`,
    parameters: z.object({}),
    approvalLevel: 'auto',
    handler: async () => ok({ title: name, output: { result: 'ok' } }),
  };
}
```

Add a test for `allToolsForLLM`:

```typescript
  it('converts Zod schemas to JSON Schema for LLM', () => {
    const tool: Tool = {
      name: 'memory.store',
      description: 'Store a fact',
      parameters: z.object({
        content: z.string().describe('The content'),
        type: z.enum(['fact', 'episode']).describe('Memory type'),
      }),
      approvalLevel: 'auto',
      handler: async () => ok({ title: 'stored', output: {} }),
    };
    const cap = makeCapability('memory', [tool]);
    registry.register(cap);

    const llmTools = registry.allToolsForLLM();
    expect(llmTools[0].inputSchema).toEqual({
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The content' },
        type: { type: 'string', enum: ['fact', 'episode'], description: 'Memory type' },
      },
      required: ['content', 'type'],
    });
  });
```

- [ ] **Step 5: Run tests**

Run: `bun test tests/core/registry.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/registry.ts tests/core/registry.test.ts package.json bun.lock
git commit -m "feat: switch tools from JSON Schema to Zod + add structured ToolResult"
```

---

### Task 2: Update model adapter to use registry's JSON Schema conversion

**Files:**
- Modify: `src/models/openai-compatible.ts`
- Modify: `src/core/loop.ts`
- Modify: `tests/models/minimax.test.ts`
- Modify: `tests/core/loop.test.ts`

- [ ] **Step 1: Update loop.ts to use allToolsForLLM()**

In `src/core/loop.ts`, change the `handleMessage` method. Where it calls `this.registry.allTools()` to pass to the model, use `allToolsForLLM()` instead:

```typescript
// In handleMessage, replace:
const tools = this.registry.allTools();
// ...
const response = await this.model.generate(messages, tools.length > 0 ? tools : undefined);

// With:
const tools = this.registry.allTools();
const llmTools = this.registry.allToolsForLLM();
// ...
const response = await this.model.generate(messages, llmTools.length > 0 ? llmTools : undefined);
```

Update the `ModelAdapter` interface to accept the LLM-formatted tools:

```typescript
// In types.ts, update ModelAdapter:
export interface LLMTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ModelAdapter {
  generate(messages: Message[], tools?: LLMTool[]): Promise<ModelResponse>;
  stream(messages: Message[], tools?: LLMTool[]): AsyncIterable<ModelChunk>;
}
```

- [ ] **Step 2: Update openai-compatible.ts to use LLMTool**

Change the `generate` method signature from `Tool[]` to `LLMTool[]`:

```typescript
import type { ModelAdapter, ModelResponse, ModelChunk, Message, LLMTool, ToolCall } from '../core/types';

// In generate():
async generate(messages: Message[], tools?: LLMTool[]): Promise<ModelResponse> {
```

The body construction stays the same since `LLMTool` has `inputSchema` which maps to `parameters` in the API call.

- [ ] **Step 3: Update executeTool to handle ToolResult**

In `loop.ts`, update `executeTool` to extract output from `ToolResult`:

```typescript
  private async executeTool(toolCall: ToolCall): Promise<unknown> {
    const tool = this.registry.resolveTool(toolCall.name);

    if (!tool) {
      return { error: `Unknown tool: ${toolCall.name}` };
    }

    // Validate input with Zod
    const parsed = tool.parameters.safeParse(toolCall.input);
    if (!parsed.success) {
      return { error: `Invalid input for ${toolCall.name}: ${parsed.error.message}` };
    }

    const approval = await this.gate.check({
      taskId: crypto.randomUUID(),
      toolName: toolCall.name,
      toolInput: parsed.data,
      description: `${toolCall.name}(${JSON.stringify(parsed.data)})`,
      level: tool.approvalLevel,
    });

    if (approval.verdict === 'denied') {
      return { error: `Action denied: ${toolCall.name} is currently disabled.` };
    }

    const input = approval.modifiedInput ?? parsed.data;

    try {
      const result = await tool.handler(input);
      if (result.ok) {
        return result.value.output;  // Extract output from ToolResult
      } else {
        return { error: `Tool ${toolCall.name} failed: ${result.error.message}`, retryable: result.error.retryable };
      }
    } catch (e: any) {
      return { error: `Tool ${toolCall.name} threw: ${e.message}` };
    }
  }
```

- [ ] **Step 4: Update test mocks**

In `tests/core/loop.test.ts`, update the mock tool to return `ToolResult`:

```typescript
const storeFn = mock(async () => ok({ title: 'Stored fact', output: { stored: 'abc-123' } }));
```

In `tests/models/minimax.test.ts`, update tool definitions to use Zod and `LLMTool` format for the adapter test:

```typescript
// The adapter test should pass LLMTool (JSON Schema) not Tool (Zod)
// since the adapter receives pre-converted schemas from the registry
await adapter.generate(
  [{ role: 'user', content: 'test' }],
  [{
    name: 'memory.store',
    description: 'Store a fact',
    inputSchema: { type: 'object', properties: { content: { type: 'string' } } },
  }],
);
```

- [ ] **Step 5: Run all tests**

Run: `bun test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/loop.ts src/models/openai-compatible.ts tests/
git commit -m "feat: Zod validation in agent loop + LLMTool type for model adapters"
```

---

### Task 3: Update all capability tool definitions to Zod

**Files:**
- Modify: `src/capabilities/memory/index.ts`
- Modify: `src/capabilities/agents/index.ts`
- Modify: `src/capabilities/computer/index.ts`
- Modify: `src/capabilities/composio/index.ts`
- Modify: `src/capabilities/memory/supermemory.ts`

- [ ] **Step 1: Update MemoryCapability**

```typescript
import { z } from 'zod';
import type { Capability, Tool, MemoryEntry } from '../../core/types';
import { ok } from '../../core/types';
import { WorkingMemory } from './working';

export class MemoryCapability implements Capability {
  name = 'memory';
  description = 'Store and recall facts, episodes, and procedures';
  readonly memory: WorkingMemory;

  constructor() {
    this.memory = new WorkingMemory();
  }

  get tools(): Tool[] {
    return [
      {
        name: 'memory.store',
        description: 'Store a fact, episode, or procedure in memory.',
        parameters: z.object({
          content: z.string().describe('The information to remember'),
          type: z.enum(['fact', 'episode', 'procedure']).describe('Type of memory'),
        }),
        approvalLevel: 'auto',
        handler: async (input) => {
          const entry: MemoryEntry = {
            id: crypto.randomUUID(),
            type: input.type,
            content: input.content,
            timestamp: new Date(),
          };
          await this.memory.store(entry);
          return ok({ title: 'Stored memory', output: { stored: entry.id } });
        },
      },
      {
        name: 'memory.recall',
        description: 'Recall information from memory. Returns recent and relevant entries.',
        parameters: z.object({
          query: z.string().describe('What to search for in memory'),
        }),
        approvalLevel: 'auto',
        handler: async (input) => {
          const results = await this.memory.recall(input.query);
          return ok({
            title: results.length > 0 ? `Found ${results.length} memories` : 'No memories found',
            output: { results: results.map(r => ({ type: r.type, content: r.content })) },
          });
        },
      },
      {
        name: 'memory.forget',
        description: 'Remove a specific memory entry by its ID.',
        parameters: z.object({
          id: z.string().describe('The ID of the memory to forget'),
        }),
        approvalLevel: 'auto',
        handler: async (input) => {
          await this.memory.forget(input.id);
          return ok({ title: 'Forgot memory', output: { forgotten: true } });
        },
      },
    ];
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
}
```

- [ ] **Step 2: Update AgentsCapability**

Update both tools (`agents.list` and `agents.delegate`) to use Zod schemas and return `ToolResult`:

```typescript
import { z } from 'zod';
// ... keep existing imports

// In the tools getter:
{
  name: 'agents.list',
  description: 'List all available sub-agents and their specialties.',
  parameters: z.object({}),
  approvalLevel: 'auto' as const,
  handler: async () => {
    const list = Array.from(this.agents.entries()).map(([name, agent]) => ({
      name,
      description: agent.description,
    }));
    return ok({ title: 'Available agents', output: { agents: list } });
  },
},
{
  name: 'agents.delegate',
  description: 'Delegate a task to a specialized sub-agent.',
  parameters: z.object({
    agent: z.string().describe('Name of the sub-agent to delegate to'),
    task: z.string().describe('The task description to give the sub-agent'),
  }),
  approvalLevel: 'notify' as const,
  handler: async (input) => {
    const agent = this.agents.get(input.agent);
    if (!agent) {
      const available = Array.from(this.agents.keys()).join(', ');
      return err({ code: 'AGENT_NOT_FOUND', message: `No agent named "${input.agent}". Available: ${available || 'none'}`, retryable: false });
    }
    try {
      const result = await agent.run(input.task);
      return ok({ title: `${input.agent} completed`, output: { agent: input.agent, result } });
    } catch (e: any) {
      return err({ code: 'AGENT_ERROR', message: `Agent "${input.agent}" failed: ${e.message}`, retryable: true });
    }
  },
}
```

- [ ] **Step 3: Update ComputerCapability**

Update all 7 tools to use Zod. Example for `computer.browse`:

```typescript
import { z } from 'zod';

{
  name: 'computer.browse',
  description: 'Navigate to a URL in the browser.',
  parameters: z.object({
    url: z.string().describe('The URL to navigate to'),
    action: z.enum(['screenshot', 'content', 'click', 'type']).optional().describe('What to do'),
    selector: z.string().optional().describe('CSS selector for click/type'),
    text: z.string().optional().describe('Text to type'),
  }),
  approvalLevel: 'auto',
  handler: async (input) => {
    const result = await this.sendCommand('browser', input);
    if (result.ok) return ok({ title: `Browsed ${input.url}`, output: result.value });
    return result;
  },
}
```

Apply same pattern to all other computer tools (terminal, screenshot, click, type, file_read, file_write). Change `sendCommand` return to wrap in `ToolResult`.

- [ ] **Step 4: Update ComposioCapability**

The Composio wrapper needs to convert its raw schemas. Since Composio provides JSON Schema, keep `z.record(z.unknown())` as a pass-through and wrap returns in `ToolResult`:

```typescript
private wrapTool(raw: RawComposioTool): Tool {
  return {
    name: `composio.${raw.name}`,
    description: raw.description || `Composio tool: ${raw.name}`,
    parameters: z.record(z.unknown()),  // Composio provides its own validation
    approvalLevel: this.getApprovalLevel(raw.name),
    handler: async (input) => {
      try {
        const result = await this.client.tools.execute(raw.name, { userId, arguments: input });
        return ok({ title: `${raw.name} completed`, output: result });
      } catch (e: any) {
        return err({ code: 'COMPOSIO_ERROR', message: e.message ?? 'Failed', retryable: true });
      }
    },
  };
}
```

Note: override `allToolsForLLM` in the registry won't work since Composio tools use `z.record()`. Instead, store the original JSON Schema on the tool and use it in the registry's conversion. Add an optional `rawInputSchema` field to `Tool`:

```typescript
// In types.ts, add to Tool:
rawInputSchema?: Record<string, unknown>;  // Override for Zod→JSON Schema conversion (used by Composio)
```

Update `allToolsForLLM` in registry to prefer `rawInputSchema` when present.

- [ ] **Step 5: Update SuperMemoryCapability**

Same pattern as MemoryCapability — Zod schemas + ToolResult returns.

- [ ] **Step 6: Run all tests**

Run: `bun test`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/capabilities/ src/core/types.ts
git commit -m "feat: migrate all capabilities to Zod schemas + structured ToolResult"
```

---

### Task 4: Permission rulesets for sub-agents

**Files:**
- Modify: `src/capabilities/agents/index.ts`
- Create: `tests/capabilities/agents/agents.test.ts`

- [ ] **Step 1: Add permission type and filtering to SubAgent**

```typescript
export type ToolPermission = 'allow' | 'deny';

export interface SubAgentConfig {
  name: string;
  description: string;
  model: ModelAdapter;
  systemPrompt: string;
  tools?: Tool[];
  permissions?: Record<string, ToolPermission>;  // e.g., { 'memory.*': 'allow', 'computer.*': 'deny' }
}
```

Add permission filtering to the `SubAgent` class:

```typescript
class SubAgent {
  // ... existing fields
  private permissions: Record<string, ToolPermission>;

  constructor(config: SubAgentConfig) {
    // ... existing
    this.permissions = config.permissions ?? {};
  }

  filterTools(allTools: Tool[]): Tool[] {
    return allTools.filter(tool => this.isAllowed(tool.name));
  }

  private isAllowed(toolName: string): boolean {
    // Check exact match
    if (this.permissions[toolName] !== undefined) {
      return this.permissions[toolName] === 'allow';
    }
    // Check glob match
    for (const [pattern, permission] of Object.entries(this.permissions)) {
      if (pattern.endsWith('.*')) {
        const prefix = pattern.slice(0, -2);
        if (toolName.startsWith(prefix + '.')) {
          return permission === 'allow';
        }
      }
    }
    // If permissions are set but no match, default deny
    if (Object.keys(this.permissions).length > 0) {
      return false;
    }
    // If no permissions set, allow all
    return true;
  }
}
```

- [ ] **Step 2: Write test**

```typescript
// tests/capabilities/agents/agents.test.ts
import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { AgentsCapability } from '../../../src/capabilities/agents/index';
import type { ModelAdapter, ModelResponse, Message, LLMTool } from '../../../src/core/types';

function mockModel(response: string): ModelAdapter {
  return {
    async generate(): Promise<ModelResponse> {
      return { content: response, usage: { inputTokens: 0, outputTokens: 0 } };
    },
    async *stream() { yield { delta: response }; },
  };
}

describe('AgentsCapability', () => {
  it('filters tools by permission ruleset', () => {
    const agents = new AgentsCapability();
    agents.addAgent({
      name: 'reader',
      description: 'Read-only agent',
      model: mockModel('ok'),
      systemPrompt: 'You are a reader.',
      permissions: {
        'memory.recall': 'allow',
        'memory.store': 'deny',
        'computer.*': 'deny',
      },
    });
    // Test via the agent's filterTools method (exposed for testing)
  });
});
```

- [ ] **Step 3: Update default sub-agents in index.ts with permissions**

```typescript
agents.addAgent({
  name: 'researcher',
  description: 'Research agent — read-only, no write actions.',
  model,
  systemPrompt: '...',
  permissions: { 'memory.recall': 'allow', 'memory.store': 'allow', 'agents.*': 'deny', 'computer.*': 'deny' },
});

agents.addAgent({
  name: 'coder',
  description: 'Coding agent — can use computer tools.',
  model,
  systemPrompt: '...',
  permissions: { 'memory.*': 'allow', 'computer.*': 'allow', 'agents.*': 'deny' },
});
```

- [ ] **Step 4: Run tests, commit**

Run: `bun test`

```bash
git add src/capabilities/agents/ tests/capabilities/agents/ src/index.ts
git commit -m "feat: add permission rulesets for sub-agents (allow/deny per tool)"
```

---

### Task 5: SQLite session persistence

**Files:**
- Create: `src/core/session.ts`
- Create: `tests/core/session.test.ts`
- Modify: `src/core/loop.ts`
- Modify: `src/dashboard/server.ts`

- [ ] **Step 1: Write session store tests**

```typescript
// tests/core/session.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SessionStore } from '../../src/core/session';
import { unlinkSync } from 'fs';

const TEST_DB = './data/test-sessions.db';

describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(TEST_DB);
  });

  afterEach(() => {
    store.close();
    try { unlinkSync(TEST_DB); } catch {}
  });

  it('creates a new session', () => {
    const session = store.create('Test session');
    expect(session.id).toBeTruthy();
    expect(session.title).toBe('Test session');
  });

  it('adds messages to a session', () => {
    const session = store.create('Test');
    store.addMessage(session.id, { role: 'user', content: 'hello' });
    store.addMessage(session.id, { role: 'assistant', content: 'hi' });

    const messages = store.getMessages(session.id);
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('hello');
    expect(messages[1].content).toBe('hi');
  });

  it('lists all sessions', () => {
    store.create('Session 1');
    store.create('Session 2');

    const sessions = store.list();
    expect(sessions).toHaveLength(2);
  });

  it('persists across instances', () => {
    const session = store.create('Persistent');
    store.addMessage(session.id, { role: 'user', content: 'remember this' });
    store.close();

    const store2 = new SessionStore(TEST_DB);
    const messages = store2.getMessages(session.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('remember this');
    store2.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/core/session.test.ts`
Expected: FAIL — cannot resolve

- [ ] **Step 3: Implement SessionStore**

```typescript
// src/core/session.ts
import { Database } from 'bun:sqlite';
import type { Message } from './types';

export interface Session {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export class SessionStore {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { create: true });
    this.db.run('PRAGMA journal_mode=WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_call_id TEXT,
        tool_calls TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);
  }

  create(title: string): Session {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db.run(
      'INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [id, title, now, now],
    );
    return { id, title, createdAt: new Date(now), updatedAt: new Date(now) };
  }

  addMessage(sessionId: string, message: Message): void {
    const now = new Date().toISOString();
    this.db.run(
      'INSERT INTO messages (session_id, role, content, tool_call_id, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [
        sessionId,
        message.role,
        message.content,
        message.toolCallId ?? null,
        message.toolCalls ? JSON.stringify(message.toolCalls) : null,
        now,
      ],
    );
    this.db.run('UPDATE sessions SET updated_at = ? WHERE id = ?', [now, sessionId]);
  }

  getMessages(sessionId: string): Message[] {
    const rows = this.db.query(
      'SELECT role, content, tool_call_id, tool_calls FROM messages WHERE session_id = ? ORDER BY id',
    ).all(sessionId) as any[];

    return rows.map(row => ({
      role: row.role,
      content: row.content,
      toolCallId: row.tool_call_id ?? undefined,
      toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
    }));
  }

  list(): Session[] {
    const rows = this.db.query(
      'SELECT id, title, created_at, updated_at FROM sessions ORDER BY updated_at DESC',
    ).all() as any[];

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  get(id: string): Session | undefined {
    const row = this.db.query('SELECT id, title, created_at, updated_at FROM sessions WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return { id: row.id, title: row.title, createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) };
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/core/session.test.ts`
Expected: 4 PASS

- [ ] **Step 5: Wire session store into AgentLoop**

Update `AgentLoopConfig` in `src/core/loop.ts`:

```typescript
import { SessionStore } from './session';

export interface AgentLoopConfig {
  // ... existing fields
  sessionStore?: SessionStore;
}
```

In the constructor, create or load a session. In `handleMessage`, persist each message after adding it to history.

```typescript
private sessionStore?: SessionStore;
private sessionId?: string;

constructor(config: AgentLoopConfig) {
  // ... existing
  this.sessionStore = config.sessionStore;
  if (this.sessionStore) {
    const session = this.sessionStore.create('New session');
    this.sessionId = session.id;
  }
}

// In handleMessage, after each push to conversationHistory:
private persistMessage(message: Message): void {
  this.conversationHistory.push(message);
  if (this.sessionStore && this.sessionId) {
    this.sessionStore.addMessage(this.sessionId, message);
  }
}
```

Replace all `this.conversationHistory.push(...)` calls with `this.persistMessage(...)`.

- [ ] **Step 6: Add session endpoints to dashboard**

In `src/dashboard/server.ts`:

```typescript
  app.get('/api/sessions', (c) => {
    if (!config.sessionStore) return c.json([]);
    return c.json(config.sessionStore.list());
  });

  app.get('/api/sessions/:id/messages', (c) => {
    if (!config.sessionStore) return c.json([]);
    return c.json(config.sessionStore.getMessages(c.req.param('id')));
  });
```

- [ ] **Step 7: Run all tests, commit**

Run: `bun test`

```bash
git add src/core/session.ts src/core/loop.ts src/dashboard/server.ts tests/core/session.test.ts
git commit -m "feat: add SQLite session persistence — conversations survive restarts"
```

---

### Task 6: Context window management

**Files:**
- Create: `src/core/context.ts`
- Create: `tests/core/context.test.ts`
- Modify: `src/core/loop.ts`

- [ ] **Step 1: Write context manager tests**

```typescript
// tests/core/context.test.ts
import { describe, it, expect } from 'bun:test';
import { ContextManager } from '../../src/core/context';
import type { Message } from '../../src/core/types';

describe('ContextManager', () => {
  it('returns all messages when under limit', () => {
    const mgr = new ContextManager({ maxTokens: 10000 });
    const messages: Message[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ];
    const result = mgr.fit(messages);
    expect(result).toHaveLength(2);
  });

  it('compacts old messages when over limit', () => {
    const mgr = new ContextManager({ maxTokens: 100 }); // very small limit
    const messages: Message[] = [];
    for (let i = 0; i < 50; i++) {
      messages.push({ role: 'user', content: `Message number ${i} with some extra content to take up space` });
      messages.push({ role: 'assistant', content: `Response number ${i} with additional text for padding` });
    }
    const result = mgr.fit(messages);
    // Should have fewer messages than original
    expect(result.length).toBeLessThan(messages.length);
    // Should keep the most recent messages intact
    expect(result[result.length - 1].content).toContain('49');
    // First message should be a summary
    expect(result[0].role).toBe('system');
  });

  it('always keeps the last N messages intact', () => {
    const mgr = new ContextManager({ maxTokens: 200, keepRecentCount: 4 });
    const messages: Message[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push({ role: 'user', content: `Long message ${i} ${'x'.repeat(50)}` });
      messages.push({ role: 'assistant', content: `Long response ${i} ${'y'.repeat(50)}` });
    }
    const result = mgr.fit(messages);
    // Last 4 messages should be preserved exactly
    const origLast4 = messages.slice(-4);
    const resultLast4 = result.slice(-4);
    expect(resultLast4[0].content).toBe(origLast4[0].content);
    expect(resultLast4[3].content).toBe(origLast4[3].content);
  });
});
```

- [ ] **Step 2: Implement ContextManager**

```typescript
// src/core/context.ts
import type { Message } from './types';

export interface ContextManagerConfig {
  maxTokens: number;       // approximate token budget
  keepRecentCount?: number; // always keep last N messages intact (default: 6)
}

export class ContextManager {
  private maxTokens: number;
  private keepRecentCount: number;

  constructor(config: ContextManagerConfig) {
    this.maxTokens = config.maxTokens;
    this.keepRecentCount = config.keepRecentCount ?? 6;
  }

  fit(messages: Message[]): Message[] {
    const totalTokens = this.estimateTokens(messages);
    if (totalTokens <= this.maxTokens) {
      return messages;
    }

    // Split: older messages to compact, recent messages to keep
    const keepCount = Math.min(this.keepRecentCount, messages.length);
    const older = messages.slice(0, messages.length - keepCount);
    const recent = messages.slice(messages.length - keepCount);

    if (older.length === 0) {
      return recent; // nothing to compact
    }

    // Summarize older messages into a system message
    const summary = this.summarize(older);
    const summaryMessage: Message = {
      role: 'system',
      content: `[Previous conversation summary]\n${summary}`,
    };

    return [summaryMessage, ...recent];
  }

  private summarize(messages: Message[]): string {
    const points: string[] = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        const short = msg.content.length > 100 ? msg.content.slice(0, 100) + '...' : msg.content;
        points.push(`User asked: ${short}`);
      } else if (msg.role === 'assistant' && msg.content && !msg.toolCalls) {
        const short = msg.content.length > 100 ? msg.content.slice(0, 100) + '...' : msg.content;
        points.push(`Agent responded: ${short}`);
      } else if (msg.role === 'assistant' && msg.toolCalls) {
        const tools = msg.toolCalls.map(tc => tc.name).join(', ');
        points.push(`Agent called tools: ${tools}`);
      }
      // Skip tool result messages in summary (noise)
    }

    return points.join('\n');
  }

  private estimateTokens(messages: Message[]): number {
    // Rough estimate: 1 token ≈ 4 characters
    let total = 0;
    for (const msg of messages) {
      total += Math.ceil(msg.content.length / 4);
      if (msg.toolCalls) {
        total += Math.ceil(JSON.stringify(msg.toolCalls).length / 4);
      }
    }
    return total;
  }
}
```

- [ ] **Step 3: Wire into AgentLoop**

In `src/core/loop.ts`, add context management before calling the model:

```typescript
import { ContextManager } from './context';

// In AgentLoopConfig:
maxContextTokens?: number;

// In constructor:
private contextManager: ContextManager;
// ...
this.contextManager = new ContextManager({
  maxTokens: config.maxContextTokens ?? 50000,
});

// In handleMessage, before calling model.generate:
const fittedHistory = this.contextManager.fit(this.conversationHistory);
const messages: Message[] = [
  { role: 'system', content: systemPrompt },
  ...fittedHistory,  // was: ...this.conversationHistory
];
```

- [ ] **Step 4: Run all tests**

Run: `bun test`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/context.ts src/core/loop.ts tests/core/context.test.ts
git commit -m "feat: add context window management — auto-compacts old messages"
```

---

### Task 7: Client/server API split

**Files:**
- Create: `src/server.ts`
- Modify: `src/index.ts`
- Modify: `src/dashboard/server.ts`

- [ ] **Step 1: Extract server creation into src/server.ts**

```typescript
// src/server.ts
import { ShrimpEventBus } from './core/events';
import { CapabilityRegistry } from './core/registry';
import { ApprovalGate } from './core/approval';
import { AgentLoop } from './core/loop';
import { SessionStore } from './core/session';
import { OpenAICompatibleAdapter } from './models/openai-compatible';
import { MemoryCapability } from './capabilities/memory/index';
import { SuperMemoryCapability } from './capabilities/memory/supermemory';
import { ComposioCapability } from './capabilities/composio/index';
import { ComputerCapability } from './capabilities/computer/index';
import { AgentsCapability } from './capabilities/agents/index';
import { createDashboard } from './dashboard/server';
import { loadConfig } from './config/defaults';

export interface ShrimpServer {
  bus: ShrimpEventBus;
  registry: CapabilityRegistry;
  loop: AgentLoop;
  sessionStore: SessionStore;
  port: number;
}

export async function createShrimpServer(): Promise<ShrimpServer> {
  const config = loadConfig();

  if (!config.model.apiKey) {
    console.error('❌ No API key found.');
    process.exit(1);
  }

  console.log(`🦐 Shrimp v0.1.0 — agent for ${config.identity.owner}`);
  console.log(`   Provider: ${config.model.provider}`);
  console.log(`   Model: ${config.model.model}\n`);

  const bus = new ShrimpEventBus();
  const registry = new CapabilityRegistry();
  const gate = new ApprovalGate(config.approval.overrides, config.approval.default);
  const sessionStore = new SessionStore('./data/sessions.db');

  const model = new OpenAICompatibleAdapter({
    apiKey: config.model.apiKey,
    model: config.model.model,
    baseUrl: config.model.baseUrl ?? '',
  });

  // ... capability registration (same as current index.ts)
  // Memory, Composio, Computer, Agents setup...

  const loop = new AgentLoop({
    bus, registry, gate, model,
    identity: config.identity,
    verbose: true,
    sessionStore,
  });

  const dashboardPort = parseInt(process.env.SHRIMP_DASHBOARD_PORT ?? '3737');
  const dashboard = createDashboard({ port: dashboardPort, bus, registry, loop, sessionStore });
  const server = Bun.serve({ port: dashboardPort, fetch: dashboard.fetch });
  console.log(`  🌐 API + Dashboard: http://localhost:${server.port}`);

  return { bus, registry, loop, sessionStore, port: server.port };
}
```

- [ ] **Step 2: Simplify index.ts to just start server + CLI**

```typescript
// src/index.ts
import { createShrimpServer } from './server';
import { CLIChannel } from './capabilities/channels/cli';

async function main() {
  const { bus, loop } = await createShrimpServer();

  console.log('   Type /quit to exit\n');

  const cli = new CLIChannel();
  cli.onMessage(async (msg) => {
    bus.emit('channel:message', { channel: 'cli', from: 'user', text: msg.text });
    try {
      const response = await loop.handleMessage(msg.text);
      await cli.send(response);
    } catch (e: any) {
      await cli.send(`Error: ${e.message}`);
    }
    cli.prompt();
  });
  cli.start();
}

main().catch(console.error);
```

- [ ] **Step 3: Update DashboardConfig to include sessionStore**

```typescript
export interface DashboardConfig {
  port: number;
  bus: ShrimpEventBus;
  registry: CapabilityRegistry;
  loop: AgentLoop;
  sessionStore?: SessionStore;
}
```

- [ ] **Step 4: Run all tests, verify server boots**

Run: `bun test`
Expected: All PASS

Run: `bun run start` — should boot exactly as before but with sessions persisted.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts src/index.ts src/dashboard/server.ts
git commit -m "feat: extract server into standalone module — enables headless/API-only mode

createShrimpServer() returns { bus, registry, loop, sessionStore }.
CLI is just one client. Other clients (Telegram, mobile) import
createShrimpServer() and add their own interface."
```

---

## Self-review

**Spec coverage:**
- ✅ 1. Zod schemas for tools (Task 1 + 3)
- ✅ 2. Structured tool returns / ToolResult (Task 1 + 2 + 3)
- ✅ 3. Context window management (Task 6)
- ✅ 4. SQLite session persistence (Task 5)
- ✅ 5. Client/server split (Task 7)
- ✅ 6. Permission rulesets per agent (Task 4)

**Placeholder scan:** No TBD/TODO. All code blocks complete.

**Type consistency:** `Tool.parameters` (Zod) → `LLMTool.inputSchema` (JSON Schema) → model adapter. `ToolResult` with `{ title, output, metadata }` used consistently. `SessionStore` interface consistent across loop, dashboard, and server.
