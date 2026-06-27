# Shrimp Polished Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Shrimp from a strong local agent harness into a polished developer product that is easy to install, safe to operate, pleasant to use daily, and credible as an open-source project.

**Architecture:** Keep the core loop small and stable. Add product polish around it through an interactive approval service, a real dashboard control surface, first-run onboarding, package/distribution entrypoints, docs/examples, and release-grade verification. Keep each track independently shippable so Shrimp improves after every phase.

**Tech Stack:** Bun, TypeScript, Hono, SQLite via `bun:sqlite`, Server-Sent Events, vanilla dashboard assets served from `src/dashboard/public`, existing capability system, existing Bun test suite.

---

## Product Definition

Shrimp is polished when a new developer can:

1. Install it from the README without repo-specific knowledge.
2. Configure a model and optional capabilities without reading source code.
3. Start Shrimp and immediately understand what is loaded, what is safe, and what it can do.
4. Approve or deny sensitive tool calls from the dashboard or CLI.
5. Inspect sessions, memory, tasks, cost, tools, and errors from the dashboard.
6. Resume past work without knowing database internals.
7. Extend Shrimp with a new capability from a documented template.
8. Run tests, typecheck, and release checks with one documented command.

## Product Positioning

Primary audience:

- Developers building personal agents, local agents, or app-integrated assistants.
- Agent infrastructure builders who want a small body/runtime around any model.
- People comparing Shrimp to one-off ReAct scripts, not to enterprise orchestration suites.

Core promise:

> Shrimp is the body for an AI agent: tools, memory, approvals, sessions, events, and channels around whatever model you choose.

What to avoid:

- Generic "AI dashboard" language.
- Over-promising autonomy before approval and recovery flows are complete.
- Adding more integrations before the existing product loop feels trustworthy.

## File Structure Plan

Create or modify these files as the work progresses:

- `tsconfig.json` - make typecheck usable for both `src` and `tests`.
- `package.json` - add product scripts for typecheck, check, package smoke tests, and CLI bin.
- `.env.example` - canonical first-run configuration sample.
- `src/core/approval.ts` - support pending interactive approvals.
- `src/core/approval-store.ts` - hold approval requests and await decisions.
- `src/core/types.ts` - add typed approval decision payloads.
- `src/core/events.ts` - emit approval requested/resolved events.
- `src/core/loop.ts` - wait for approval decisions when an interactive store is configured.
- `src/server.ts` - wire the approval store into the loop and dashboard.
- `src/index.ts` - keep CLI startup clean; add helpful startup guidance.
- `src/dashboard/server.ts` - add approval, memory, cost, task, session, and health endpoints.
- `src/dashboard/public/index.html` - split or evolve dashboard UI into a real control surface.
- `src/dashboard/public/styles.css` - move dashboard styles out of the HTML file.
- `src/dashboard/public/app.js` - move dashboard behavior out of the HTML file.
- `src/capabilities/memory/index.ts` - expose memory list/delete operations in a dashboard-friendly way.
- `src/capabilities/memory/sqlite-store.ts` - add list/count helpers if missing.
- `src/core/session.ts` - support session title updates and session deletion.
- `src/core/cost.ts` - expose stable cost snapshot fields for UI display.
- `src/cli/init.ts` - generate `.env` and optional starter config.
- `src/cli/main.ts` - move CLI boot logic out of `src/index.ts`.
- `src/config/defaults.ts` - make provider detection messages match first-run flow.
- `README.md` - rewrite around first run, trust model, dashboard tour, extension path, and release status.
- `docs/GETTING_STARTED.md` - guided install and first task.
- `docs/TRUST_AND_APPROVALS.md` - approval model, default policy, and examples.
- `docs/CAPABILITIES.md` - how capabilities work and how to create one.
- `docs/DASHBOARD.md` - dashboard views and endpoints.
- `docs/RELEASING.md` - release process.
- `examples/capability-weather.ts` - minimal capability example.
- `examples/shrimp.config.example.ts` - example configuration file if config file support is added.
- `tests/core/approval-store.test.ts` - pending approval behavior.
- `tests/core/loop.test.ts` - loop waits for approval and handles approve/deny.
- `tests/dashboard/server.test.ts` - dashboard endpoints.
- `tests/core/session.test.ts` - session title/delete coverage.
- `tests/capabilities/memory/sqlite-store.test.ts` - list/delete/count coverage.

## Phase 0: Product Baseline And Health

### Task 0.1: Make Typecheck A Real Gate

**Files:**
- Modify: `tsconfig.json`
- Modify: `package.json`

- [ ] **Step 1: Change `tsconfig.json` so included tests are under the root directory**

Use this exact shape:

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
    "rootDir": ".",
    "types": ["bun-types"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 2: Add product scripts**

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "start": "bun run src/index.ts",
    "test": "bun test",
    "typecheck": "bun x tsc --noEmit",
    "check": "bun run typecheck && bun test",
    "dev": "bun --watch run src/index.ts"
  }
}
```

- [ ] **Step 3: Verify**

Run:

```bash
bun run check
```

Expected:

```text
0 TypeScript errors
78+ tests pass
0 tests fail
```

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json package.json
git commit -m "chore: make typecheck part of product health"
```

### Task 0.2: Freeze The Current Product Contract

**Files:**
- Create: `docs/PRODUCT_CONTRACT.md`

- [ ] **Step 1: Create the product contract**

Write:

```markdown
# Shrimp Product Contract

Shrimp is an open-source agent harness. The model is the brain; Shrimp is the body.

## Core Contract

- The agent loop accepts user messages and streams assistant output.
- Tools are contributed by capabilities.
- Every tool declares a schema, read/write behavior, and approval level.
- Sensitive actions route through the approval gate.
- Sessions persist locally.
- Memory persists locally unless SuperMemory is configured.
- The dashboard reflects the same runtime as the CLI.

## Product Quality Bar

- `bun run check` passes before release.
- The dashboard supports chat, activity, tools, approvals, sessions, memory, tasks, and cost.
- A new user can run Shrimp from the README with one model key.
- Every public claim in README maps to working code or a documented limitation.
```

- [ ] **Step 2: Commit**

```bash
git add docs/PRODUCT_CONTRACT.md
git commit -m "docs: define Shrimp product contract"
```

## Phase 1: Trust And Approval UX

This is the highest-leverage product phase. Shrimp cannot feel trustworthy while approve-level actions are simply denied.

### Task 1.1: Add Pending Approval Store

**Files:**
- Create: `src/core/approval-store.ts`
- Modify: `src/core/types.ts`
- Test: `tests/core/approval-store.test.ts`

- [ ] **Step 1: Add approval decision types**

In `src/core/types.ts`, extend approval types with:

```ts
export type ApprovalDecision = 'approved' | 'denied';

export interface PendingApproval {
  taskId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  description: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
}
```

- [ ] **Step 2: Implement `ApprovalStore`**

Create `src/core/approval-store.ts`:

```ts
import type { ApprovalDecision, ApprovalRequest, PendingApproval } from './types';

interface Waiter {
  resolve: (decision: ApprovalDecision) => void;
  timeout: Timer;
}

export class ApprovalStore {
  private pending = new Map<string, PendingApproval>();
  private waiters = new Map<string, Waiter>();

  request(request: ApprovalRequest): PendingApproval {
    const pending: PendingApproval = {
      taskId: request.taskId,
      toolName: request.toolName,
      toolInput: request.toolInput,
      description: request.description,
      requestedAt: new Date().toISOString(),
      status: 'pending',
    };
    this.pending.set(request.taskId, pending);
    return pending;
  }

  wait(taskId: string, timeoutMs = 120000): Promise<ApprovalDecision> {
    return new Promise(resolve => {
      const timeout = setTimeout(() => {
        const current = this.pending.get(taskId);
        if (current && current.status === 'pending') {
          current.status = 'expired';
          this.pending.set(taskId, current);
        }
        this.waiters.delete(taskId);
        resolve('denied');
      }, timeoutMs);
      this.waiters.set(taskId, { resolve, timeout });
    });
  }

  decide(taskId: string, decision: ApprovalDecision): boolean {
    const current = this.pending.get(taskId);
    if (!current || current.status !== 'pending') return false;
    current.status = decision;
    this.pending.set(taskId, current);
    const waiter = this.waiters.get(taskId);
    if (waiter) {
      clearTimeout(waiter.timeout);
      this.waiters.delete(taskId);
      waiter.resolve(decision);
    }
    return true;
  }

  list(): PendingApproval[] {
    return Array.from(this.pending.values()).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }

  get(taskId: string): PendingApproval | undefined {
    return this.pending.get(taskId);
  }
}
```

- [ ] **Step 3: Test approval store behavior**

Create `tests/core/approval-store.test.ts` with tests for:

- `request()` stores a pending item.
- `decide(taskId, 'approved')` resolves `wait()`.
- `decide(taskId, 'denied')` resolves `wait()`.
- expired approvals resolve as denied.
- deciding the same approval twice returns `false` on the second call.

- [ ] **Step 4: Verify**

```bash
bun test tests/core/approval-store.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/core/approval-store.ts tests/core/approval-store.test.ts
git commit -m "feat: add pending approval store"
```

### Task 1.2: Wire Interactive Approvals Into The Loop

**Files:**
- Modify: `src/server.ts`
- Modify: `src/core/loop.ts`
- Modify: `src/core/events.ts`
- Test: `tests/core/loop.test.ts`

- [ ] **Step 1: Add approval lifecycle events**

In `src/core/events.ts`, add:

```ts
'task:approval-resolved': { taskId: string; verdict: 'approved' | 'denied' | 'expired' };
```

- [ ] **Step 2: Instantiate `ApprovalStore` in `src/server.ts`**

Wire `ApprovalGate` with an interactive approver:

```ts
const approvalStore = new ApprovalStore();
const gate = new ApprovalGate(
  config.approval.overrides,
  config.approval.default,
  async (request) => {
    const pending = approvalStore.request(request);
    bus.emit('task:approval-needed', {
      taskId: pending.taskId,
      question: `Approve ${pending.description}?`,
      options: ['approve', 'deny'],
    });
    const decision = await approvalStore.wait(request.taskId, request.timeoutMs);
    bus.emit('task:approval-resolved', {
      taskId: request.taskId,
      verdict: decision,
    });
    return decision;
  },
);
```

- [ ] **Step 3: Pass `approvalStore` to `createDashboard`**

Extend `DashboardConfig` with `approvalStore`.

- [ ] **Step 4: Update loop tests**

In `tests/core/loop.test.ts`, add one test where an approve-level tool waits, the test resolves the approval, and the tool executes. Add one test where the approval is denied and the tool result contains a denial error.

- [ ] **Step 5: Verify**

```bash
bun test tests/core/approval.test.ts tests/core/approval-store.test.ts tests/core/loop.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/server.ts src/core/loop.ts src/core/events.ts tests/core/loop.test.ts
git commit -m "feat: wire interactive approval flow"
```

### Task 1.3: Add Dashboard Approval Endpoints And UI

**Files:**
- Modify: `src/dashboard/server.ts`
- Modify: `src/dashboard/public/index.html`
- Create: `tests/dashboard/server.test.ts`

- [ ] **Step 1: Add approval endpoints**

Add:

```ts
app.get('/api/approvals', (c) => {
  return c.json(approvalStore.list());
});

app.post('/api/approvals/:id/approve', (c) => {
  const ok = approvalStore.decide(c.req.param('id'), 'approved');
  return ok ? c.json({ approved: true }) : c.json({ error: 'Approval not pending' }, 409);
});

app.post('/api/approvals/:id/deny', (c) => {
  const ok = approvalStore.decide(c.req.param('id'), 'denied');
  return ok ? c.json({ denied: true }) : c.json({ error: 'Approval not pending' }, 409);
});
```

- [ ] **Step 2: Add approval tab to dashboard**

Add an `Approvals` tab. Show pending requests with:

- Tool name.
- JSON input preview.
- Requested time.
- Approve button.
- Deny button.

- [ ] **Step 3: Add SSE update behavior**

On `task:approval-needed`, refresh the approval list and show a visible pending badge. On `task:approval-resolved`, refresh the list and remove the pending badge.

- [ ] **Step 4: Test endpoints**

In `tests/dashboard/server.test.ts`, instantiate a dashboard with an `ApprovalStore`, create a request, call `GET /api/approvals`, approve it, then verify a second approve returns `409`.

- [ ] **Step 5: Verify**

```bash
bun test tests/dashboard/server.test.ts tests/core/approval-store.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/dashboard/server.ts src/dashboard/public/index.html tests/dashboard/server.test.ts
git commit -m "feat: add dashboard approval controls"
```

## Phase 2: Dashboard As Control Surface

### Task 2.1: Split Dashboard Assets

**Files:**
- Modify: `src/dashboard/public/index.html`
- Create: `src/dashboard/public/styles.css`
- Create: `src/dashboard/public/app.js`

- [ ] **Step 1: Move CSS into `styles.css`**

Keep the existing visual system but remove inline `<style>` from `index.html`.

- [ ] **Step 2: Move JavaScript into `app.js`**

Keep existing SSE, chat, tabs, tools, and markdown rendering behavior.

- [ ] **Step 3: Keep `index.html` structural**

`index.html` should include:

```html
<link rel="stylesheet" href="/styles.css">
<script src="/app.js" defer></script>
```

- [ ] **Step 4: Verify**

Run Shrimp with a model key and open `http://localhost:3737`.

Check:

- Chat input renders.
- Activity tab renders.
- Tools tab renders.
- SSE status becomes connected.

- [ ] **Step 5: Commit**

```bash
git add src/dashboard/public/index.html src/dashboard/public/styles.css src/dashboard/public/app.js
git commit -m "refactor: split dashboard assets"
```

### Task 2.2: Add Sessions Panel

**Files:**
- Modify: `src/core/session.ts`
- Modify: `src/dashboard/server.ts`
- Modify: `src/dashboard/public/app.js`
- Modify: `src/dashboard/public/index.html`
- Modify: `src/dashboard/public/styles.css`
- Test: `tests/core/session.test.ts`
- Test: `tests/dashboard/server.test.ts`

- [ ] **Step 1: Add session title update and delete methods**

In `SessionStore`, add:

```ts
rename(id: string, title: string): boolean
delete(id: string): boolean
```

`delete()` must remove messages before removing the session row.

- [ ] **Step 2: Add endpoints**

Add:

```ts
PATCH /api/sessions/:id
DELETE /api/sessions/:id
```

- [ ] **Step 3: Add Sessions tab**

The tab lists sessions ordered by update time. Each row shows title, updated time, message count if cheap to retrieve, Resume, Rename, Delete.

- [ ] **Step 4: Verify**

Run:

```bash
bun test tests/core/session.test.ts tests/dashboard/server.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/core/session.ts src/dashboard/server.ts src/dashboard/public/index.html src/dashboard/public/styles.css src/dashboard/public/app.js tests/core/session.test.ts tests/dashboard/server.test.ts
git commit -m "feat: add dashboard session browser"
```

### Task 2.3: Add Memory Panel

**Files:**
- Modify: `src/capabilities/memory/sqlite-store.ts`
- Modify: `src/capabilities/memory/index.ts`
- Modify: `src/dashboard/server.ts`
- Modify: `src/dashboard/public/app.js`
- Modify: `src/dashboard/public/index.html`
- Modify: `src/dashboard/public/styles.css`
- Test: `tests/capabilities/memory/sqlite-store.test.ts`
- Test: `tests/dashboard/server.test.ts`

- [ ] **Step 1: Add store list support**

Expose:

```ts
list(limit?: number): Promise<MemoryEntry[]>
count(): Promise<number>
```

- [ ] **Step 2: Add dashboard endpoints**

Add:

```ts
GET /api/memory
DELETE /api/memory/:id
```

These endpoints should work for local SQLite memory. If SuperMemory is active, return `501` with `{ error: 'Memory browser is only available for local SQLite memory' }`.

- [ ] **Step 3: Add Memory tab**

Show fact/episode/procedure type, content, timestamp, delete action, and search input.

- [ ] **Step 4: Verify**

Run:

```bash
bun test tests/capabilities/memory/sqlite-store.test.ts tests/dashboard/server.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/capabilities/memory src/dashboard tests/capabilities/memory/sqlite-store.test.ts tests/dashboard/server.test.ts
git commit -m "feat: add local memory browser"
```

### Task 2.4: Add Cost And Task Panels

**Files:**
- Modify: `src/dashboard/public/index.html`
- Modify: `src/dashboard/public/app.js`
- Modify: `src/dashboard/public/styles.css`
- Modify: `src/core/cost.ts`

- [ ] **Step 1: Stabilize cost snapshot shape**

Expose total tokens, total estimated cost, per-model rows, and last updated time from `CostTracker`.

- [ ] **Step 2: Add Cost tab**

Render:

- Total estimated cost.
- Total output tokens.
- Per-model table.

- [ ] **Step 3: Add Tasks tab**

Use existing `/api/tasks`. Render task id, agent, status, duration, prompt preview, result preview, and errors.

- [ ] **Step 4: Verify**

Run:

```bash
bun run check
```

Then manually spawn a background agent and confirm the task appears.

- [ ] **Step 5: Commit**

```bash
git add src/core/cost.ts src/dashboard/public
git commit -m "feat: show cost and agent tasks in dashboard"
```

### Task 2.5: Make Dashboard Mobile-Usable

**Files:**
- Modify: `src/dashboard/public/styles.css`
- Modify: `src/dashboard/public/index.html`

- [ ] **Step 1: Add responsive layout**

At widths under `800px`:

- Header remains fixed height.
- Sidebar becomes bottom tabbed panel or collapsible drawer.
- Chat input remains reachable.
- Messages use `max-width: 92%`.

- [ ] **Step 2: Add mobile verification notes**

Add comments in `styles.css` naming the two verified breakpoints:

```css
/* Verified at 390x844 and 1440x900. */
```

- [ ] **Step 3: Verify**

Use browser QA at:

- `390x844`
- `768x1024`
- `1440x900`

Check that no text overlaps, the send button is reachable, and tabs are usable.

- [ ] **Step 4: Commit**

```bash
git add src/dashboard/public/styles.css src/dashboard/public/index.html
git commit -m "feat: make dashboard responsive"
```

## Phase 3: First-Run Onboarding

### Task 3.1: Add `.env.example`

**Files:**
- Create: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Create `.env.example`**

Include:

```bash
# Pick one model provider.
OPENROUTER_API_KEY=
GEMINI_API_KEY=
MINIMAX_API_KEY=
OPENAI_API_KEY=
GROQ_API_KEY=

# Custom OpenAI-compatible provider.
SHRIMP_API_KEY=
SHRIMP_BASE_URL=
SHRIMP_MODEL=
SHRIMP_MAX_TOKENS=4096

# Identity.
SHRIMP_OWNER=user
SHRIMP_DASHBOARD_PORT=3737

# Optional capabilities.
SUPERMEMORY_API_KEY=
COMPOSIO_API_KEY=
SHRIMP_TOOLKITS=GMAIL,GITHUB
COMPUTER_URL=
SHRIMP_BROWSER=false
SHRIMP_BROWSER_HEADLESS=true
SHRIMP_MCP_SERVERS=
```

- [ ] **Step 2: Update README quick start**

Use:

```bash
cp .env.example .env
```

Then instruct users to set one model key.

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "docs: add first-run environment template"
```

### Task 3.2: Improve Missing-Key Startup

**Files:**
- Modify: `src/server.ts`
- Modify: `README.md`

- [ ] **Step 1: Replace bare missing-key exit text**

When no API key is found, print:

```text
Shrimp needs one model provider before it can start.

Fast path:
  cp .env.example .env
  echo "GEMINI_API_KEY=your-key" >> .env
  bun run start

Other providers:
  OPENROUTER_API_KEY, MINIMAX_API_KEY, OPENAI_API_KEY, GROQ_API_KEY
  or SHRIMP_API_KEY + SHRIMP_BASE_URL for OpenAI-compatible providers.
```

- [ ] **Step 2: Verify**

Run in a shell without model keys:

```bash
env -i PATH="$PATH" HOME="$HOME" bun run start
```

Expected: helpful setup message, process exits with code `1`.

- [ ] **Step 3: Commit**

```bash
git add src/server.ts README.md
git commit -m "polish: improve first-run setup guidance"
```

### Task 3.3: Add `shrimp init`

**Files:**
- Create: `src/cli/init.ts`
- Create: `src/cli/main.ts`
- Modify: `src/index.ts`
- Modify: `package.json`
- Test: `tests/cli/init.test.ts`

- [ ] **Step 1: Move startup into `src/cli/main.ts`**

Keep current `src/index.ts` as a thin entrypoint:

```ts
import { main } from './cli/main';

main().catch(console.error);
```

- [ ] **Step 2: Implement init command**

`bun run src/index.ts init` should create `.env` from `.env.example` when `.env` does not exist. If `.env` exists, print that it already exists and do not overwrite.

- [ ] **Step 3: Add bin entry**

In `package.json`:

```json
{
  "bin": {
    "shrimp": "./src/index.ts"
  }
}
```

- [ ] **Step 4: Test**

Add tests that run init in a temp directory and assert `.env` is created exactly once.

- [ ] **Step 5: Verify**

```bash
bun test tests/cli/init.test.ts
bun run check
```

- [ ] **Step 6: Commit**

```bash
git add src/cli src/index.ts package.json tests/cli/init.test.ts
git commit -m "feat: add shrimp init command"
```

## Phase 4: Distribution

### Task 4.1: Prepare npm Package Shape

**Files:**
- Modify: `package.json`
- Create: `README.npm.md` if npm copy needs to be shorter

- [ ] **Step 1: Add package metadata**

Add:

```json
{
  "name": "shrimp",
  "version": "0.2.0",
  "description": "Open-source agent harness. The body you give to any brain.",
  "license": "MIT",
  "type": "module",
  "files": [
    "src",
    "README.md",
    "docs",
    "examples",
    ".env.example"
  ],
  "keywords": [
    "agent",
    "ai",
    "llm",
    "harness",
    "tools",
    "mcp",
    "memory"
  ]
}
```

- [ ] **Step 2: Add pack smoke script**

Add:

```json
"pack:smoke": "bun pm pack --dry-run"
```

- [ ] **Step 3: Verify**

```bash
bun run pack:smoke
```

- [ ] **Step 4: Commit**

```bash
git add package.json README.npm.md
git commit -m "chore: prepare npm package metadata"
```

### Task 4.2: Add Docker Image

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Modify: `docs/GETTING_STARTED.md`

- [ ] **Step 1: Create Dockerfile**

Use Bun official image, install dependencies, expose `3737`, and run `bun run start`.

- [ ] **Step 2: Add `.dockerignore`**

Ignore:

```text
.git
node_modules
data
shrimp.db
shrimp.db-shm
shrimp.db-wal
.env
dist
```

- [ ] **Step 3: Verify**

```bash
docker build -t shrimp:local .
docker run --rm -p 3737:3737 --env-file .env shrimp:local
```

Expected: dashboard starts and prints `Dashboard: http://localhost:3737`.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile .dockerignore docs/GETTING_STARTED.md
git commit -m "chore: add Docker distribution path"
```

## Phase 5: Documentation And Examples

### Task 5.1: Rewrite README Around The Product Loop

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Use this README structure**

```markdown
# Shrimp

An open-source agent harness. The model is the brain; Shrimp is the body.

## Why Shrimp
## Quick Start
## Dashboard Tour
## Trust And Approvals
## Capabilities
## Memory And Sessions
## Background Agents
## Configuration
## Extending Shrimp
## Roadmap
## Development
## License
```

- [ ] **Step 2: Add a truth-status table**

Include:

```markdown
| Surface | Status |
| --- | --- |
| CLI chat | Working |
| Dashboard chat | Working |
| Approval UI | Working after Phase 1 |
| Local memory | Working |
| Session browser | Working after Phase 2 |
| npm package | Working after Phase 4 |
```

- [ ] **Step 3: Verify claims**

Every claim must map to a command, file, endpoint, or roadmap row.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for product onboarding"
```

### Task 5.2: Add Focused Docs

**Files:**
- Create: `docs/GETTING_STARTED.md`
- Create: `docs/TRUST_AND_APPROVALS.md`
- Create: `docs/CAPABILITIES.md`
- Create: `docs/DASHBOARD.md`
- Create: `docs/RELEASING.md`

- [ ] **Step 1: Write getting started**

Must include:

- Install.
- Create `.env`.
- Choose provider.
- Start.
- Send first message.
- Open dashboard.
- Stop process.

- [ ] **Step 2: Write trust and approvals**

Must include:

- `auto`, `notify`, `approve`, `never`.
- What happens in CLI.
- What happens in dashboard.
- How sub-agents inherit approval policy.
- Examples for browser, Composio, payments.

- [ ] **Step 3: Write capabilities guide**

Must include:

- Capability interface.
- Tool schema.
- Approval level.
- Read-only flag.
- Handler result format.
- Registration.

- [ ] **Step 4: Write dashboard guide**

Must include each tab and each endpoint.

- [ ] **Step 5: Write release guide**

Must include:

```bash
bun run check
bun run pack:smoke
docker build -t shrimp:local .
```

- [ ] **Step 6: Commit**

```bash
git add docs/GETTING_STARTED.md docs/TRUST_AND_APPROVALS.md docs/CAPABILITIES.md docs/DASHBOARD.md docs/RELEASING.md
git commit -m "docs: add product guides"
```

### Task 5.3: Add Capability Example

**Files:**
- Create: `examples/capability-weather.ts`
- Modify: `docs/CAPABILITIES.md`

- [ ] **Step 1: Create example**

Example should export a `WeatherCapability` with one read-only `weather.lookup` tool using Zod and returning a structured `ToolResult`.

- [ ] **Step 2: Link from docs**

Add:

```markdown
See `examples/capability-weather.ts` for a complete minimal capability.
```

- [ ] **Step 3: Verify**

```bash
bun run check
```

- [ ] **Step 4: Commit**

```bash
git add examples/capability-weather.ts docs/CAPABILITIES.md
git commit -m "docs: add minimal capability example"
```

## Phase 6: Product Reliability

### Task 6.1: Add Health Endpoint

**Files:**
- Modify: `src/dashboard/server.ts`
- Test: `tests/dashboard/server.test.ts`

- [ ] **Step 1: Add endpoint**

Return:

```json
{
  "ok": true,
  "version": "0.2.0",
  "tools": 0,
  "sessions": true,
  "memory": "local",
  "uptimeSeconds": 0
}
```

- [ ] **Step 2: Verify**

```bash
curl -s http://localhost:3737/api/health
```

- [ ] **Step 3: Commit**

```bash
git add src/dashboard/server.ts tests/dashboard/server.test.ts
git commit -m "feat: add health endpoint"
```

### Task 6.2: Add Error Recovery UX

**Files:**
- Modify: `src/dashboard/public/app.js`
- Modify: `src/dashboard/public/styles.css`
- Modify: `src/dashboard/server.ts`

- [ ] **Step 1: Standardize dashboard API errors**

All dashboard API errors return:

```json
{
  "error": "Human-readable message"
}
```

- [ ] **Step 2: Render errors visibly**

Dashboard errors appear in a fixed error region with retry action when retry is possible.

- [ ] **Step 3: Verify**

Manually test:

- Missing model key startup.
- Failed chat request.
- Approval request already resolved.
- Session not found.

- [ ] **Step 4: Commit**

```bash
git add src/dashboard/server.ts src/dashboard/public/app.js src/dashboard/public/styles.css
git commit -m "polish: improve dashboard error recovery"
```

### Task 6.3: Add Release Checklist

**Files:**
- Create: `docs/RELEASE_CHECKLIST.md`

- [ ] **Step 1: Add checklist**

Include:

```markdown
# Release Checklist

- [ ] `bun run check`
- [ ] `bun run pack:smoke`
- [ ] Start with OpenRouter or Gemini key
- [ ] Open dashboard
- [ ] Send chat message
- [ ] Trigger read-only tool
- [ ] Trigger approve-level tool and approve
- [ ] Trigger approve-level tool and deny
- [ ] Create memory
- [ ] Delete memory
- [ ] Resume session
- [ ] Spawn background agent
- [ ] Check `/api/health`
- [ ] Review README status table
```

- [ ] **Step 2: Commit**

```bash
git add docs/RELEASE_CHECKLIST.md
git commit -m "docs: add release checklist"
```

## Phase 7: Visual And Brand Polish

### Task 7.1: Make The Dashboard Feel Like A Tool, Not A Theme

**Files:**
- Modify: `src/dashboard/public/styles.css`
- Modify: `src/dashboard/public/index.html`

- [ ] **Step 1: Reduce decorative styling**

Keep dark mode and orange accent, but reduce glow, gradient, and novelty copy. Prioritize dense scanability.

- [ ] **Step 2: Make tabs operational**

Use tabs:

- Chat
- Activity
- Approvals
- Tools
- Sessions
- Memory
- Tasks
- Cost

- [ ] **Step 3: Improve empty states**

Each empty state should name the current state, not teach the whole product. Examples:

```text
No pending approvals
No background tasks
No memories stored
```

- [ ] **Step 4: Verify**

Open at desktop and mobile widths. Confirm the product reads as an operational agent console.

- [ ] **Step 5: Commit**

```bash
git add src/dashboard/public/styles.css src/dashboard/public/index.html
git commit -m "polish: refine dashboard visual system"
```

### Task 7.2: Add Public Screenshots Or Demo GIF

**Files:**
- Create: `docs/assets/dashboard-chat.png`
- Create: `docs/assets/dashboard-approvals.png`
- Modify: `README.md`

- [ ] **Step 1: Capture screenshots**

Capture:

- Chat with streamed response.
- Approval prompt.
- Tools/memory/session panel.

- [ ] **Step 2: Add to README**

Use real screenshots from the local product.

- [ ] **Step 3: Commit**

```bash
git add docs/assets README.md
git commit -m "docs: add product screenshots"
```

## Phase 8: Version 0.2 Release

### Task 8.1: Cut A Release Candidate

**Files:**
- Modify: `package.json`
- Modify: `docs/ROADMAP.md`
- Modify: `README.md`

- [ ] **Step 1: Set version**

Set package version to `0.2.0`.

- [ ] **Step 2: Update roadmap**

Mark completed Phase 1-7 items as done and move remaining ideas below a `Later` section.

- [ ] **Step 3: Run release checks**

```bash
bun run check
bun run pack:smoke
```

- [ ] **Step 4: Manual release check**

Run every item in `docs/RELEASE_CHECKLIST.md`.

- [ ] **Step 5: Commit**

```bash
git add package.json docs/ROADMAP.md README.md
git commit -m "chore: prepare 0.2.0 release candidate"
```

### Task 8.2: Publish

**Files:**
- No file changes unless release checks reveal drift.

- [ ] **Step 1: Tag release**

```bash
git tag v0.2.0
```

- [ ] **Step 2: Push**

```bash
git push origin main
git push origin v0.2.0
```

- [ ] **Step 3: Publish package when ready**

```bash
npm publish --access public
```

## Recommended Execution Order

1. Phase 0: make health checks reliable.
2. Phase 1: complete approvals.
3. Phase 2: make dashboard a control surface.
4. Phase 3: make first run obvious.
5. Phase 5: rewrite docs around the product loop.
6. Phase 6: add reliability and release checks.
7. Phase 7: visual/brand polish.
8. Phase 4 and Phase 8: package and publish after the product loop is trustworthy.

## Success Metrics

- `bun run check` passes locally.
- A fresh clone can start from README in under 10 minutes.
- Dashboard supports all operational views without source-code inspection.
- Approve-level tools can be approved and denied from the dashboard.
- README claims are traceable to code, docs, or status table.
- Release checklist passes before tagging `v0.2.0`.

## Self-Review

Spec coverage:

- Trust gap is covered by Phase 1.
- Dashboard product gap is covered by Phase 2 and Phase 7.
- First-run and distribution gap is covered by Phase 3 and Phase 4.
- Docs and examples gap is covered by Phase 5.
- Reliability and release gap is covered by Phase 6 and Phase 8.

Placeholder scan:

- The plan names concrete files, endpoints, commands, and expected checks.
- The plan avoids placeholder tasks and gives acceptance criteria for each product phase.

Type consistency:

- Approval types use `ApprovalDecision` and `PendingApproval` consistently.
- Dashboard endpoints use existing Hono routing style.
- Tests use existing Bun test conventions.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-15-polished-product.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per phase or task, review between phases, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.
