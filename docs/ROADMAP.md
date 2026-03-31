# Shrimp roadmap

What to build next, roughly in priority order. Check things off as they land.

## Patterns from Claude Code source

Things we saw in the Claude Code architecture that would make Shrimp better.

- [x] **Tool concurrency** — read-only tools run in parallel, writes serial (done)
- [ ] **ToolUseContext** — replace raw `Record<string, unknown>` handler input with a rich context object. Carry state accessors, file caches, abort signals.
- [x] **Memoized system prompt** — cached until tool count changes (done)
- [x] **Cost accumulation** — per-model token/cost tracking, GET /api/cost endpoint (done)
- [x] **Tool output truncation** — auto-truncate at 50K chars, 2K preview (done)
- [ ] **Denial tracking** — if a tool keeps getting denied, stop trying it. Escalate to user after N denials.
- [ ] **Async generator for full loop** — make `handleMessage` itself a generator (not just streaming). Enables cancellation mid-loop.
- [ ] **Feature gating** — conditional capability loading via build-time flags. Zero cost for disabled features.

## Core improvements

- [ ] **Telegram adapter** — talk to Shrimp from your phone
- [ ] **Scheduler/heartbeat** — "check X every hour", "remind me at 5pm", event-driven cron
- [ ] **AgentMail** — Shrimp gets its own email inbox, agent-to-agent via email
- [ ] **Persistent local memory (SQLite)** — no external API, local vector search with vectra
- [x] **Streaming responses** — words appear as they arrive (done)
- [x] **Zod tool schemas** — type-safe tool definitions (done)
- [x] **Structured ToolResult** — title, output, metadata (done)
- [x] **Permission rulesets** — per-agent allow/deny (done)
- [x] **SQLite sessions** — conversations survive restarts (done)
- [x] **Context window management** — auto-compact old messages (done)
- [x] **Client/server split** — createShrimpServer() (done)

## Capabilities

- [x] **Composio** — 1000+ SaaS integrations (done)
- [x] **SuperMemory** — persistent semantic memory (done)
- [x] **Open Computer Use** — browser, terminal, desktop (done)
- [x] **Multi-agent delegation** — researcher, writer, coder, planner (done)
- [ ] **MCP client** — connect to any MCP server as a capability
- [ ] **Browser capability (Playwright)** — built-in, no Open Computer Use dependency
- [ ] **Calendar integration** — Google Calendar via Composio or direct API
- [ ] **Payments** — Stripe or virtual card for agent purchases

## Dashboard

- [x] **Real-time event stream** — SSE with activity panel (done)
- [x] **Redesign** — neural command center aesthetic (done)
- [x] **Streaming chat** — words appear as they arrive (done)
- [ ] **Session browser** — load past conversations
- [ ] **Memory browser** — see all stored facts, search, delete
- [ ] **Cost display** — tokens used, estimated cost in footer
- [ ] **Mobile responsive** — use from phone
- [ ] **Agent graph view** — visual map of sub-agent delegations

## Distribution

- [x] **README** (done)
- [ ] **Docker image** — one-command deploy
- [ ] **`bunx shrimp init`** — scaffold a new agent project
- [ ] **npm publish** — `bun add shrimp`
