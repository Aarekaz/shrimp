import { describe, it, expect, mock } from 'bun:test';
import { ShrimpEventBus } from '../../src/core/events';

describe('ShrimpEventBus', () => {
  it('emits and receives typed events', () => {
    const bus = new ShrimpEventBus();
    const handler = mock(() => {});
    bus.on('channel:message', handler);
    bus.emit('channel:message', { channel: 'cli', from: 'user', text: 'hello' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ channel: 'cli', from: 'user', text: 'hello' });
  });

  it('supports once() for single-fire listeners', () => {
    const bus = new ShrimpEventBus();
    const handler = mock(() => {});
    bus.once('task:completed', handler);
    bus.emit('task:completed', { taskId: '1', result: 'done' });
    bus.emit('task:completed', { taskId: '2', result: 'done' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('supports off() to remove listeners', () => {
    const bus = new ShrimpEventBus();
    const handler = mock(() => {});
    bus.on('channel:message', handler);
    bus.off('channel:message', handler);
    bus.emit('channel:message', { channel: 'cli', from: 'user', text: 'hello' });
    expect(handler).toHaveBeenCalledTimes(0);
  });

  it('handles multiple listeners on the same event', () => {
    const bus = new ShrimpEventBus();
    const h1 = mock(() => {});
    const h2 = mock(() => {});
    bus.on('task:completed', h1);
    bus.on('task:completed', h2);
    bus.emit('task:completed', { taskId: '1', result: 'ok' });
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('isolates a throwing listener so siblings still run', () => {
    const bus = new ShrimpEventBus();
    const errorSpy = mock(() => {});
    const originalConsoleError = console.error;
    console.error = errorSpy;

    const bad = mock(() => { throw new Error('boom'); });
    const good = mock(() => {});
    bus.on('task:completed', bad);
    bus.on('task:completed', good);

    expect(() => bus.emit('task:completed', { taskId: '1', result: 'ok' })).not.toThrow();
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();

    console.error = originalConsoleError;
  });

  it('accepts async handlers and does not crash on rejection', async () => {
    const bus = new ShrimpEventBus();
    const errorSpy = mock(() => {});
    const originalConsoleError = console.error;
    console.error = errorSpy;

    bus.on('task:completed', async () => { throw new Error('async boom'); });
    bus.emit('task:completed', { taskId: '1', result: 'ok' });

    // Let the rejected promise settle
    await new Promise(r => setTimeout(r, 0));
    expect(errorSpy).toHaveBeenCalled();

    console.error = originalConsoleError;
  });
});
