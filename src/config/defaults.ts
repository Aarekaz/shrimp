import type { ShrimpConfig } from './schema';

export const defaultConfig: ShrimpConfig = {
  model: {
    provider: 'minimax',
    model: 'minimax-m2.7',
    apiKey: process.env.MINIMAX_API_KEY ?? '',
    baseUrl: 'https://api.minimax.chat/v1',
  },
  memory: {
    path: './data',
  },
  channels: {
    cli: { enabled: true },
  },
  approval: {
    default: 'approve',
    overrides: {},
  },
  identity: {
    name: 'Shrimp',
    owner: process.env.SHRIMP_OWNER ?? 'user',
  },
};

export function loadConfig(overrides?: Partial<ShrimpConfig>): ShrimpConfig {
  return {
    ...defaultConfig,
    ...overrides,
    model: { ...defaultConfig.model, ...overrides?.model },
    memory: { ...defaultConfig.memory, ...overrides?.memory },
    channels: { ...defaultConfig.channels, ...overrides?.channels },
    approval: { ...defaultConfig.approval, ...overrides?.approval },
    identity: { ...defaultConfig.identity, ...overrides?.identity },
  };
}
