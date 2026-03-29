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
});
