import type { Capability, Tool } from '../../core/types';
import { ok, err } from '../../core/types';

export interface ComputerConfig {
  baseUrl: string; // e.g., http://localhost:8000 for Open Computer Use
}

export class ComputerCapability implements Capability {
  name = 'computer';
  description = 'Control a computer — browse the web, run terminal commands, interact with the desktop';
  private baseUrl: string;

  constructor(config: ComputerConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
  }

  get tools(): Tool[] {
    return [
      {
        name: 'computer.browse',
        description: 'Navigate to a URL in the browser and return the page content or a screenshot.',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The URL to navigate to' },
            action: { type: 'string', enum: ['screenshot', 'content', 'click', 'type'], description: 'What to do on the page' },
            selector: { type: 'string', description: 'CSS selector for click/type actions' },
            text: { type: 'string', description: 'Text to type (for type action)' },
          },
          required: ['url'],
        },
        approvalLevel: 'auto' as const,
        handler: async (input: Record<string, unknown>) => {
          return this.sendCommand('browser', input);
        },
      },
      {
        name: 'computer.terminal',
        description: 'Run a command in the terminal. Returns stdout and stderr.',
        inputSchema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'The shell command to execute' },
            workdir: { type: 'string', description: 'Working directory (optional)' },
          },
          required: ['command'],
        },
        approvalLevel: 'approve' as const,
        handler: async (input: Record<string, unknown>) => {
          return this.sendCommand('terminal', input);
        },
      },
      {
        name: 'computer.screenshot',
        description: 'Take a screenshot of the current desktop state.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        approvalLevel: 'auto' as const,
        handler: async () => {
          return this.sendCommand('screenshot', {});
        },
      },
      {
        name: 'computer.click',
        description: 'Click at a specific position on the desktop.',
        inputSchema: {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'X coordinate' },
            y: { type: 'number', description: 'Y coordinate' },
            button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button' },
          },
          required: ['x', 'y'],
        },
        approvalLevel: 'notify' as const,
        handler: async (input: Record<string, unknown>) => {
          return this.sendCommand('click', input);
        },
      },
      {
        name: 'computer.type',
        description: 'Type text using the keyboard.',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Text to type' },
          },
          required: ['text'],
        },
        approvalLevel: 'notify' as const,
        handler: async (input: Record<string, unknown>) => {
          return this.sendCommand('type', input);
        },
      },
      {
        name: 'computer.file_read',
        description: 'Read a file from the computer.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Absolute file path' },
          },
          required: ['path'],
        },
        approvalLevel: 'auto' as const,
        handler: async (input: Record<string, unknown>) => {
          return this.sendCommand('file_read', input);
        },
      },
      {
        name: 'computer.file_write',
        description: 'Write content to a file on the computer.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Absolute file path' },
            content: { type: 'string', description: 'File content' },
          },
          required: ['path', 'content'],
        },
        approvalLevel: 'approve' as const,
        handler: async (input: Record<string, unknown>) => {
          return this.sendCommand('file_write', input);
        },
      },
    ];
  }

  private async sendCommand(
    action: string,
    params: Record<string, unknown>,
  ) {
    try {
      const response = await fetch(`${this.baseUrl}/api/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...params }),
      });

      if (!response.ok) {
        const text = await response.text();
        return err({
          code: 'COMPUTER_API_ERROR',
          message: `Computer API error ${response.status}: ${text}`,
          retryable: response.status >= 500,
        });
      }

      const data = await response.json();
      return ok(data);
    } catch (e: any) {
      return err({
        code: 'COMPUTER_CONNECTION_ERROR',
        message: `Cannot reach computer at ${this.baseUrl}: ${e.message}`,
        retryable: true,
      });
    }
  }

  async start(): Promise<void> {
    // Check if the computer is reachable
    try {
      const response = await fetch(`${this.baseUrl}/health`, { method: 'GET' });
      if (response.ok) {
        console.log(`  🖥️  Computer connected at ${this.baseUrl}`);
      } else {
        console.log(`  ⚠️  Computer at ${this.baseUrl} returned ${response.status} — tools registered but may fail`);
      }
    } catch {
      console.log(`  ⚠️  Computer at ${this.baseUrl} not reachable — tools registered but will fail until it's running`);
    }
  }

  async stop(): Promise<void> {}
}
