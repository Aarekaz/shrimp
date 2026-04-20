import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { z } from 'zod';
import { unlinkSync } from 'fs';
import { MemoryCapability } from '../../../src/capabilities/memory/index';
import { ProcedureStore } from '../../../src/capabilities/memory/procedures';
import { CapabilityRegistry } from '../../../src/core/registry';
import { ApprovalGate } from '../../../src/core/approval';
import { ShrimpEventBus } from '../../../src/core/events';
import type { Capability, Tool, ToolUseContext, ModelAdapter, ModelResponse, ModelChunk } from '../../../src/core/types';
import { ok } from '../../../src/core/types';

// Unique per-test path so WAL/SHM files from a previous test don't collide.
function makeDbPaths() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    main: `./data/test-procs-${stamp}.db`,
    procs: `./data/test-procs-${stamp}-procedures.db`,
  };
}

function cleanup(path: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    try { unlinkSync(path + suffix); } catch {}
  }
}

function makeTool(name: string): Tool {
  return {
    name,
    description: name,
    parameters: z.object({}),
    approvalLevel: 'auto',
    handler: async () => ok({ title: name, output: {} }),
  };
}

function makeCap(name: string, tools: Tool[]): Capability {
  return { name, description: name, tools, async start() {}, async stop() {} };
}

const nullModel: ModelAdapter = {
  async generate(): Promise<ModelResponse> { return { content: '', usage: { inputTokens: 0, outputTokens: 0 } }; },
  async *stream(): AsyncIterable<ModelChunk> { yield { delta: '' }; },
};

function makeCtx(registry: CapabilityRegistry): ToolUseContext {
  return {
    bus: new ShrimpEventBus(),
    registry,
    gate: new ApprovalGate({}, 'auto'),
    model: nullModel,
    identity: { name: 'Shrimp', owner: 'test' },
  };
}

describe('memory.procedures recall', () => {
  let cap: MemoryCapability;
  let paths: ReturnType<typeof makeDbPaths>;

  beforeEach(() => {
    paths = makeDbPaths();
    cap = new MemoryCapability(paths.main);
  });
  afterEach(() => {
    cleanup(paths.main);
    cleanup(paths.procs);
  });

  it('skips procedures whose tools no longer exist in the registry', async () => {
    // Seed the procedure store directly with a procedure whose tool vanished.
    const store = new ProcedureStore(paths.procs);
    store.save({
      id: 'p1',
      name: 'ghost-procedure',
      trigger: 'send an email',
      steps: ['browser.navigate', 'browser.fill', 'deprecated.tool'],
      createdAt: new Date(),
      usedCount: 5,
      lastUsedAt: new Date(),
    });
    store.close();

    const registry = new CapabilityRegistry();
    registry.register(makeCap('browser', [makeTool('browser.navigate'), makeTool('browser.fill')]));
    // Note: 'deprecated.tool' is NOT registered.

    const recall = cap.tools.find(t => t.name === 'memory.procedures')!;
    const result = await recall.handler({ query: 'send an email' }, makeCtx(registry));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value.output as any).found).toBe(false);
    }
  });

  it('returns a procedure whose tools all resolve in the registry', async () => {
    const store = new ProcedureStore(paths.procs);
    store.save({
      id: 'p1',
      name: 'good-procedure',
      trigger: 'open the browser',
      steps: ['browser.navigate', 'browser.click', 'browser.extract'],
      createdAt: new Date(),
      usedCount: 3,
      lastUsedAt: new Date(),
      demerits: 0,
    });
    store.close();

    const registry = new CapabilityRegistry();
    registry.register(makeCap('browser', [
      makeTool('browser.navigate'),
      makeTool('browser.click'),
      makeTool('browser.extract'),
    ]));

    const recall = cap.tools.find(t => t.name === 'memory.procedures')!;
    const result = await recall.handler({ query: 'open the browser' }, makeCtx(registry));

    expect(result.ok).toBe(true);
    if (result.ok) {
      const out = result.value.output as any;
      expect(out.found).toBe(true);
      expect(out.steps).toEqual(['browser.navigate', 'browser.click', 'browser.extract']);
    }
  });

  it('memory.procedures.forget demerits a procedure and eventually excludes it from recall', async () => {
    const store = new ProcedureStore(paths.procs);
    store.save({
      id: 'bad',
      name: 'misleading-procedure',
      trigger: 'do the thing',
      steps: ['browser.navigate'],
      createdAt: new Date(),
      usedCount: 10,
      lastUsedAt: new Date(),
      demerits: 0,
    });
    store.close();

    const registry = new CapabilityRegistry();
    registry.register(makeCap('browser', [makeTool('browser.navigate')]));

    const recall = cap.tools.find(t => t.name === 'memory.procedures')!;
    const forget = cap.tools.find(t => t.name === 'memory.procedures.forget')!;
    const ctx = makeCtx(registry);

    // First recall: should find it.
    const first = await recall.handler({ query: 'do the thing' }, ctx);
    expect(first.ok && (first.value.output as any).found).toBe(true);

    // Demerit it twice (threshold is 2: demerits < 2 is visible, so 2 hides it).
    const d1 = await forget.handler({ id: 'bad' });
    expect(d1.ok && (d1.value.output as any).demerited).toBe(true);
    const d2 = await forget.handler({ id: 'bad' });
    expect(d2.ok && (d2.value.output as any).demerited).toBe(true);

    // Recall again: should now be excluded.
    const third = await recall.handler({ query: 'do the thing' }, ctx);
    expect(third.ok && (third.value.output as any).found).toBe(false);
  });

  it('memory.procedures.forget reports false for an unknown id', async () => {
    const forget = cap.tools.find(t => t.name === 'memory.procedures.forget')!;
    const result = await forget.handler({ id: 'does-not-exist' });
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.value.output as any).demerited).toBe(false);
  });
});
