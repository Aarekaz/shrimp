import type { ApprovalLevel } from '../core/types';

export interface ShrimpConfig {
  model: {
    provider: string;
    model: string;
    apiKey: string;
    baseUrl?: string;
  };
  memory: {
    path: string;
  };
  channels: {
    cli?: { enabled: boolean };
    telegram?: { token: string };
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
