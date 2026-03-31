import { createShrimpServer } from './server';
import { CLIChannel } from './capabilities/channels/cli';
import { formatError } from './core/errors';

async function main() {
  const { bus, loop } = await createShrimpServer();

  const resumeId = process.env.SHRIMP_RESUME_SESSION;
  if (resumeId) {
    const loaded = loop.loadSession(resumeId);
    if (loaded) {
      console.log(`  📂 Resumed session: ${resumeId} (${loop.getHistory().length} messages)`);
    } else {
      console.log(`  ⚠️ Session ${resumeId} not found, starting fresh`);
    }
  }

  console.log('   Type /quit to exit\n');

  const cli = new CLIChannel();
  cli.onMessage(async (msg) => {
    bus.emit('channel:message', { channel: 'cli', from: 'user', text: msg.text });
    try {
      process.stdout.write('\n🦐 Shrimp: ');
      for await (const chunk of loop.handleMessageStreaming(msg.text)) {
        process.stdout.write(chunk);
        bus.emit('agent:chunk', { delta: chunk });
      }
      process.stdout.write('\n');
    } catch (e: unknown) {
      const err = formatError(e);
      bus.emit('agent:error', { message: err.message });
      await cli.send(`Error: ${err.message}`);
      if (err.detail && err.detail !== err.message) {
        console.log(`  (detail: ${err.detail.slice(0, 150)})`);
      }
    }
    cli.prompt();
  });
  cli.start();
}

main().catch(console.error);
