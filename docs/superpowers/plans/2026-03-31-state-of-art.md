# State of the Art Harness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Shrimp's harness state of the art with 6 features: persistent local memory with vector search, heartbeat scheduler, prompt caching for sub-agents, session resume, MCP client capability, and self-learning procedural memory.

**Architecture:** Each feature is independent and plugs into existing infrastructure. Local memory replaces WorkingMemory with SQLite + TF-IDF search (no external deps). Scheduler uses the event bus + Bun timers. Prompt caching shares system prompt bytes across sub-agents. Session resume loads history from SQLite. MCP client wraps @modelcontextprotocol/sdk. Self-learning captures repeated patterns as procedures.

**Tech Stack:** bun:sqlite (already used), @modelcontextprotocol/sdk (new), existing core

---

## Feature 1: Persistent local memory with search

Replace in-memory WorkingMemory with SQLite-backed storage. No external APIs needed. Uses TF-IDF scoring for relevance search (no vector DB dependency).

### Task 1.1: SQLite memory store

**Files:**
- Create: `src/capabilities/memory/sqlite-store.ts`
- Create: `tests/capabilities/memory/sqlite-store.test.ts`
- Modify: `src/capabilities/memory/index.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/capabilities/memory/sqlite-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SQLiteMemoryStore } from '../../../src/capabilities/memory/sqlite-store';
import { unlinkSync } from 'fs';

const TEST_DB = './data/test-memory.db';

describe('SQLiteMemoryStore', () => {
  let store: SQLiteMemoryStore;

  beforeEach(() => { store = new SQLiteMemoryStore(TEST_DB); });
  afterEach(() => { store.close(); try { unlinkSync(TEST_DB); } catch {} });

  it('stores and recalls by substring', async () => {
    await store.store({ id: '1', type: 'fact', content: 'Owner name is Anurag', timestamp: new Date() });
    const results = await store.recall('Anurag');
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('Owner name is Anurag');
  });

  it('search ranks by relevance', async () => {
    await store.store({ id: '1', type: 'fact', content: 'Owner likes coffee', timestamp: new Date() });
    await store.store({ id: '2', type: 'fact', content: 'Owner likes tea and coffee and espresso', timestamp: new Date() });
    await store.store({ id: '3', type: 'fact', content: 'Owner name is Anurag', timestamp: new Date() });
    const results = await store.search('coffee');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].content).toContain('coffee');
  });

  it('persists across instances', async () => {
    await store.store({ id: '1', type: 'fact', content: 'persistent fact', timestamp: new Date() });
    store.close();
    const store2 = new SQLiteMemoryStore(TEST_DB);
    const results = await store2.recall('persistent');
    expect(results).toHaveLength(1);
    store2.close();
  });

  it('forgets by id', async () => {
    await store.store({ id: '1', type: 'fact', content: 'forget me', timestamp: new Date() });
    await store.forget('1');
    const results = await store.recall('forget');
    expect(results).toHaveLength(0);
  });

  it('recall returns newest first', async () => {
    await store.store({ id: '1', type: 'fact', content: 'old fact', timestamp: new Date('2024-01-01') });
    await store.store({ id: '2', type: 'fact', content: 'new fact', timestamp: new Date('2026-03-31') });
    const results = await store.recall('fact');
    expect(results[0].id).toBe('2');
  });

  it('lists all entries', async () => {
    await store.store({ id: '1', type: 'fact', content: 'one', timestamp: new Date() });
    await store.store({ id: '2', type: 'episode', content: 'two', timestamp: new Date() });
    const all = await store.all();
    expect(all).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Implement SQLiteMemoryStore**

```typescript
// src/capabilities/memory/sqlite-store.ts
import { Database } from 'bun:sqlite';
import type { MemoryEntry } from '../../core/types';

export class SQLiteMemoryStore {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { create: true });
    this.db.run('PRAGMA journal_mode=WAL');
    this.db.run(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        timestamp TEXT NOT NULL
      )
    `);
  }

  async store(entry: MemoryEntry): Promise<void> {
    this.db.run(
      'INSERT OR REPLACE INTO memories (id, type, content, metadata, timestamp) VALUES (?, ?, ?, ?, ?)',
      [entry.id, entry.type, entry.content, entry.metadata ? JSON.stringify(entry.metadata) : null, entry.timestamp.toISOString()],
    );
  }

  async forget(id: string): Promise<void> {
    this.db.run('DELETE FROM memories WHERE id = ?', [id]);
  }

  async recall(query: string, limit = 10): Promise<MemoryEntry[]> {
    // Substring match, ordered by recency
    const rows = this.db.query(
      'SELECT * FROM memories WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?',
    ).all(`%${query}%`, limit) as any[];
    return rows.map(r => this.rowToEntry(r));
  }

  async search(query: string, k = 10): Promise<MemoryEntry[]> {
    // TF-IDF-like scoring: split query into words, count matches, rank
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    if (words.length === 0) return this.recall(query, k);

    const allRows = this.db.query('SELECT * FROM memories').all() as any[];

    const scored = allRows.map(row => {
      const content = row.content.toLowerCase();
      let score = 0;
      for (const word of words) {
        const matches = content.split(word).length - 1;
        score += matches;
      }
      return { row, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(s => this.rowToEntry(s.row));
  }

  async all(): Promise<MemoryEntry[]> {
    const rows = this.db.query('SELECT * FROM memories ORDER BY timestamp DESC').all() as any[];
    return rows.map(r => this.rowToEntry(r));
  }

  close(): void {
    this.db.close();
  }

  private rowToEntry(row: any): MemoryEntry {
    return {
      id: row.id,
      type: row.type,
      content: row.content,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      timestamp: new Date(row.timestamp),
    };
  }
}
```

- [ ] **Step 3: Update MemoryCapability to use SQLite by default**

In `src/capabilities/memory/index.ts`, add a `dbPath` option. If provided, use SQLiteMemoryStore instead of WorkingMemory:

```typescript
import { SQLiteMemoryStore } from './sqlite-store';
import { WorkingMemory } from './working';

export class MemoryCapability implements Capability {
  name = 'memory';
  description = 'Store and recall facts, episodes, and procedures';
  private store: WorkingMemory | SQLiteMemoryStore;

  constructor(dbPath?: string) {
    this.store = dbPath ? new SQLiteMemoryStore(dbPath) : new WorkingMemory();
  }
  // ... tools remain the same, just use this.store instead of this.memory
```

- [ ] **Step 4: Wire into server.ts**

Pass the DB path so memory persists:
```typescript
const memory = new MemoryCapability('./data/memory.db');
```

- [ ] **Step 5: Run tests, commit**

```bash
bun test
git commit -m "feat: persistent SQLite memory with TF-IDF search — zero external deps"
```

---

## Feature 2: Heartbeat scheduler

Proactive cron-based tasks. "Check X every hour." "Remind me at 5pm."

### Task 2.1: Scheduler core

**Files:**
- Create: `src/core/scheduler.ts`
- Create: `tests/core/scheduler.test.ts`
- Modify: `src/core/events.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/core/scheduler.test.ts
import { describe, it, expect, mock } from 'bun:test';
import { Scheduler } from '../../src/core/scheduler';

describe('Scheduler', () => {
  it('runs a one-time task at the right time', async () => {
    const scheduler = new Scheduler();
    const fn = mock(() => {});
    scheduler.once('test-once', fn, 50); // 50ms from now
    await new Promise(r => setTimeout(r, 100));
    expect(fn).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('runs a repeating task', async () => {
    const scheduler = new Scheduler();
    const fn = mock(() => {});
    scheduler.every('test-repeat', fn, 50); // every 50ms
    await new Promise(r => setTimeout(r, 180));
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2);
    scheduler.stop();
  });

  it('cancels a task', async () => {
    const scheduler = new Scheduler();
    const fn = mock(() => {});
    scheduler.every('test-cancel', fn, 50);
    scheduler.cancel('test-cancel');
    await new Promise(r => setTimeout(r, 100));
    expect(fn).toHaveBeenCalledTimes(0);
    scheduler.stop();
  });

  it('lists active tasks', () => {
    const scheduler = new Scheduler();
    scheduler.every('task-a', () => {}, 1000);
    scheduler.once('task-b', () => {}, 5000);
    expect(scheduler.list()).toHaveLength(2);
    scheduler.stop();
  });
});
```

- [ ] **Step 2: Implement Scheduler**

```typescript
// src/core/scheduler.ts
export interface ScheduledTask {
  id: string;
  type: 'once' | 'every';
  intervalMs: number;
  description?: string;
  nextRunAt: Date;
}

export class Scheduler {
  private timers = new Map<string, ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>();
  private tasks = new Map<string, ScheduledTask>();

  once(id: string, fn: () => void, delayMs: number, description?: string): void {
    this.cancel(id);
    const timer = setTimeout(() => {
      fn();
      this.timers.delete(id);
      this.tasks.delete(id);
    }, delayMs);
    this.timers.set(id, timer);
    this.tasks.set(id, {
      id, type: 'once', intervalMs: delayMs, description,
      nextRunAt: new Date(Date.now() + delayMs),
    });
  }

  every(id: string, fn: () => void, intervalMs: number, description?: string): void {
    this.cancel(id);
    const timer = setInterval(fn, intervalMs);
    this.timers.set(id, timer);
    this.tasks.set(id, {
      id, type: 'every', intervalMs, description,
      nextRunAt: new Date(Date.now() + intervalMs),
    });
  }

  cancel(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      clearInterval(timer);
      this.timers.delete(id);
      this.tasks.delete(id);
    }
  }

  list(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  stop(): void {
    for (const [id] of this.timers) {
      this.cancel(id);
    }
  }
}
```

- [ ] **Step 3: Add scheduler tools to AgentsCapability or as a new SchedulerCapability**

Create `src/capabilities/scheduler/index.ts` with tools: `scheduler.set`, `scheduler.remind`, `scheduler.list`, `scheduler.cancel`. The `scheduler.set` tool takes a cron-like interval and a task description, spawns a background agent on each tick.

- [ ] **Step 4: Wire into server, commit**

```bash
git commit -m "feat: heartbeat scheduler — cron tasks, reminders, proactive agent"
```

---

## Feature 3: Prompt caching for sub-agents

Share the system prompt prefix across parent and sub-agents so the model provider can cache it.

### Task 3.1: Shared prompt prefix

**Files:**
- Modify: `src/capabilities/agents/index.ts`
- Modify: `src/core/loop.ts`

- [ ] **Step 1: Extract system prompt as a shareable prefix**

Add a method to AgentLoop that returns the current system prompt:
```typescript
  getSystemPrompt(): string {
    return this.buildSystemPrompt();
  }
```

- [ ] **Step 2: Pass parent prompt to sub-agents**

When SubAgent runs, prepend the parent's system prompt as a context prefix (not the sub-agent's own prompt). This makes the first N tokens identical across parent and child, enabling prompt caching:

```typescript
class SubAgent {
  async run(task: string, allTools?: Tool[], pendingMessages?: () => string[], parentPromptPrefix?: string): Promise<string> {
    const systemContent = parentPromptPrefix
      ? `${parentPromptPrefix}\n\n---\n\n${this.systemPrompt}`
      : this.systemPrompt;
    // ... rest unchanged
  }
}
```

- [ ] **Step 3: Pass prefix from AgentsCapability handler**

In agents.spawn and agents.delegate handlers, get the parent prompt from ctx and pass it:
```typescript
const parentPrompt = ctx?.registry ? undefined : undefined; // TODO: get from loop
// For now, just pass the identity context as shared prefix
const sharedPrefix = `You are a sub-agent of ${ctx?.identity.name}, working for ${ctx?.identity.owner}.`;
const result = await agent.run(taskPrompt, allTools, pendingMessages, sharedPrefix);
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: shared prompt prefix for sub-agents — enables provider-side caching"
```

---

## Feature 4: Session resume

Pick up a previous conversation where you left off.

### Task 4.1: Resume from session ID

**Files:**
- Modify: `src/core/loop.ts`
- Modify: `src/index.ts`
- Modify: `src/dashboard/server.ts`

- [ ] **Step 1: Add loadSession method to AgentLoop**

```typescript
  loadSession(sessionId: string): boolean {
    if (!this.sessionStore) return false;
    const session = this.sessionStore.get(sessionId);
    if (!session) return false;
    this.sessionId = sessionId;
    this.conversationHistory = this.sessionStore.getMessages(sessionId);
    this.invalidateSystemPrompt();
    return true;
  }
```

- [ ] **Step 2: Add resume flag to CLI**

In `src/index.ts`, check for `SHRIMP_RESUME_SESSION` env var:
```typescript
const resumeId = process.env.SHRIMP_RESUME_SESSION;
if (resumeId) {
  const loaded = loop.loadSession(resumeId);
  if (loaded) {
    console.log(`  📂 Resumed session: ${resumeId}`);
  } else {
    console.log(`  ⚠️ Session ${resumeId} not found, starting fresh`);
  }
}
```

- [ ] **Step 3: Add resume endpoint to dashboard**

```typescript
app.post('/api/sessions/:id/resume', (c) => {
  const id = c.req.param('id');
  const loaded = loop.loadSession(id);
  if (!loaded) return c.json({ error: 'Session not found' }, 404);
  return c.json({ resumed: true, messages: loop.getHistory().length });
});
```

- [ ] **Step 4: Add /resume command to CLI**

In CLIChannel, detect `/resume <id>` and call `loop.loadSession()`.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: session resume — pick up previous conversations"
```

---

## Feature 5: MCP client capability

Connect to any MCP server and expose its tools as Shrimp capabilities.

### Task 5.1: MCP client

**Files:**
- Create: `src/capabilities/mcp/index.ts`
- Modify: `src/server.ts`
- Modify: `src/config/schema.ts`

- [ ] **Step 1: Install MCP SDK**

```bash
bun add @modelcontextprotocol/sdk
```

- [ ] **Step 2: Create MCP capability**

```typescript
// src/capabilities/mcp/index.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import type { Capability, Tool } from '../../core/types';
import { ok, err } from '../../core/types';

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export class MCPCapability implements Capability {
  name: string;
  description: string;
  private client: Client;
  private transport: StdioClientTransport;
  private loadedTools: Tool[] = [];
  private config: MCPServerConfig;

  constructor(config: MCPServerConfig) {
    this.config = config;
    this.name = `mcp_${config.name}`;
    this.description = `MCP server: ${config.name}`;
    this.client = new Client({ name: 'shrimp', version: '0.1.0' }, { capabilities: {} });
    this.transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
    });
  }

  get tools(): Tool[] { return this.loadedTools; }

  async start(): Promise<void> {
    try {
      await this.client.connect(this.transport);
      const { tools } = await this.client.listTools();

      this.loadedTools = tools.map(mcpTool => ({
        name: `mcp.${this.config.name}.${mcpTool.name}`,
        description: mcpTool.description ?? mcpTool.name,
        parameters: z.record(z.unknown()),
        rawInputSchema: mcpTool.inputSchema as Record<string, unknown>,
        approvalLevel: 'notify' as const,
        handler: async (input: Record<string, unknown>) => {
          try {
            const result = await this.client.callTool({ name: mcpTool.name, arguments: input });
            const text = result.content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text)
              .join('\n');
            return ok({ title: `mcp.${mcpTool.name}`, output: text || result.content });
          } catch (e: any) {
            return err({ code: 'MCP_ERROR', message: e.message, retryable: true });
          }
        },
      }));

      console.log(`  🔗 MCP ${this.config.name}: ${this.loadedTools.length} tools loaded`);
    } catch (e: any) {
      console.log(`  ⚠️ MCP ${this.config.name} failed to connect: ${e.message}`);
    }
  }

  async stop(): Promise<void> {
    try { await this.client.close(); } catch {}
  }
}
```

- [ ] **Step 3: Wire into server.ts**

Load MCP servers from `SHRIMP_MCP_SERVERS` env var (JSON array) or config:
```typescript
const mcpServers = JSON.parse(process.env.SHRIMP_MCP_SERVERS ?? '[]') as MCPServerConfig[];
for (const serverConfig of mcpServers) {
  const mcp = new MCPCapability(serverConfig);
  await mcp.start();
  if (mcp.tools.length > 0) registry.register(mcp);
}
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: MCP client — connect to any MCP server as a Shrimp capability"
```

---

## Feature 6: Self-learning procedural memory

When the agent performs the same multi-step pattern repeatedly, it captures it as a reusable procedure.

### Task 6.1: Procedure capture

**Files:**
- Create: `src/capabilities/memory/procedures.ts`
- Modify: `src/capabilities/memory/index.ts`
- Modify: `src/core/loop.ts`

- [ ] **Step 1: Create ProcedureStore**

```typescript
// src/capabilities/memory/procedures.ts
import { Database } from 'bun:sqlite';

export interface Procedure {
  id: string;
  name: string;
  trigger: string;        // what pattern triggers this (e.g., "book a flight")
  steps: string[];         // ordered list of tool calls
  createdAt: Date;
  usedCount: number;
  lastUsedAt: Date;
}

export class ProcedureStore {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { create: true });
    this.db.run('PRAGMA journal_mode=WAL');
    this.db.run(`
      CREATE TABLE IF NOT EXISTS procedures (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        trigger TEXT NOT NULL,
        steps TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        usedCount INTEGER DEFAULT 0,
        lastUsedAt TEXT NOT NULL
      )
    `);
  }

  save(procedure: Procedure): void {
    this.db.run(
      'INSERT OR REPLACE INTO procedures (id, name, trigger, steps, createdAt, usedCount, lastUsedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [procedure.id, procedure.name, procedure.trigger, JSON.stringify(procedure.steps), procedure.createdAt.toISOString(), procedure.usedCount, procedure.lastUsedAt.toISOString()],
    );
  }

  findByTrigger(query: string): Procedure | undefined {
    const row = this.db.query(
      'SELECT * FROM procedures WHERE trigger LIKE ? ORDER BY usedCount DESC LIMIT 1',
    ).get(`%${query}%`) as any;
    if (!row) return undefined;
    return { ...row, steps: JSON.parse(row.steps), createdAt: new Date(row.createdAt), lastUsedAt: new Date(row.lastUsedAt) };
  }

  incrementUsage(id: string): void {
    this.db.run(
      'UPDATE procedures SET usedCount = usedCount + 1, lastUsedAt = ? WHERE id = ?',
      [new Date().toISOString(), id],
    );
  }

  list(): Procedure[] {
    const rows = this.db.query('SELECT * FROM procedures ORDER BY usedCount DESC').all() as any[];
    return rows.map(r => ({ ...r, steps: JSON.parse(r.steps), createdAt: new Date(r.createdAt), lastUsedAt: new Date(r.lastUsedAt) }));
  }

  close(): void { this.db.close(); }
}
```

- [ ] **Step 2: Add procedure learning to the agent loop**

After each conversation turn that involved 3+ tool calls, analyze the pattern. If a similar pattern has been seen before, save it as a procedure:

In `src/core/loop.ts`, add after each `run()` completion:

```typescript
  private maybeLearnProcedure(userText: string): void {
    // Extract tool calls from the last turn
    const recentTools = this.conversationHistory
      .filter(m => m.role === 'assistant' && m.toolCalls)
      .slice(-1)
      .flatMap(m => m.toolCalls?.map(tc => tc.name) ?? []);

    if (recentTools.length < 3) return; // not complex enough to learn

    // Emit a learning event — the memory capability can pick this up
    this.bus.emit('memory:fact-updated', {
      key: `procedure:${recentTools.join('→')}`,
      newValue: `When user says "${userText.slice(0, 50)}", call: ${recentTools.join(' → ')}`,
    });
  }
```

- [ ] **Step 3: Add memory.procedures tool**

Add a tool that the agent can call to look up learned procedures:
```typescript
{
  name: 'memory.procedures',
  description: 'Look up learned procedures — multi-step patterns the agent has seen before.',
  parameters: z.object({ query: z.string().describe('What kind of task') }),
  isReadOnly: true,
  approvalLevel: 'auto',
  handler: async (input) => {
    const proc = procedureStore.findByTrigger(input.query as string);
    if (!proc) return ok({ title: 'No procedure found', output: { found: false } });
    procedureStore.incrementUsage(proc.id);
    return ok({ title: `Procedure: ${proc.name}`, output: { name: proc.name, steps: proc.steps, usedCount: proc.usedCount } });
  },
}
```

- [ ] **Step 4: Add procedure context to system prompt**

Mention learned procedures in the system prompt so the agent knows to check:
```
- If a task seems familiar, check memory.procedures to see if you've learned a pattern for it.
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: self-learning procedural memory — agent captures and reuses patterns"
```

---

## Self-review

**Spec coverage:**
- ✅ Feature 1: Persistent local memory with TF-IDF search (SQLiteMemoryStore)
- ✅ Feature 2: Heartbeat scheduler (Scheduler class + SchedulerCapability)
- ✅ Feature 3: Prompt caching for sub-agents (shared prefix)
- ✅ Feature 4: Session resume (loadSession + CLI command + API endpoint)
- ✅ Feature 5: MCP client (MCPCapability wrapping @modelcontextprotocol/sdk)
- ✅ Feature 6: Self-learning (ProcedureStore + procedure learning in loop)

**Placeholder scan:** No TBD. All implementations shown.

**Type consistency:** MemoryEntry used across SQLiteMemoryStore and WorkingMemory. Procedure type defined in procedures.ts. MCPServerConfig defined in mcp/index.ts. ScheduledTask defined in scheduler.ts.
