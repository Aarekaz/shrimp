import type { ApprovalLevel, ApprovalRequest } from './types';

export type GateVerdict = 'approved' | 'denied';
export type DenialReason = 'never' | 'needs_user';

export interface GateResult {
  verdict: GateVerdict;
  modifiedInput?: Record<string, unknown>;
  reason?: DenialReason;
  denialMessage?: string;
  consecutiveDenials?: number;
  escalated?: boolean;
}

export interface ApprovalGateOptions {
  maxConsecutiveDenials?: number;
}

export type InteractiveApprovalFn = (request: ApprovalRequest) => Promise<GateVerdict>;

export class ApprovalGate {
  private denialCounts = new Map<string, number>();
  private interactive?: InteractiveApprovalFn;
  private options: ApprovalGateOptions;

  constructor(
    private overrides: Record<string, ApprovalLevel>,
    private defaultLevel: ApprovalLevel,
    interactiveOrOptions?: InteractiveApprovalFn | ApprovalGateOptions,
    options?: ApprovalGateOptions,
  ) {
    if (typeof interactiveOrOptions === 'function') {
      this.interactive = interactiveOrOptions;
      this.options = options ?? {};
    } else {
      this.options = interactiveOrOptions ?? {};
    }
  }

  async check(request: ApprovalRequest): Promise<GateResult> {
    const effectiveLevel = this.resolveLevel(request.toolName, request.level);

    switch (effectiveLevel) {
      case 'auto':
      case 'notify':
        this.resetDenials(request.toolName);
        return { verdict: 'approved' };
      case 'never':
        return this.recordDenial(
          request.toolName,
          'never',
          `${request.toolName} is disabled by the current approval policy.`,
        );
      case 'approve':
        if (this.interactive) {
          const verdict = await this.interactive(request);
          if (verdict === 'approved') {
            this.resetDenials(request.toolName);
            return { verdict: 'approved' };
          }
        }
        return this.recordDenial(
          request.toolName,
          'needs_user',
          `${request.toolName} requires user approval before it can run.`,
        );
    }
  }

  private recordDenial(toolName: string, reason: DenialReason, denialMessage: string): GateResult {
    const consecutiveDenials = (this.denialCounts.get(toolName) ?? 0) + 1;
    this.denialCounts.set(toolName, consecutiveDenials);

    const maxConsecutiveDenials = this.options.maxConsecutiveDenials ?? 2;
    if (consecutiveDenials >= maxConsecutiveDenials) {
      return {
        verdict: 'denied',
        reason,
        denialMessage: `${denialMessage} Stop retrying this tool and ask the user to step in.`,
        consecutiveDenials,
        escalated: true,
      };
    }

    return {
      verdict: 'denied',
      reason,
      denialMessage,
      consecutiveDenials,
    };
  }

  private resetDenials(toolName: string): void {
    this.denialCounts.delete(toolName);
  }

  private resolveLevel(toolName: string, toolLevel: ApprovalLevel): ApprovalLevel {
    if (this.overrides[toolName] !== undefined) {
      return this.overrides[toolName];
    }
    for (const [pattern, level] of Object.entries(this.overrides)) {
      if (pattern.endsWith('.*')) {
        const prefix = pattern.slice(0, -2);
        if (toolName.startsWith(prefix + '.')) {
          return level;
        }
      }
    }
    if (toolLevel !== this.defaultLevel) {
      return toolLevel;
    }
    return this.defaultLevel;
  }
}
