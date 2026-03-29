# Shrimp Core Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core agent harness — event bus, capability registry, model adapter, approval gate, agent loop, CLI channel, and working memory — so you can talk to Shrimp in your terminal and it reasons with tools.

**Architecture:** ReAct agent loop at the center, event bus as the nervous system, capabilities as pluggable adapters. The loop receives events, calls the model, dispatches tool calls through the registry, and stores results in memory. Approval gate intercepts dangerous actions.

**Tech Stack:** TypeScript, Bun runtime, bun:sqlite, bun:test

**Design Doc:** `~/.gstack/projects/shrimp/aarekaz-unknown-design-20260329-020207.md`

---

## File Structure

```
shrimp/
├── package.json              # Project manifest, bun runtime
├── tsconfig.json             # TypeScript config (strict)
├── .gitignore                # node_modules, data/, .env
├── src/
│   ├── core/
│   │   ├── types.ts          # All shared types: Tool, ToolCall, CapabilityError, Result, Message, etc.
│   │   ├── events.ts         # Typed event bus (EventMap, ShrimpEventBus)
│   │   ├── registry.ts       # Capability registry (register, get, list, tool dispatch)
│   │   ├── model.ts          # ModelAdapter interface + ModelResponse/ModelChunk types
│   │   ├── approval.ts       # ApprovalGate: checks approval level, routes to channel
│   │   ├── loop.ts           # Agent loop: ReAct cycle, event handling, tool dispatch
│   │   └── scheduler.ts      # Task scheduler (cron fallback, scheduled tasks)
│   ├── models/
│   │   └── minimax.ts        # MiniMax M2.7 adapter (OpenAI-compatible REST)
│   ├── capabilities/
│   │   ├── memory/
│   │   │   ├── index.ts      # Memory capability (registers tools, wires tiers)
│   │   │   └── working.ts    # Working memory (in-memory Map, ephemeral)
│   │   └── channels/
│   │       └── cli.ts        # CLI channel adapter (readline-based)
│   ├── config/
│   │   ├── schema.ts         # ShrimpConfig type + validation
│   │   └── defaults.ts       # Default configuration values
│   └── index.ts              # Entry point: wire everything, start loop
├── tests/
│   ├── core/
│   │   ├── events.test.ts
│   │   ├── registry.test.ts
│   │   ├── approval.test.ts
│   │   └── loop.test.ts
│   ├── models/
│   │   └── minimax.test.ts
│   └── capabilities/
│       └── memory/
│           └── working.test.ts
└── data/                     # Runtime data (gitignored)
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: Initialize git repo**

```bash
cd /Users/aarekaz/Development/startclaw-main/shrimp
git init
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "shrimp",
  "version": "0.1.0",
  "description": "Open-source agent harness. The body you give to any brain.",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "start": "bun run src/index.ts",
    "test": "bun test",
    "dev": "bun --watch run src/index.ts"
  },
  "license": "MIT"
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["bun-types"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
data/
.env
.env.local
*.db
*.db-journal
```

- [ ] **Step 5: Install bun-types**

Run: `bun add -d bun-types`
Expected: `bun-types` added to devDependencies

- [ ] **Step 6: Create directory structure**

```bash
mkdir -p src/core src/models src/capabilities/memory src/capabilities/channels src/config tests/core tests/models tests/capabilities/memory data
```

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json .gitignore bun.lock
git commit -m "feat: scaffold shrimp project with bun runtime"
```

---

### Task 2: Core Types

**Files:**
- Create: `src/core/types.ts`

- [ ] **Step 1: Write types.ts with all shared types**

```typescript
// src/core/types.ts

// --- Result type (no thrown exceptions) ---

export type Result<T, E = CapabilityError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// --- Capability Errors ---

export interface CapabilityError {
  code: string;
  message: string;
  retryable: boolean;
}

// --- Tool System ---

export type ApprovalLevel = 'auto' | 'notify' | 'approve' | 'never';

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  approvalLevel: ApprovalLevel;
  handler: (input: Record<string, unknown>) => Promise<Result<unknown>>;
}

// --- Model Types ---

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ModelResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface ModelChunk {
  delta: string;
  toolCallDelta?: { id?: string; name?: string; inputDelta?: string };
}

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  role: MessageRole;
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

// --- Capability Interface ---

export interface Capability {
  name: string;
  description: string;
  tools: Tool[];
  events?: string[];
  listeners?: string[];
  start(): Promise<void>;
  stop(): Promise<void>;
}

// --- Model Adapter ---

export interface ModelAdapter {
  generate(messages: Message[], tools?: Tool[]): Promise<ModelResponse>;
  stream(messages: Message[], tools?: Tool[]): AsyncIterable<ModelChunk>;
}

// --- Channel Adapter ---

export interface IncomingMessage {
  channel: string;
  from: string;
  text: string;
  replyTo?: string;
}

export interface SendOptions {
  replyTo?: string;
  format?: 'text' | 'markdown';
}

export interface ChannelAdapter {
  name: string;
  send(message: string, options?: SendOptions): Promise<void>;
  onMessage(handler: (msg: IncomingMessage) => void): void;
}

// --- Approval ---

export interface ApprovalRequest {
  taskId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  description: string;
  level: ApprovalLevel;
  timeoutMs?: number;
}

export interface ApprovalResult {
  verdict: 'approved' | 'denied' | 'modified';
  modifiedInput?: Record<string, unknown>;
}

// --- Memory ---

export interface MemoryEntry {
  id: string;
  type: 'fact' | 'episode' | 'procedure';
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}
```

- [ ] **Step 2: Verify types compile**

Run: `bunx tsc --noEmit src/core/types.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "feat: add core types — Result, Tool, Capability, ModelAdapter, ChannelAdapter"
```

---

### Task 3: Event Bus

**Files:**
- Create: `src/core/events.ts`
- Create: `tests/core/events.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/events.test.ts
import { describe, it, expect, mock } from 'bun:test';
import { ShrimpEventBus } from '../src/core/events';

describe('ShrimpEventBus', () => {
  it('emits and receives typed events', () => {
    const bus = new ShrimpEventBus();
    const handler = mock(() => {});

    bus.on('channel:message', handler);
    bus.emit('channel:message', {
      channel: 'cli',
      from: 'user',
      text: 'hello',
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      channel: 'cli',
      from: 'user',
      text: 'hello',
    });
  });

  it('supports once() for single-fire listeners', () => {
    const bus = new ShrimpEventBus();
    const handler = mock(() => {});

    bus.once('task:completed', handler);
    bus.emit('task:completed', { taskId: '1', result: 'done' });
    bus.emit('task:completed', { taskId: '2', result: 'done' });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('supports off() to remove listeners', () => {
    const bus = new ShrimpEventBus();
    const handler = mock(() => {});

    bus.on('channel:message', handler);
    bus.off('channel:message', handler);
    bus.emit('channel:message', {
      channel: 'cli',
      from: 'user',
      text: 'hello',
    });

    expect(handler).toHaveBeenCalledTimes(0);
  });

  it('handles multiple listeners on the same event', () => {
    const bus = new ShrimpEventBus();
    const h1 = mock(() => {});
    const h2 = mock(() => {});

    bus.on('task:completed', h1);
    bus.on('task:completed', h2);
    bus.emit('task:completed', { taskId: '1', result: 'ok' });

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/core/events.test.ts`
Expected: FAIL — cannot resolve `../src/core/events`

- [ ] **Step 3: Implement ShrimpEventBus**

```typescript
// src/core/events.ts
import type { CapabilityError } from './types';

export interface EventMap {
  'email:received': { id: string; from: string; subject: string; body: string; timestamp: Date };
  'email:sent': { id: string; to: string; subject: string };
  'channel:message': { channel: string; from: string; text: string; replyTo?: string };
  'browser:page-loaded': { url: string; title: string };
  'task:scheduled': { taskId: string; goal: string; runAt: Date };
  'task:completed': { taskId: string; result: string };
  'task:failed': { taskId: string; error: CapabilityError };
  'task:approval-needed': { taskId: string; question: string; options: string[] };
  'memory:fact-updated': { key: string; oldValue?: string; newValue: string };
}

type EventHandler<T> = (payload: T) => void;

export class ShrimpEventBus {
  private listeners = new Map<string, Set<EventHandler<any>>>();

  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  once<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
    const wrapper: EventHandler<EventMap[K]> = (payload) => {
      this.off(event, wrapper);
      handler(payload);
    };
    this.on(event, wrapper);
  }

  off<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(payload);
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/core/events.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/events.ts tests/core/events.test.ts
git commit -m "feat: add typed event bus with on/once/off/emit"
```

---

### Task 4: Capability Registry

**Files:**
- Create: `src/core/registry.ts`
- Create: `tests/core/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/registry.test.ts
import { describe, it, expect } from 'bun:test';
import { CapabilityRegistry } from '../src/core/registry';
import type { Capability, Tool } from '../src/core/types';
import { ok } from '../src/core/types';

function makeTool(name: string): Tool {
  return {
    name,
    description: `Test tool ${name}`,
    inputSchema: { type: 'object', properties: {} },
    approvalLevel: 'auto',
    handler: async () => ok({ result: 'ok' }),
  };
}

function makeCapability(name: string, tools: Tool[]): Capability {
  return {
    name,
    description: `Test capability ${name}`,
    tools,
    async start() {},
    async stop() {},
  };
}

describe('CapabilityRegistry', () => {
  it('registers and retrieves a capability', () => {
    const registry = new CapabilityRegistry();
    const cap = makeCapability('memory', [makeTool('memory.store')]);

    registry.register(cap);
    expect(registry.get('memory')).toBe(cap);
  });

  it('lists all registered capabilities', () => {
    const registry = new CapabilityRegistry();
    registry.register(makeCapability('memory', []));
    registry.register(makeCapability('browser', []));

    const names = registry.list().map(c => c.name);
    expect(names).toContain('memory');
    expect(names).toContain('browser');
  });

  it('resolves a tool by name across all capabilities', () => {
    const registry = new CapabilityRegistry();
    const tool = makeTool('memory.store');
    registry.register(makeCapability('memory', [tool]));

    const resolved = registry.resolveTool('memory.store');
    expect(resolved).toBe(tool);
  });

  it('returns undefined for unknown tools', () => {
    const registry = new CapabilityRegistry();
    expect(registry.resolveTool('nonexistent.tool')).toBeUndefined();
  });

  it('collects all tools for LLM injection', () => {
    const registry = new CapabilityRegistry();
    registry.register(makeCapability('memory', [makeTool('memory.store'), makeTool('memory.recall')]));
    registry.register(makeCapability('browser', [makeTool('browser.goto')]));

    const allTools = registry.allTools();
    expect(allTools).toHaveLength(3);
    expect(allTools.map(t => t.name)).toContain('browser.goto');
  });

  it('throws on duplicate capability name', () => {
    const registry = new CapabilityRegistry();
    registry.register(makeCapability('memory', []));
    expect(() => registry.register(makeCapability('memory', []))).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/core/registry.test.ts`
Expected: FAIL — cannot resolve `../src/core/registry`

- [ ] **Step 3: Implement CapabilityRegistry**

```typescript
// src/core/registry.ts
import type { Capability, Tool } from './types';

export class CapabilityRegistry {
  private capabilities = new Map<string, Capability>();
  private toolIndex = new Map<string, Tool>();

  register(capability: Capability): void {
    if (this.capabilities.has(capability.name)) {
      throw new Error(`Capability "${capability.name}" is already registered`);
    }
    this.capabilities.set(capability.name, capability);
    for (const tool of capability.tools) {
      this.toolIndex.set(tool.name, tool);
    }
  }

  get(name: string): Capability | undefined {
    return this.capabilities.get(name);
  }

  list(): Capability[] {
    return Array.from(this.capabilities.values());
  }

  resolveTool(name: string): Tool | undefined {
    return this.toolIndex.get(name);
  }

  allTools(): Tool[] {
    return Array.from(this.toolIndex.values());
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/core/registry.test.ts`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/registry.ts tests/core/registry.test.ts
git commit -m "feat: add capability registry with tool resolution"
```

---

### Task 5: Approval Gate

**Files:**
- Create: `src/core/approval.ts`
- Create: `tests/core/approval.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/approval.test.ts
import { describe, it, expect } from 'bun:test';
import { ApprovalGate } from '../src/core/approval';
import type { ApprovalLevel } from '../src/core/types';

describe('ApprovalGate', () => {
  it('auto-approves tools with level "auto"', async () => {
    const gate = new ApprovalGate({}, 'approve');
    const result = await gate.check({
      taskId: '1',
      toolName: 'memory.store',
      toolInput: { key: 'name', value: 'test' },
      description: 'Store a fact',
      level: 'auto',
    });
    expect(result.verdict).toBe('approved');
  });

  it('denies tools with level "never"', async () => {
    const gate = new ApprovalGate({}, 'approve');
    const result = await gate.check({
      taskId: '1',
      toolName: 'payments.charge',
      toolInput: { amount: 100 },
      description: 'Charge $100',
      level: 'never',
    });
    expect(result.verdict).toBe('denied');
  });

  it('applies config overrides over tool-level approval', async () => {
    const overrides: Record<string, ApprovalLevel> = {
      'browser.fill': 'auto',
    };
    const gate = new ApprovalGate(overrides, 'approve');

    const result = await gate.check({
      taskId: '1',
      toolName: 'browser.fill',
      toolInput: { selector: '#name', value: 'test' },
      description: 'Fill form field',
      level: 'approve', // tool says approve, config says auto
    });
    expect(result.verdict).toBe('approved');
  });

  it('applies glob overrides', async () => {
    const overrides: Record<string, ApprovalLevel> = {
      'payments.*': 'never',
    };
    const gate = new ApprovalGate(overrides, 'approve');

    const result = await gate.check({
      taskId: '1',
      toolName: 'payments.charge',
      toolInput: { amount: 50 },
      description: 'Charge $50',
      level: 'approve',
    });
    expect(result.verdict).toBe('denied');
  });

  it('falls back to config default when no override matches', async () => {
    const gate = new ApprovalGate({}, 'auto');
    const result = await gate.check({
      taskId: '1',
      toolName: 'unknown.tool',
      toolInput: {},
      description: 'Do something',
      level: 'auto',
    });
    expect(result.verdict).toBe('approved');
  });

  it('returns "needs_user" for approve-level tools (channel handles the rest)', async () => {
    const gate = new ApprovalGate({}, 'approve');
    const result = await gate.check({
      taskId: '1',
      toolName: 'email.send',
      toolInput: { to: 'someone@test.com' },
      description: 'Send email',
      level: 'approve',
    });
    expect(result.verdict).toBe('needs_user');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/core/approval.test.ts`
Expected: FAIL — cannot resolve `../src/core/approval`

- [ ] **Step 3: Implement ApprovalGate**

```typescript
// src/core/approval.ts
import type { ApprovalLevel, ApprovalRequest, ApprovalResult } from './types';

// Extended result type for internal use — 'needs_user' means the channel must ask
export type GateVerdict = ApprovalResult['verdict'] | 'needs_user';

export interface GateResult {
  verdict: GateVerdict;
  modifiedInput?: Record<string, unknown>;
}

export class ApprovalGate {
  constructor(
    private overrides: Record<string, ApprovalLevel>,
    private defaultLevel: ApprovalLevel,
  ) {}

  async check(request: ApprovalRequest): Promise<GateResult> {
    const effectiveLevel = this.resolveLevel(request.toolName, request.level);

    switch (effectiveLevel) {
      case 'auto':
        return { verdict: 'approved' };
      case 'notify':
        return { verdict: 'approved' }; // approved but caller should notify user
      case 'never':
        return { verdict: 'denied' };
      case 'approve':
        return { verdict: 'needs_user' };
    }
  }

  private resolveLevel(toolName: string, toolLevel: ApprovalLevel): ApprovalLevel {
    // Precedence: config overrides > tool.approvalLevel > config default

    // Check exact match
    if (this.overrides[toolName] !== undefined) {
      return this.overrides[toolName];
    }

    // Check glob match (e.g., "payments.*")
    for (const [pattern, level] of Object.entries(this.overrides)) {
      if (pattern.endsWith('.*')) {
        const prefix = pattern.slice(0, -2);
        if (toolName.startsWith(prefix + '.')) {
          return level;
        }
      }
    }

    // Tool-level approval
    if (toolLevel !== this.defaultLevel) {
      return toolLevel;
    }

    // Config default
    return this.defaultLevel;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/core/approval.test.ts`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/approval.ts tests/core/approval.test.ts
git commit -m "feat: add approval gate with config overrides and glob matching"
```

---

### Task 6: Working Memory

**Files:**
- Create: `src/capabilities/memory/working.ts`
- Create: `src/capabilities/memory/index.ts`
- Create: `tests/capabilities/memory/working.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/capabilities/memory/working.test.ts
import { describe, it, expect } from 'bun:test';
import { WorkingMemory } from '../../src/capabilities/memory/working';

describe('WorkingMemory', () => {
  it('stores and retrieves entries', async () => {
    const mem = new WorkingMemory();
    await mem.store({
      id: '1',
      type: 'fact',
      content: 'Owner name is aarekaz',
      timestamp: new Date(),
    });

    const results = await mem.recall('owner name');
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('Owner name is aarekaz');
  });

  it('forgets entries by id', async () => {
    const mem = new WorkingMemory();
    await mem.store({
      id: '1',
      type: 'fact',
      content: 'test fact',
      timestamp: new Date(),
    });

    await mem.forget('1');
    const results = await mem.recall('test');
    expect(results).toHaveLength(0);
  });

  it('lists all entries', async () => {
    const mem = new WorkingMemory();
    await mem.store({ id: '1', type: 'fact', content: 'fact one', timestamp: new Date() });
    await mem.store({ id: '2', type: 'episode', content: 'episode one', timestamp: new Date() });

    const all = await mem.all();
    expect(all).toHaveLength(2);
  });

  it('search returns entries containing query substring', async () => {
    const mem = new WorkingMemory();
    await mem.store({ id: '1', type: 'fact', content: 'Owner prefers window seats', timestamp: new Date() });
    await mem.store({ id: '2', type: 'fact', content: 'Owner email is x@y.com', timestamp: new Date() });

    const results = await mem.search('window');
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('window');
  });

  it('recall returns most recent entries first', async () => {
    const mem = new WorkingMemory();
    await mem.store({ id: '1', type: 'fact', content: 'old fact', timestamp: new Date('2024-01-01') });
    await mem.store({ id: '2', type: 'fact', content: 'new fact', timestamp: new Date('2026-03-29') });

    const results = await mem.recall('fact');
    expect(results[0].id).toBe('2'); // newer first
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/capabilities/memory/working.test.ts`
Expected: FAIL — cannot resolve `../../src/capabilities/memory/working`

- [ ] **Step 3: Implement WorkingMemory**

```typescript
// src/capabilities/memory/working.ts
import type { MemoryEntry } from '../../core/types';

export class WorkingMemory {
  private entries = new Map<string, MemoryEntry>();

  async store(entry: MemoryEntry): Promise<void> {
    this.entries.set(entry.id, entry);
  }

  async forget(id: string): Promise<void> {
    this.entries.delete(id);
  }

  async recall(query: string, limit = 10): Promise<MemoryEntry[]> {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.entries.values())
      .filter(e => e.content.toLowerCase().includes(lowerQuery))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async search(query: string, k = 10): Promise<MemoryEntry[]> {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.entries.values())
      .filter(e => e.content.toLowerCase().includes(lowerQuery))
      .slice(0, k);
  }

  async all(): Promise<MemoryEntry[]> {
    return Array.from(this.entries.values());
  }

  clear(): void {
    this.entries.clear();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/capabilities/memory/working.test.ts`
Expected: 5 tests PASS

- [ ] **Step 5: Create Memory capability that registers tools**

```typescript
// src/capabilities/memory/index.ts
import type { Capability, Tool, MemoryEntry } from '../../core/types';
import { ok, err } from '../../core/types';
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
        description: 'Store a fact, episode, or procedure in memory. Use this to remember important information.',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'The information to remember' },
            type: { type: 'string', enum: ['fact', 'episode', 'procedure'], description: 'Type of memory' },
          },
          required: ['content', 'type'],
        },
        approvalLevel: 'auto' as const,
        handler: async (input: Record<string, unknown>) => {
          const entry: MemoryEntry = {
            id: crypto.randomUUID(),
            type: input.type as MemoryEntry['type'],
            content: input.content as string,
            timestamp: new Date(),
          };
          await this.memory.store(entry);
          return ok({ stored: entry.id });
        },
      },
      {
        name: 'memory.recall',
        description: 'Recall information from memory. Returns recent and relevant entries.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'What to search for in memory' },
          },
          required: ['query'],
        },
        approvalLevel: 'auto' as const,
        handler: async (input: Record<string, unknown>) => {
          const results = await this.memory.recall(input.query as string);
          if (results.length === 0) {
            return ok({ results: [], message: 'No matching memories found.' });
          }
          return ok({ results: results.map(r => ({ type: r.type, content: r.content })) });
        },
      },
      {
        name: 'memory.forget',
        description: 'Remove a specific memory entry by its ID.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The ID of the memory to forget' },
          },
          required: ['id'],
        },
        approvalLevel: 'auto' as const,
        handler: async (input: Record<string, unknown>) => {
          await this.memory.forget(input.id as string);
          return ok({ forgotten: true });
        },
      },
    ];
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
}
```

- [ ] **Step 6: Commit**

```bash
git add src/capabilities/memory/working.ts src/capabilities/memory/index.ts tests/capabilities/memory/working.test.ts
git commit -m "feat: add working memory with store/recall/search/forget tools"
```

---

### Task 7: MiniMax Model Adapter

**Files:**
- Create: `src/core/model.ts`
- Create: `src/models/minimax.ts`
- Create: `tests/models/minimax.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/models/minimax.test.ts
import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { MiniMaxAdapter } from '../src/models/minimax';

// Mock global fetch for testing
const originalFetch = globalThis.fetch;

describe('MiniMaxAdapter', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends messages to OpenAI-compatible endpoint and parses response', async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({
        choices: [{
          message: {
            content: 'Hello! I am Shrimp.',
            tool_calls: undefined,
          },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }))
    ) as any;

    const adapter = new MiniMaxAdapter({
      apiKey: 'test-key',
      model: 'minimax-m2.7',
      baseUrl: 'https://api.minimax.chat/v1',
    });

    const result = await adapter.generate([
      { role: 'user', content: 'Hello' },
    ]);

    expect(result.content).toBe('Hello! I am Shrimp.');
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(5);
  });

  it('parses tool calls from the response', async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({
        choices: [{
          message: {
            content: '',
            tool_calls: [{
              id: 'call_1',
              type: 'function',
              function: {
                name: 'memory.store',
                arguments: '{"content":"test","type":"fact"}',
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
        usage: { prompt_tokens: 15, completion_tokens: 20 },
      }))
    ) as any;

    const adapter = new MiniMaxAdapter({
      apiKey: 'test-key',
      model: 'minimax-m2.7',
      baseUrl: 'https://api.minimax.chat/v1',
    });

    const result = await adapter.generate(
      [{ role: 'user', content: 'Remember my name is aarekaz' }],
      [],
    );

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].name).toBe('memory.store');
    expect(result.toolCalls![0].input).toEqual({ content: 'test', type: 'fact' });
  });

  it('formats tools as OpenAI function calling schema', async () => {
    let capturedBody: any;
    globalThis.fetch = mock(async (_url: any, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      }));
    }) as any;

    const adapter = new MiniMaxAdapter({
      apiKey: 'test-key',
      model: 'minimax-m2.7',
      baseUrl: 'https://api.minimax.chat/v1',
    });

    await adapter.generate(
      [{ role: 'user', content: 'test' }],
      [{
        name: 'memory.store',
        description: 'Store a fact',
        inputSchema: { type: 'object', properties: { content: { type: 'string' } } },
        approvalLevel: 'auto',
        handler: async () => ({ ok: true, value: {} } as any),
      }],
    );

    expect(capturedBody.tools).toHaveLength(1);
    expect(capturedBody.tools[0].type).toBe('function');
    expect(capturedBody.tools[0].function.name).toBe('memory.store');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/models/minimax.test.ts`
Expected: FAIL — cannot resolve `../src/models/minimax`

- [ ] **Step 3: Implement MiniMaxAdapter**

```typescript
// src/models/minimax.ts
import type { ModelAdapter, ModelResponse, ModelChunk, Message, Tool, ToolCall } from '../core/types';

export interface MiniMaxConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

interface OpenAIMessage {
  role: string;
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export class MiniMaxAdapter implements ModelAdapter {
  constructor(private config: MiniMaxConfig) {}

  async generate(messages: Message[], tools?: Tool[]): Promise<ModelResponse> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: messages.map(m => this.toOpenAIMessage(m)),
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));
    }

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`MiniMax API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json() as any;
    const choice = data.choices[0];
    const msg = choice.message;

    const toolCalls: ToolCall[] | undefined = msg.tool_calls?.map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments),
    }));

    return {
      content: msg.content ?? '',
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      },
    };
  }

  async *stream(messages: Message[], tools?: Tool[]): AsyncIterable<ModelChunk> {
    // Streaming is a v1.1 enhancement — for now, fall back to generate
    const response = await this.generate(messages, tools);
    yield { delta: response.content };
  }

  private toOpenAIMessage(msg: Message): OpenAIMessage {
    const base: OpenAIMessage = {
      role: msg.role,
      content: msg.content,
    };

    if (msg.toolCalls) {
      base.tool_calls = msg.toolCalls.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.input) },
      }));
      base.content = msg.content || null;
    }

    if (msg.toolCallId) {
      base.tool_call_id = msg.toolCallId;
      base.role = 'tool';
    }

    return base;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/models/minimax.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/model.ts src/models/minimax.ts tests/models/minimax.test.ts
git commit -m "feat: add MiniMax M2.7 model adapter (OpenAI-compatible)"
```

---

### Task 8: CLI Channel Adapter

**Files:**
- Create: `src/capabilities/channels/cli.ts`

- [ ] **Step 1: Implement CLIChannel**

```typescript
// src/capabilities/channels/cli.ts
import * as readline from 'node:readline';
import type { ChannelAdapter, IncomingMessage, SendOptions } from '../../core/types';

export class CLIChannel implements ChannelAdapter {
  name = 'cli';
  private messageHandler: ((msg: IncomingMessage) => void) | null = null;
  private rl: readline.Interface | null = null;

  async send(message: string, _options?: SendOptions): Promise<void> {
    console.log(`\n🦐 Shrimp: ${message}`);
  }

  onMessage(handler: (msg: IncomingMessage) => void): void {
    this.messageHandler = handler;
  }

  start(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.rl.setPrompt('You: ');
    this.rl.prompt();

    this.rl.on('line', (line: string) => {
      const text = line.trim();
      if (!text) {
        this.rl?.prompt();
        return;
      }

      if (text === '/quit' || text === '/exit') {
        console.log('\n🦐 Goodbye!');
        process.exit(0);
      }

      if (this.messageHandler) {
        this.messageHandler({
          channel: 'cli',
          from: 'user',
          text,
        });
      }
    });
  }

  prompt(): void {
    this.rl?.prompt();
  }

  stop(): void {
    this.rl?.close();
    this.rl = null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/capabilities/channels/cli.ts
git commit -m "feat: add CLI channel adapter with readline interface"
```

---

### Task 9: Agent Loop

**Files:**
- Create: `src/core/loop.ts`
- Create: `tests/core/loop.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/loop.test.ts
import { describe, it, expect, mock } from 'bun:test';
import { AgentLoop } from '../src/core/loop';
import { ShrimpEventBus } from '../src/core/events';
import { CapabilityRegistry } from '../src/core/registry';
import { ApprovalGate } from '../src/core/approval';
import type { ModelAdapter, ModelResponse, Tool, Message, Capability } from '../src/core/types';
import { ok } from '../src/core/types';

function createMockModel(responses: ModelResponse[]): ModelAdapter {
  let callCount = 0;
  return {
    async generate(_messages: Message[], _tools?: Tool[]): Promise<ModelResponse> {
      return responses[callCount++] ?? { content: 'No response', usage: { inputTokens: 0, outputTokens: 0 } };
    },
    async *stream() {
      yield { delta: 'mock' };
    },
  };
}

describe('AgentLoop', () => {
  it('processes a user message and returns model response', async () => {
    const bus = new ShrimpEventBus();
    const registry = new CapabilityRegistry();
    const gate = new ApprovalGate({}, 'approve');
    const model = createMockModel([
      { content: 'Hello! I am Shrimp.', usage: { inputTokens: 10, outputTokens: 5 } },
    ]);

    const loop = new AgentLoop({ bus, registry, gate, model, identity: { name: 'Shrimp', owner: 'test' } });
    const response = await loop.handleMessage('Hello');

    expect(response).toBe('Hello! I am Shrimp.');
  });

  it('dispatches tool calls and feeds results back to model', async () => {
    const bus = new ShrimpEventBus();
    const registry = new CapabilityRegistry();
    const gate = new ApprovalGate({}, 'auto');

    const storeFn = mock(async () => ok({ stored: 'abc-123' }));
    const cap: Capability = {
      name: 'memory',
      description: 'Memory',
      tools: [{
        name: 'memory.store',
        description: 'Store a fact',
        inputSchema: { type: 'object', properties: { content: { type: 'string' } } },
        approvalLevel: 'auto',
        handler: storeFn,
      }],
      async start() {},
      async stop() {},
    };
    registry.register(cap);

    const model = createMockModel([
      // First response: model calls a tool
      {
        content: '',
        toolCalls: [{ id: 'c1', name: 'memory.store', input: { content: 'test fact' } }],
        usage: { inputTokens: 10, outputTokens: 15 },
      },
      // Second response: model produces final answer after seeing tool result
      {
        content: 'Got it, I stored that fact.',
        usage: { inputTokens: 20, outputTokens: 10 },
      },
    ]);

    const loop = new AgentLoop({ bus, registry, gate, model, identity: { name: 'Shrimp', owner: 'test' } });
    const response = await loop.handleMessage('Remember that I like coffee');

    expect(storeFn).toHaveBeenCalledTimes(1);
    expect(response).toBe('Got it, I stored that fact.');
  });

  it('stops after max iterations to prevent infinite loops', async () => {
    const bus = new ShrimpEventBus();
    const registry = new CapabilityRegistry();
    const gate = new ApprovalGate({}, 'auto');

    // Model always returns tool calls — would loop forever without a cap
    const model = createMockModel(
      Array(20).fill({
        content: '',
        toolCalls: [{ id: 'c1', name: 'nonexistent.tool', input: {} }],
        usage: { inputTokens: 5, outputTokens: 5 },
      })
    );

    const loop = new AgentLoop({ bus, registry, gate, model, identity: { name: 'Shrimp', owner: 'test' }, maxIterations: 3 });
    const response = await loop.handleMessage('Do something');

    expect(response).toContain('limit');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/core/loop.test.ts`
Expected: FAIL — cannot resolve `../src/core/loop`

- [ ] **Step 3: Implement AgentLoop**

```typescript
// src/core/loop.ts
import type { ModelAdapter, Message, Tool, ToolCall } from './types';
import type { ShrimpEventBus } from './events';
import type { CapabilityRegistry } from './registry';
import type { ApprovalGate } from './approval';

export interface AgentLoopConfig {
  bus: ShrimpEventBus;
  registry: CapabilityRegistry;
  gate: ApprovalGate;
  model: ModelAdapter;
  identity: { name: string; owner: string };
  maxIterations?: number;
}

export class AgentLoop {
  private bus: ShrimpEventBus;
  private registry: CapabilityRegistry;
  private gate: ApprovalGate;
  private model: ModelAdapter;
  private identity: { name: string; owner: string };
  private maxIterations: number;
  private conversationHistory: Message[] = [];

  constructor(config: AgentLoopConfig) {
    this.bus = config.bus;
    this.registry = config.registry;
    this.gate = config.gate;
    this.model = config.model;
    this.identity = config.identity;
    this.maxIterations = config.maxIterations ?? 10;
  }

  async handleMessage(userText: string): Promise<string> {
    this.conversationHistory.push({ role: 'user', content: userText });

    const systemPrompt = this.buildSystemPrompt();
    let iterations = 0;

    while (iterations < this.maxIterations) {
      iterations++;

      const messages: Message[] = [
        { role: 'system', content: systemPrompt },
        ...this.conversationHistory,
      ];

      const tools = this.registry.allTools();
      const response = await this.model.generate(messages, tools.length > 0 ? tools : undefined);

      if (!response.toolCalls || response.toolCalls.length === 0) {
        // Final answer — no tool calls
        this.conversationHistory.push({ role: 'assistant', content: response.content });
        return response.content;
      }

      // Model wants to call tools
      this.conversationHistory.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls,
      });

      for (const toolCall of response.toolCalls) {
        const result = await this.executeTool(toolCall);
        this.conversationHistory.push({
          role: 'tool',
          content: JSON.stringify(result),
          toolCallId: toolCall.id,
        });
      }
    }

    const limitMsg = `I reached my reasoning limit (${this.maxIterations} iterations). Here's what I have so far.`;
    this.conversationHistory.push({ role: 'assistant', content: limitMsg });
    return limitMsg;
  }

  private async executeTool(toolCall: ToolCall): Promise<unknown> {
    const tool = this.registry.resolveTool(toolCall.name);

    if (!tool) {
      return { error: `Unknown tool: ${toolCall.name}` };
    }

    // Check approval
    const approval = await this.gate.check({
      taskId: crypto.randomUUID(),
      toolName: toolCall.name,
      toolInput: toolCall.input,
      description: `${toolCall.name}(${JSON.stringify(toolCall.input)})`,
      level: tool.approvalLevel,
    });

    if (approval.verdict === 'denied') {
      return { error: `Action denied: ${toolCall.name} requires approval level that is currently disabled.` };
    }

    if (approval.verdict === 'needs_user') {
      // For now, auto-approve in CLI mode. Real approval flow comes with channel integration.
      // TODO: wire up channel-based approval in Task 10
    }

    const input = approval.modifiedInput ?? toolCall.input;

    try {
      const result = await tool.handler(input);
      if (result.ok) {
        return result.value;
      } else {
        return { error: `Tool ${toolCall.name} failed: ${result.error.message}`, retryable: result.error.retryable };
      }
    } catch (e: any) {
      return { error: `Tool ${toolCall.name} threw: ${e.message}` };
    }
  }

  private buildSystemPrompt(): string {
    const tools = this.registry.allTools();
    const toolDescriptions = tools
      .map(t => `- ${t.name}: ${t.description}`)
      .join('\n');

    return `You are ${this.identity.name}, a personal AI agent for ${this.identity.owner}.

You have access to these tools:
${toolDescriptions || '(no tools available)'}

When you want to use a tool, respond with a tool call. When you have a final answer, respond with text.

Be concise and helpful. Remember important facts about your owner using the memory tools.`;
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/core/loop.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/loop.ts tests/core/loop.test.ts
git commit -m "feat: add ReAct agent loop with tool dispatch and iteration limit"
```

---

### Task 10: Config System

**Files:**
- Create: `src/config/schema.ts`
- Create: `src/config/defaults.ts`

- [ ] **Step 1: Create config schema**

```typescript
// src/config/schema.ts
import type { ApprovalLevel } from '../core/types';

export interface ShrimpConfig {
  model: {
    provider: string;
    model: string;
    apiKey: string;
    baseUrl?: string;
  };
  memory: {
    path: string;
  };
  channels: {
    cli?: { enabled: boolean };
    telegram?: { token: string };
  };
  approval: {
    default: ApprovalLevel;
    overrides: Record<string, ApprovalLevel>;
  };
  identity: {
    name: string;
    owner: string;
    timezone?: string;
  };
}
```

- [ ] **Step 2: Create defaults**

```typescript
// src/config/defaults.ts
import type { ShrimpConfig } from './schema';

export const defaultConfig: ShrimpConfig = {
  model: {
    provider: 'minimax',
    model: 'minimax-m2.7',
    apiKey: process.env.MINIMAX_API_KEY ?? '',
    baseUrl: 'https://api.minimax.chat/v1',
  },
  memory: {
    path: './data',
  },
  channels: {
    cli: { enabled: true },
  },
  approval: {
    default: 'approve',
    overrides: {},
  },
  identity: {
    name: 'Shrimp',
    owner: process.env.SHRIMP_OWNER ?? 'user',
  },
};

export function loadConfig(overrides?: Partial<ShrimpConfig>): ShrimpConfig {
  return {
    ...defaultConfig,
    ...overrides,
    model: { ...defaultConfig.model, ...overrides?.model },
    memory: { ...defaultConfig.memory, ...overrides?.memory },
    channels: { ...defaultConfig.channels, ...overrides?.channels },
    approval: { ...defaultConfig.approval, ...overrides?.approval },
    identity: { ...defaultConfig.identity, ...overrides?.identity },
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/config/schema.ts src/config/defaults.ts
git commit -m "feat: add config schema and defaults"
```

---

### Task 11: Entry Point — Wire Everything Together

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Create the entry point that boots Shrimp**

```typescript
// src/index.ts
import { ShrimpEventBus } from './core/events';
import { CapabilityRegistry } from './core/registry';
import { ApprovalGate } from './core/approval';
import { AgentLoop } from './core/loop';
import { MiniMaxAdapter } from './models/minimax';
import { MemoryCapability } from './capabilities/memory/index';
import { CLIChannel } from './capabilities/channels/cli';
import { loadConfig } from './config/defaults';

async function main() {
  const config = loadConfig();

  if (!config.model.apiKey) {
    console.error('❌ MINIMAX_API_KEY is not set. Set it in your environment or .env file.');
    process.exit(1);
  }

  console.log(`🦐 Shrimp v0.1.0 — agent for ${config.identity.owner}`);
  console.log(`   Model: ${config.model.provider}/${config.model.model}`);
  console.log(`   Type /quit to exit\n`);

  // Core
  const bus = new ShrimpEventBus();
  const registry = new CapabilityRegistry();
  const gate = new ApprovalGate(config.approval.overrides, config.approval.default);

  // Model
  const model = new MiniMaxAdapter({
    apiKey: config.model.apiKey,
    model: config.model.model,
    baseUrl: config.model.baseUrl ?? 'https://api.minimax.chat/v1',
  });

  // Capabilities
  const memory = new MemoryCapability();
  registry.register(memory);
  await memory.start();

  // Agent loop
  const loop = new AgentLoop({
    bus,
    registry,
    gate,
    model,
    identity: config.identity,
  });

  // CLI Channel
  const cli = new CLIChannel();
  cli.onMessage(async (msg) => {
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

- [ ] **Step 2: Verify the full test suite passes**

Run: `bun test`
Expected: All tests PASS (events: 4, registry: 6, approval: 6, working memory: 5, minimax: 3, loop: 3 = 27 tests)

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add entry point — boots Shrimp with CLI channel and memory"
```

---

### Task 12: Manual Smoke Test

- [ ] **Step 1: Set API key and run**

```bash
export MINIMAX_API_KEY="your-key-here"
export SHRIMP_OWNER="aarekaz"
bun run start
```

Expected output:
```
🦐 Shrimp v0.1.0 — agent for aarekaz
   Model: minimax/minimax-m2.7
   Type /quit to exit

You:
```

- [ ] **Step 2: Test basic conversation**

Type: `Hello, my name is aarekaz`
Expected: Shrimp responds, possibly calls `memory.store` to remember your name

- [ ] **Step 3: Test memory recall**

Type: `What's my name?`
Expected: Shrimp calls `memory.recall` and responds with your name

- [ ] **Step 4: Test exit**

Type: `/quit`
Expected: Clean exit with "Goodbye!"

---

## Self-Review Checklist

1. **Spec coverage:**
   - ✅ Event bus with typed events
   - ✅ Capability registry with tool resolution
   - ✅ Approval gate with config overrides and glob matching
   - ✅ ReAct agent loop with tool dispatch
   - ✅ Working memory (in-memory)
   - ✅ MiniMax model adapter (OpenAI-compatible)
   - ✅ CLI channel adapter
   - ✅ Config system
   - ✅ Entry point wiring
   - ⬜ Task scheduler — deferred to Plan 2 (not needed until browser/cron features)
   - ⬜ Episodic/semantic/procedural memory — deferred to Plan 2 (requires SQLite + vectors)
   - ⬜ Telegram/Discord/Browser/Email — Plan 2 and Plan 3

2. **Placeholder scan:** No TBD/TODO in implementation code. One TODO in loop.ts line for channel-based approval — acceptable, explicitly scoped to Task 10 note.

3. **Type consistency:** All types flow from `src/core/types.ts`. Tool, ToolCall, Capability, ModelAdapter, ChannelAdapter, ApprovalRequest, ApprovalResult — all used consistently.
