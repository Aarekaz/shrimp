import type { ApprovalLevel, ApprovalRequest } from './types';

export type GateVerdict = 'approved' | 'denied';
export type DenialReason = 'never' | 'needs_user';

export interface GateResult {
  verdict: GateVerdict;
  modifiedInput?: Record<string, unknown>;
  reason?: DenialReason;
}

export type InteractiveApprovalFn = (request: ApprovalRequest) => Promise<GateVerdict>;

export class ApprovalGate {
  constructor(
    private overrides: Record<string, ApprovalLevel>,
    private defaultLevel: ApprovalLevel,
    private interactive?: InteractiveApprovalFn,
  ) {}

  async check(request: ApprovalRequest): Promise<GateResult> {
    const effectiveLevel = this.resolveLevel(request.toolName, request.level);

    switch (effectiveLevel) {
      case 'auto':
      case 'notify':
        return { verdict: 'approved' };
      case 'never':
        return { verdict: 'denied', reason: 'never' };
      case 'approve':
        if (this.interactive) {
          const verdict = await this.interactive(request);
          return verdict === 'approved'
            ? { verdict: 'approved' }
            : { verdict: 'denied', reason: 'needs_user' };
        }
        return { verdict: 'denied', reason: 'needs_user' };
    }
  }

  private resolveLevel(toolName: string, toolLevel: ApprovalLevel): ApprovalLevel {
    // Check exact match
    if (this.overrides[toolName] !== undefined) {
      return this.overrides[toolName];
    }
    // Check glob match (e.g., "payments.*")
    for (const [pattern, level] of Object.entries(this.overrides)) {
      if (pattern.endsWith('.*')) {
        const prefix = pattern.slice(0, -2);
        if (toolName.startsWith(prefix + '.')) {
          return level;
        }
      }
    }
    // Tool-level approval
    if (toolLevel !== this.defaultLevel) {
      return toolLevel;
    }
    // Config default
    return this.defaultLevel;
  }
}
