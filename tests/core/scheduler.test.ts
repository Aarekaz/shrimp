import { describe, it, expect, mock } from 'bun:test';
import { Scheduler } from '../../src/core/scheduler';

describe('Scheduler', () => {
  it('runs a one-time task at the right time', async () => {
    const scheduler = new Scheduler();
    const fn = mock(() => {});
    scheduler.once('test-once', fn, 50); // 50ms from now
    await new Promise(r => setTimeout(r, 100));
    expect(fn).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('runs a repeating task', async () => {
    const scheduler = new Scheduler();
    const fn = mock(() => {});
    scheduler.every('test-repeat', fn, 50); // every 50ms
    await new Promise(r => setTimeout(r, 180));
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2);
    scheduler.stop();
  });

  it('cancels a task', async () => {
    const scheduler = new Scheduler();
    const fn = mock(() => {});
    scheduler.every('test-cancel', fn, 50);
    scheduler.cancel('test-cancel');
    await new Promise(r => setTimeout(r, 100));
    expect(fn).toHaveBeenCalledTimes(0);
    scheduler.stop();
  });

  it('lists active tasks', () => {
    const scheduler = new Scheduler();
    scheduler.every('task-a', () => {}, 1000);
    scheduler.once('task-b', () => {}, 5000);
    expect(scheduler.list()).toHaveLength(2);
    scheduler.stop();
  });
});
