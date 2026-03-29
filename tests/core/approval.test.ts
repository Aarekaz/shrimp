import { describe, it, expect } from 'bun:test';
import { ApprovalGate } from '../../src/core/approval';
import type { ApprovalLevel } from '../../src/core/types';

describe('ApprovalGate', () => {
  it('auto-approves tools with level "auto"', async () => {
    const gate = new ApprovalGate({}, 'approve');
    const result = await gate.check({
      taskId: '1', toolName: 'memory.store',
      toolInput: { key: 'name', value: 'test' },
      description: 'Store a fact', level: 'auto',
    });
    expect(result.verdict).toBe('approved');
  });

  it('denies tools with level "never"', async () => {
    const gate = new ApprovalGate({}, 'approve');
    const result = await gate.check({
      taskId: '1', toolName: 'payments.charge',
      toolInput: { amount: 100 },
      description: 'Charge $100', level: 'never',
    });
    expect(result.verdict).toBe('denied');
  });

  it('applies config overrides over tool-level approval', async () => {
    const overrides: Record<string, ApprovalLevel> = { 'browser.fill': 'auto' };
    const gate = new ApprovalGate(overrides, 'approve');
    const result = await gate.check({
      taskId: '1', toolName: 'browser.fill',
      toolInput: { selector: '#name', value: 'test' },
      description: 'Fill form field', level: 'approve',
    });
    expect(result.verdict).toBe('approved');
  });

  it('applies glob overrides', async () => {
    const overrides: Record<string, ApprovalLevel> = { 'payments.*': 'never' };
    const gate = new ApprovalGate(overrides, 'approve');
    const result = await gate.check({
      taskId: '1', toolName: 'payments.charge',
      toolInput: { amount: 50 },
      description: 'Charge $50', level: 'approve',
    });
    expect(result.verdict).toBe('denied');
  });

  it('falls back to config default when no override matches', async () => {
    const gate = new ApprovalGate({}, 'auto');
    const result = await gate.check({
      taskId: '1', toolName: 'unknown.tool',
      toolInput: {},
      description: 'Do something', level: 'auto',
    });
    expect(result.verdict).toBe('approved');
  });

  it('returns "needs_user" for approve-level tools', async () => {
    const gate = new ApprovalGate({}, 'approve');
    const result = await gate.check({
      taskId: '1', toolName: 'email.send',
      toolInput: { to: 'someone@test.com' },
      description: 'Send email', level: 'approve',
    });
    expect(result.verdict).toBe('needs_user');
  });
});
