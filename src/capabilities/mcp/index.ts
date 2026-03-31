import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import type { Capability, Tool } from '../../core/types';
import { ok, err } from '../../core/types';

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export class MCPCapability implements Capability {
  name: string;
  description: string;
  private client: Client;
  private transport: StdioClientTransport;
  private loadedTools: Tool[] = [];
  private config: MCPServerConfig;

  constructor(config: MCPServerConfig) {
    this.config = config;
    this.name = `mcp_${config.name}`;
    this.description = `MCP server: ${config.name}`;
    this.client = new Client({ name: 'shrimp', version: '0.1.0' }, { capabilities: {} });
    this.transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
    });
  }

  get tools(): Tool[] { return this.loadedTools; }

  async start(): Promise<void> {
    try {
      await this.client.connect(this.transport);
      const { tools } = await this.client.listTools();

      this.loadedTools = tools.map(mcpTool => ({
        name: `mcp.${this.config.name}.${mcpTool.name}`,
        description: mcpTool.description ?? mcpTool.name,
        parameters: z.record(z.unknown()),
        rawInputSchema: mcpTool.inputSchema as Record<string, unknown>,
        approvalLevel: 'notify' as const,
        handler: async (input: Record<string, unknown>) => {
          try {
            const result = await this.client.callTool({ name: mcpTool.name, arguments: input });
            const text = result.content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text)
              .join('\n');
            return ok({ title: `mcp.${mcpTool.name}`, output: text || result.content });
          } catch (e: any) {
            return err({ code: 'MCP_ERROR', message: e.message, retryable: true });
          }
        },
      }));

      console.log(`  🔗 MCP ${this.config.name}: ${this.loadedTools.length} tools loaded`);
    } catch (e: any) {
      console.log(`  ⚠️ MCP ${this.config.name} failed to connect: ${e.message}`);
    }
  }

  async stop(): Promise<void> {
    try { await this.client.close(); } catch {}
  }
}
