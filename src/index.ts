import { createShrimpServer } from './server';
import { CLIChannel } from './capabilities/channels/cli';

async function main() {
  const { bus, loop } = await createShrimpServer();

  console.log('   Type /quit to exit\n');

  const cli = new CLIChannel();
  cli.onMessage(async (msg) => {
    bus.emit('channel:message', { channel: 'cli', from: 'user', text: msg.text });
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
