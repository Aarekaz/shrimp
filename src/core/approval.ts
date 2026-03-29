import type { ApprovalLevel, ApprovalRequest } from './types';

export type GateVerdict = 'approved' | 'denied' | 'needs_user';

export interface GateResult {
  verdict: GateVerdict;
  modifiedInput?: Record<string, unknown>;
}

export class ApprovalGate {
  constructor(
    private overrides: Record<string, ApprovalLevel>,
    private defaultLevel: ApprovalLevel,
  ) {}

  async check(request: ApprovalRequest): Promise<GateResult> {
    const effectiveLevel = this.resolveLevel(request.toolName, request.level);

    switch (effectiveLevel) {
      case 'auto':
        return { verdict: 'approved' };
      case 'notify':
        return { verdict: 'approved' };
      case 'never':
        return { verdict: 'denied' };
      case 'approve':
        return { verdict: 'needs_user' };
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
