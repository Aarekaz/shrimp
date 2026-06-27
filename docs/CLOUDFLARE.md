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
npx wrangler secret put SHRIMP_ACCESS_TOKEN
npm run deploy
```

Production URLs:

- `https://shrimp.anuragd.me`
- `https://shrimp-agent.aarekaz.workers.dev`

The hosted UI prompts for the access token and stores it in browser local storage. API routes under `/api/agent/*` reject requests without `Authorization: Bearer <token>` when the secret is configured.

## Free-Mode Guardrails

Free mode uses:

- Workers AI default model
- Current default: `@cf/zai-org/glm-4.7-flash`
- `SHRIMP_MAX_ITERATIONS=6`
- Short message history window
- No browser automation
- No sandbox execution
- No paid external model unless configured explicitly

If Cloudflare free-tier limits are exceeded, requests should fail closed with a clear error.

## MVP Commands

```text
/remember fact I prefer dark mode
/recall dark mode
/fetch https://example.com
/remind 5 Stand up
/approvals
```
