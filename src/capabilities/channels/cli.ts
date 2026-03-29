import * as readline from 'node:readline';
import type { ChannelAdapter, IncomingMessage, SendOptions } from '../../core/types';

export class CLIChannel implements ChannelAdapter {
  name = 'cli';
  private messageHandler: ((msg: IncomingMessage) => void) | null = null;
  private rl: readline.Interface | null = null;

  async send(message: string, _options?: SendOptions): Promise<void> {
    console.log(`\n🦐 Shrimp: ${message}`);
  }

  onMessage(handler: (msg: IncomingMessage) => void): void {
    this.messageHandler = handler;
  }

  start(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.rl.setPrompt('You: ');
    this.rl.prompt();

    this.rl.on('line', (line: string) => {
      const text = line.trim();
      if (!text) {
        this.rl?.prompt();
        return;
      }

      if (text === '/quit' || text === '/exit') {
        console.log('\n🦐 Goodbye!');
        process.exit(0);
      }

      if (this.messageHandler) {
        this.messageHandler({
          channel: 'cli',
          from: 'user',
          text,
        });
      }
    });
  }

  prompt(): void {
    this.rl?.prompt();
  }

  stop(): void {
    this.rl?.close();
    this.rl = null;
  }
}
