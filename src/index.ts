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
