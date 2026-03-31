// Cost tracking — accumulates token usage and estimated cost per session

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  calls: number;
}

export interface CostState {
  totalCostUSD: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCalls: number;
  modelUsage: Record<string, ModelUsage>;
  startedAt: Date;
}

// Per-million-token pricing for known providers
const PRICING: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash':        { input: 0.15,  output: 0.60 },
  'gemini-2.5-pro':          { input: 1.25,  output: 10.0 },
  'gpt-4o':                  { input: 2.50,  output: 10.0 },
  'gpt-4o-mini':             { input: 0.15,  output: 0.60 },
  'claude-sonnet-4':         { input: 3.00,  output: 15.0 },
  'claude-haiku-4':          { input: 0.80,  output: 4.00 },
  'minimax-m2.7':            { input: 0.30,  output: 1.20 },
  'llama-3.3-70b-versatile': { input: 0.59,  output: 0.79 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Try exact match first, then partial match
  const pricing = PRICING[model] ?? Object.entries(PRICING).find(([k]) => model.includes(k))?.[1];
  if (!pricing) return 0; // unknown model, can't estimate
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

export class CostTracker {
  private state: CostState;

  constructor() {
    this.state = {
      totalCostUSD: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCalls: 0,
      modelUsage: {},
      startedAt: new Date(),
    };
  }

  add(model: string, inputTokens: number, outputTokens: number): void {
    const cost = estimateCost(model, inputTokens, outputTokens);

    this.state.totalCostUSD += cost;
    this.state.totalInputTokens += inputTokens;
    this.state.totalOutputTokens += outputTokens;
    this.state.totalCalls += 1;

    if (!this.state.modelUsage[model]) {
      this.state.modelUsage[model] = { inputTokens: 0, outputTokens: 0, costUSD: 0, calls: 0 };
    }
    const mu = this.state.modelUsage[model];
    mu.inputTokens += inputTokens;
    mu.outputTokens += outputTokens;
    mu.costUSD += cost;
    mu.calls += 1;
  }

  getState(): CostState {
    return this.state;
  }

  format(): string {
    const { totalCostUSD, totalInputTokens, totalOutputTokens, totalCalls } = this.state;
    const cost = totalCostUSD < 0.01 ? '<$0.01' : `$${totalCostUSD.toFixed(4)}`;
    return `${cost} | ${totalInputTokens + totalOutputTokens} tokens | ${totalCalls} calls`;
  }
}
