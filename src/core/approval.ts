import type { ApprovalLevel, ApprovalRequest } from './types';

export type GateVerdict = 'approved' | 'denied' | 'needs_user';

export interface GateResult {
  verdict: GateVerdict;
  modifiedInput?: Record<string, unknown>;
  reason?: string;
  consecutiveDenials?: number;
  escalated?: boolean;
  needsUser?: boolean;
}

export interface ApprovalGateOptions {
  maxConsecutiveDenials?: number;
}

export class ApprovalGate {
  private denialCounts = new Map<string, number>();

  constructor(
    private overrides: Record<string, ApprovalLevel>,
    private defaultLevel: ApprovalLevel,
    private options: ApprovalGateOptions = {},
  ) {}

  async check(request: ApprovalRequest): Promise<GateResult> {
    const effectiveLevel = this.resolveLevel(request.toolName, request.level);

    switch (effectiveLevel) {
      case 'auto':
        this.resetDenials(request.toolName);
        return { verdict: 'approved' };
      case 'notify':
        this.resetDenials(request.toolName);
        return { verdict: 'approved' };
      case 'never':
        return this.recordDenial(
          request.toolName,
          `${request.toolName} is disabled by the current approval policy.`,
          false,
        );
      case 'approve':
        return this.recordDenial(
          request.toolName,
          `${request.toolName} requires user approval before it can run.`,
          true,
        );
    }
  }

  private recordDenial(toolName: string, reason: string, needsUser: boolean): GateResult {
    const consecutiveDenials = (this.denialCounts.get(toolName) ?? 0) + 1;
    this.denialCounts.set(toolName, consecutiveDenials);

    const maxConsecutiveDenials = this.options.maxConsecutiveDenials ?? 2;
    if (consecutiveDenials >= maxConsecutiveDenials) {
      return {
        verdict: 'denied',
        reason: `${reason} Stop retrying this tool and ask the user to step in.`,
        consecutiveDenials,
        escalated: true,
        needsUser,
      };
    }

    return {
      verdict: needsUser ? 'needs_user' : 'denied',
      reason,
      consecutiveDenials,
      needsUser,
    };
  }

  private resetDenials(toolName: string): void {
    this.denialCounts.delete(toolName);
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
