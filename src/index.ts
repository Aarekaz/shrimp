import { createShrimpServer } from './server';
import { CLIChannel } from './capabilities/channels/cli';

async function main() {
  const { bus, loop } = await createShrimpServer();

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
    } catch (e: any) {
      await cli.send(`Error: ${e.message}`);
    }
    cli.prompt();
  });
  cli.start();
}

main().catch(console.error);
