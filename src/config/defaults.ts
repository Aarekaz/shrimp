import type { ShrimpConfig } from './schema';

// Well-known provider presets
const PROVIDERS: Record<string, { baseUrl: string; model: string; envKey: string }> = {
  gemini:     { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', envKey: 'GEMINI_API_KEY' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'nvidia/nemotron-nano-9b-v2:free', envKey: 'OPENROUTER_API_KEY' },
  minimax:    { baseUrl: 'https://api.minimax.chat/v1', model: 'minimax-m2.7', envKey: 'MINIMAX_API_KEY' },
  openai:     { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', envKey: 'OPENAI_API_KEY' },
  groq:       { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', envKey: 'GROQ_API_KEY' },
  ollama:     { baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', envKey: '' },
};

function detectProvider(): { provider: string; apiKey: string; model: string; baseUrl: string } {
  // Check SHRIMP_MODEL_PROVIDER first for explicit selection
  const explicit = process.env.SHRIMP_MODEL_PROVIDER;
  if (explicit && PROVIDERS[explicit]) {
    const p = PROVIDERS[explicit];
    return {
      provider: explicit,
      apiKey: process.env[p.envKey] ?? process.env.SHRIMP_API_KEY ?? '',
      model: process.env.SHRIMP_MODEL ?? p.model,
      baseUrl: process.env.SHRIMP_BASE_URL ?? p.baseUrl,
    };
  }

  // Auto-detect from available API keys
  for (const [name, preset] of Object.entries(PROVIDERS)) {
    if (name === 'ollama') continue; // skip ollama in auto-detect (no key needed)
    const key = process.env[preset.envKey];
    if (key) {
      return {
        provider: name,
        apiKey: key,
        model: process.env.SHRIMP_MODEL ?? preset.model,
        baseUrl: process.env.SHRIMP_BASE_URL ?? preset.baseUrl,
      };
    }
  }

  // Fallback: check generic SHRIMP_API_KEY + SHRIMP_BASE_URL for custom providers
  if (process.env.SHRIMP_API_KEY && process.env.SHRIMP_BASE_URL) {
    return {
      provider: 'custom',
      apiKey: process.env.SHRIMP_API_KEY,
      model: process.env.SHRIMP_MODEL ?? 'default',
      baseUrl: process.env.SHRIMP_BASE_URL,
    };
  }

  // Nothing found
  return { provider: 'none', apiKey: '', model: '', baseUrl: '' };
}

const detected = detectProvider();

export const defaultConfig: ShrimpConfig = {
  model: {
    provider: detected.provider,
    model: detected.model,
    apiKey: detected.apiKey,
    baseUrl: detected.baseUrl,
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
    composio: overrides?.composio ?? defaultConfig.composio,
    approval: { ...defaultConfig.approval, ...overrides?.approval },
    identity: { ...defaultConfig.identity, ...overrides?.identity },
  };
}
