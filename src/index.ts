import { ShrimpEventBus } from './core/events';
import { CapabilityRegistry } from './core/registry';
import { ApprovalGate } from './core/approval';
import { AgentLoop } from './core/loop';
import { OpenAICompatibleAdapter } from './models/openai-compatible';
import { MemoryCapability } from './capabilities/memory/index';
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
