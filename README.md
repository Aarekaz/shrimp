# Shrimp

An open source agent harness. The model is the brain, Shrimp is the body.

I kept building agents where the interesting part wasn't the LLM, it was everything around it: how it remembers things, how it talks to APIs, how it decides what needs human approval. So I pulled that layer out into its own thing.

Shrimp is a ReAct loop with an event bus, a capability registry, and an approval gate. Memory, browser control, email, app integrations... those are all adapters that plug in. Swap the model, swap the capabilities, the core doesn't change.

## Quick start

```bash
git clone https://github.com/aarekaz/shrimp.git
cd shrimp
bun install
```

Set up a model (pick one):
```bash
# OpenRouter (defaults to Kimi K2.6 — strong agentic tool use, cheap, recommended)
echo "OPENROUTER_API_KEY=your-key" >> .env

# Or Google Gemini (free tier available, fast)
echo "GEMINI_API_KEY=your-key" >> .env

# Or OpenAI, Groq, any OpenAI-compatible provider
echo "OPENAI_API_KEY=your-key" >> .env
```

Run it:
```bash
bun run start
```

You get a CLI chat and a web dashboard at `http://localhost:3737`.

## What it can do right now

Talk to Shrimp in the terminal or the web dashboard. It remembers things you tell it, delegates tasks to sub-agents, and shows you every tool call and reasoning step in real time.

```
You: My name is Anurag and I prefer dark mode in everything
  🧠 thinking... (iteration 1/10)
  🔧 calling memory.store({"content":"Name is Anurag, prefers dark mode","type":"fact"})
  ✅ result: {"stored":"a1b2c3..."}
  🧠 thinking... (iteration 2/10)

🦐 Shrimp: Got it, Anurag. I'll remember that.

You: Write me an email to my boss about taking Friday off
  🧠 thinking... (iteration 1/10)
  🔧 calling agents.delegate({"agent":"writer","task":"Write a professional email..."})
  ✅ result: {"agent":"writer","result":"Subject: Time Off Request..."}

🦐 Shrimp: Here's your email: ...
```

## Architecture

```
SHRIMP CORE
├── Agent Loop (ReAct: reason → act → observe → remember)
├── Event Bus (typed events, real-time, powers the dashboard)
├── Capability Registry (plug in new tools without touching core)
├── Approval Gate (auto/notify/approve/never per tool)
└── Model Adapter (any OpenAI-compatible API)

CAPABILITIES (pluggable)
├── Memory (in-memory or SuperMemory for persistent semantic search)
├── Sub-agents (researcher, writer, coder, planner)
├── Composio (1000+ app integrations: Gmail, Slack, GitHub, Calendar)
├── Computer (Open Computer Use: browser, terminal, desktop control)
└── CLI + Web Dashboard
```

Memory, sub-agents, computer control... they all implement the same interface. Register tools, the loop calls them when it needs to.

## Adding capabilities

Each capability is an adapter that conforms to one interface:

```typescript
interface Capability {
  name: string;
  description: string;
  tools: Tool[];
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

Register it and the agent picks it up:

```typescript
registry.register(myCapability);
```

The tools show up in the LLM's context automatically. The agent decides when to call them.

## Environment variables

Everything is optional except a model API key.

```bash
# Model (pick one, auto-detected in this order)
OPENROUTER_API_KEY=...          # OpenRouter (default: moonshotai/kimi-k2.6)
GEMINI_API_KEY=...              # Google Gemini
MINIMAX_API_KEY=...             # MiniMax M2.7
OPENAI_API_KEY=...              # OpenAI
GROQ_API_KEY=...                # Groq

# Or bring any OpenAI-compatible provider
SHRIMP_API_KEY=...
SHRIMP_BASE_URL=...
SHRIMP_MODEL=...

# Optional capabilities (set the key, get the capability)
SUPERMEMORY_API_KEY=...         # Persistent semantic memory
COMPOSIO_API_KEY=...            # 1000+ app integrations
COMPUTER_URL=http://localhost:8000  # Open Computer Use

# Config
SHRIMP_OWNER=your-name          # How the agent addresses you
SHRIMP_DASHBOARD_PORT=3737      # Web dashboard port
SHRIMP_TOOLKITS=GMAIL,GITHUB    # Filter Composio tools
```

## The dashboard

Run `bun run start` and open `http://localhost:3737`. You get:

- A chat interface (talk to Shrimp from the browser)
- A real-time activity feed (watch every THINK, CALL, RESULT, REPLY as it happens)
- A tools panel (see what capabilities are loaded and their approval levels)

The CLI and dashboard share the same agent. Messages from either show up in the activity feed.

## Sub-agents

Shrimp can delegate tasks to specialized sub-agents. Four come built in:

- **researcher**: deep dives, fact gathering, thorough answers
- **writer**: emails, messages, documents, creative content
- **coder**: writes, reviews, and explains code
- **planner**: breaks complex tasks into steps

The main agent decides when to delegate and to whom. Each sub-agent runs its own isolated reasoning loop. You can add your own or swap their models.

## Background agents

Shrimp can run agents in the background. Spawn them, check on them, send them messages:

```
You: Research quantum computing and write me a summary
  🔧 calling agents.spawn({"agent":"researcher","task":"Research quantum computing..."})
  ✅ result: {"task_id":"abc-123","status":"running"}

🦐 Shrimp: I've dispatched the researcher. It's working in the background.
           Use agents.tasks to check progress, or agents.send to give it more direction.
```

Background agents run async. The main agent continues working while they execute. When they finish, the result is available via `agents.tasks`.

## Coordinator mode

Set `SHRIMP_COORDINATOR=true` to run Shrimp as a pure orchestrator. In this mode, the main agent never executes tools directly — it only spawns and directs sub-agents.

```bash
SHRIMP_COORDINATOR=true bun run start
```

The coordinator breaks tasks into sub-tasks, spawns parallel workers, monitors progress, and synthesizes results. Good for complex multi-step work.

## Approval system

Not every tool should run without asking. The approval gate has four levels:

- `auto`: just do it (memory reads, browsing)
- `notify`: do it but tell the user (email replies to known threads)
- `approve`: ask first (booking, purchasing, new emails)
- `never`: disabled until explicitly enabled (financial transactions)

Each tool declares its level. Config overrides can change them. Glob patterns work too: `'payments.*': 'never'`.

## What's next

Things I want to build:

- Telegram adapter (talk to Shrimp from your phone)
- Persistent local memory (SQLite, no external API needed)
- Scheduler/heartbeat (proactive tasks, reminders)
- AgentMail (give Shrimp its own email inbox)
- Streaming responses in the dashboard
- MCP client (connect to any MCP server)

## Related projects

Shrimp works well with:

- [SuperMemory](https://supermemory.ai/) for persistent, semantic memory
- [Composio](https://composio.dev/) for app integrations
- [Open Computer Use](https://github.com/coasty-ai/open-computer-use) for computer control
- [Rivet](https://rivet.dev/) for serverless actor hosting
- [AgentComputer](https://www.agentcomputer.ai/) for persistent cloud sandboxes

## License

MIT
