import { ShrimpEventBus } from './core/events';
import { CapabilityRegistry } from './core/registry';
import { ApprovalGate } from './core/approval';
import { AgentLoop } from './core/loop';
import { OpenAICompatibleAdapter } from './models/openai-compatible';
import { MemoryCapability } from './capabilities/memory/index';
import { SuperMemoryCapability } from './capabilities/memory/supermemory';
import { ComposioCapability } from './capabilities/composio/index';
import { ComputerCapability } from './capabilities/computer/index';
import { AgentsCapability } from './capabilities/agents/index';
import { createDashboard } from './dashboard/server';
import { loadConfig } from './config/defaults';
import { SessionStore } from './core/session';

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
    console.error(`❌ No API key found. Set one of these environment variables:`);
    console.error(`   GEMINI_API_KEY     — Google Gemini (free at aistudio.google.com)`);
    console.error(`   OPENROUTER_API_KEY — OpenRouter (free models available)`);
    console.error(`   MINIMAX_API_KEY    — MiniMax M2.7`);
    console.error(`   OPENAI_API_KEY     — OpenAI`);
    console.error(`   GROQ_API_KEY       — Groq`);
    console.error(``);
    console.error(`   Or set SHRIMP_API_KEY + SHRIMP_BASE_URL for any OpenAI-compatible provider.`);
    process.exit(1);
  }

  console.log(`🦐 Shrimp v0.1.0 — agent for ${config.identity.owner}`);
  console.log(`   Provider: ${config.model.provider}`);
  console.log(`   Model: ${config.model.model}`);

  // Core
  const bus = new ShrimpEventBus();
  const registry = new CapabilityRegistry();
  const gate = new ApprovalGate(config.approval.overrides, config.approval.default);
  const sessionStore = new SessionStore(process.env.SHRIMP_DB_PATH ?? 'shrimp.db');

  // Model — one adapter for any OpenAI-compatible provider
  const model = new OpenAICompatibleAdapter({
    apiKey: config.model.apiKey,
    model: config.model.model,
    baseUrl: config.model.baseUrl ?? '',
  });

  // Memory — use SuperMemory if API key available, otherwise fall back to in-memory
  const supermemoryKey = process.env.SUPERMEMORY_API_KEY;
  if (supermemoryKey) {
    const smem = new SuperMemoryCapability({
      apiKey: supermemoryKey,
      userId: config.identity.owner,
    });
    registry.register(smem);
    await smem.start();
  } else {
    const memory = new MemoryCapability();
    registry.register(memory);
    await memory.start();
    console.log('  🧠 Using in-memory storage (set SUPERMEMORY_API_KEY for persistent memory)');
  }

  // Composio — load if API key is available
  const composioKey = config.composio?.apiKey ?? process.env.COMPOSIO_API_KEY;
  if (composioKey) {
    const composio = new ComposioCapability({
      apiKey: composioKey,
      userId: config.composio?.userId ?? 'default',
      toolkits: config.composio?.toolkits ?? process.env.SHRIMP_TOOLKITS?.split(','),
      maxTools: config.composio?.maxTools ?? 20,
    });
    await composio.start();
    if (composio.tools.length > 0) {
      registry.register(composio);
    }
  }

  // Computer — connect to Open Computer Use if URL is set
  const computerUrl = process.env.COMPUTER_URL;
  if (computerUrl) {
    const computer = new ComputerCapability({ baseUrl: computerUrl });
    await computer.start();
    if (computer.tools.length > 0) {
      registry.register(computer);
    }
  }

  // Sub-agents — specialized agents for delegation
  const agents = new AgentsCapability();

  // Built-in sub-agents using the same model (can be swapped to different models)
  agents.addAgent({
    name: 'researcher',
    description: 'Research agent — good at gathering information, summarizing findings, and answering factual questions in depth.',
    model,
    systemPrompt: `You are a research specialist. Your job is to provide thorough, well-structured answers to research questions. Be detailed and cite your reasoning. Organize your response with clear sections when appropriate.`,
    permissions: { 'memory.*': 'allow', 'agents.*': 'deny', 'computer.*': 'deny' },
  });

  agents.addAgent({
    name: 'writer',
    description: 'Writing agent — drafts emails, messages, documents, and creative content with the right tone.',
    model,
    systemPrompt: `You are a professional writer. Your job is to draft clear, well-written content. Match the tone and format to what's requested — formal for business emails, casual for messages, structured for documents. Always provide the complete draft, ready to use.`,
    permissions: { 'memory.recall': 'allow', 'agents.*': 'deny', 'computer.*': 'deny' },
  });

  agents.addAgent({
    name: 'coder',
    description: 'Coding agent — writes, reviews, and explains code. Supports any programming language.',
    model,
    systemPrompt: `You are an expert programmer. Your job is to write clean, correct, well-documented code. Always include the programming language. Explain your approach briefly. If reviewing code, point out bugs, improvements, and security issues.`,
    permissions: { 'memory.*': 'allow', 'computer.*': 'allow', 'agents.*': 'deny' },
  });

  agents.addAgent({
    name: 'planner',
    description: 'Planning agent — breaks down complex tasks into actionable steps, creates schedules, and organizes work.',
    model,
    systemPrompt: `You are a planning specialist. Your job is to take a complex goal and break it into clear, actionable steps. Number each step. Estimate effort where possible. Identify dependencies and blockers. Be practical, not theoretical.`,
    permissions: { 'memory.*': 'allow', 'agents.*': 'deny', 'computer.*': 'deny' },
  });

  registry.register(agents);
  await agents.start();

  // Agent loop (verbose by default — see the agent think)
  const loop = new AgentLoop({
    bus,
    registry,
    gate,
    model,
    modelName: config.model.model,
    identity: config.identity,
    verbose: true,
    sessionStore,
  });

  // Dashboard — web UI
  const dashboardPort = parseInt(process.env.SHRIMP_DASHBOARD_PORT ?? '3737');
  const dashboard = createDashboard({ port: dashboardPort, bus, registry, loop, sessionStore });
  const server = Bun.serve({
    port: dashboardPort,
    fetch: dashboard.fetch,
  });
  console.log(`  🌐 Dashboard: http://localhost:${server.port}`);

  return { bus, registry, loop, sessionStore, port: server.port };
}
