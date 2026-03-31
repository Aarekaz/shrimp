import { ShrimpEventBus } from './core/events';
import { CapabilityRegistry } from './core/registry';
import { ApprovalGate } from './core/approval';
import { AgentLoop } from './core/loop';
import { OpenAICompatibleAdapter } from './models/openai-compatible';
import { MemoryCapability } from './capabilities/memory/index';
import { SuperMemoryCapability } from './capabilities/memory/supermemory';
import { ComposioCapability } from './capabilities/composio/index';
import { ComputerCapability } from './capabilities/computer/index';
import { CLIChannel } from './capabilities/channels/cli';
import { loadConfig } from './config/defaults';

async function main() {
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
  console.log(`   Type /quit to exit\n`);

  // Core
  const bus = new ShrimpEventBus();
  const registry = new CapabilityRegistry();
  const gate = new ApprovalGate(config.approval.overrides, config.approval.default);

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

  // Agent loop (verbose by default — see the agent think)
  const loop = new AgentLoop({
    bus,
    registry,
    gate,
    model,
    identity: config.identity,
    verbose: true,
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
