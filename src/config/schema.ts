import type { ApprovalLevel } from '../core/types';

export interface ShrimpConfig {
  model: {
    provider: string;
    model: string;
    apiKey: string;
    baseUrl?: string;
    maxTokens?: number;
  };
  memory: {
    path: string;
  };
  channels: {
    cli?: { enabled: boolean };
    telegram?: { token: string };
  };
  composio?: {
    apiKey: string;
    userId?: string;
    toolkits?: string[];
    maxTools?: number;
  };
  approval: {
    default: ApprovalLevel;
    overrides: Record<string, ApprovalLevel>;
  };
  identity: {
    name: string;
    owner: string;
    timezone?: string;
  };
}
