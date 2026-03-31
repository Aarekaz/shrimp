import { z } from 'zod';
import { Composio } from '@composio/core';
import type { Capability, Tool } from '../../core/types';
import { ok, err } from '../../core/types';

export interface ComposioConfig {
  apiKey: string;
  userId?: string;
  toolkits?: string[];   // e.g., ['GMAIL', 'GITHUB', 'SLACK']
  maxTools?: number;      // limit how many tools to register (default: 50)
}

interface RawComposioTool {
  name: string;
  description: string;
  parameters: {
    properties: Record<string, any>;
    required?: string[];
    type: string;
  };
}

export class ComposioCapability implements Capability {
  name = 'composio';
  description = 'Connect to 1000+ apps via Composio (Gmail, Slack, GitHub, Calendar, etc.)';
  private client: Composio;
  private config: ComposioConfig;
  private loadedTools: Tool[] = [];

  constructor(config: ComposioConfig) {
    this.config = config;
    this.client = new Composio({ apiKey: config.apiKey });
  }

  get tools(): Tool[] {
    return this.loadedTools;
  }

  async start(): Promise<void> {
    console.log('  🔌 Loading Composio tools...');

    try {
      const rawTools = await this.client.tools.getRawComposioTools({
        toolkits: this.config.toolkits,
        limit: this.config.maxTools ?? 50,
      }) as RawComposioTool[];

      this.loadedTools = rawTools.map(raw => this.wrapTool(raw));
      console.log(`  🔌 Loaded ${this.loadedTools.length} Composio tools`);

      if (this.loadedTools.length > 0) {
        const toolNames = this.loadedTools.slice(0, 5).map(t => t.name).join(', ');
        const more = this.loadedTools.length > 5 ? `, +${this.loadedTools.length - 5} more` : '';
        console.log(`  🔌 Tools: ${toolNames}${more}`);
      }
    } catch (e: any) {
      console.error(`  ❌ Failed to load Composio tools: ${e.message}`);
      this.loadedTools = [];
    }
  }

  async stop(): Promise<void> {}

  private wrapTool(raw: RawComposioTool): Tool {
    const userId = this.config.userId ?? 'default';

    return {
      name: `composio.${raw.name}`,
      description: raw.description || `Composio tool: ${raw.name}`,
      // Pass-through schema — Composio validates input itself
      parameters: z.record(z.unknown()),
      // Preserve the original JSON Schema so allToolsForLLM() exposes accurate parameter info
      rawInputSchema: {
        type: 'object',
        properties: raw.parameters?.properties ?? {},
        required: raw.parameters?.required ?? [],
      },
      approvalLevel: this.getApprovalLevel(raw.name),
      handler: async (input: Record<string, unknown>) => {
        try {
          const result = await this.client.tools.execute(raw.name, {
            userId,
            arguments: input,
          });
          return ok({ title: `composio.${raw.name}`, output: result });
        } catch (e: any) {
          return err({
            code: 'COMPOSIO_ERROR',
            message: e.message ?? 'Composio tool execution failed',
            retryable: true,
          });
        }
      },
    };
  }

  private getApprovalLevel(toolName: string): 'auto' | 'notify' | 'approve' | 'never' {
    // Read-only tools are auto-approved
    if (toolName.includes('LIST') || toolName.includes('GET') || toolName.includes('SEARCH') || toolName.includes('FETCH')) {
      return 'auto';
    }
    // Write actions need approval
    if (toolName.includes('SEND') || toolName.includes('CREATE') || toolName.includes('DELETE') || toolName.includes('UPDATE')) {
      return 'approve';
    }
    // Default to notify
    return 'notify';
  }
}
