import { describe, it, expect } from 'bun:test';
import { AgentTaskManager } from '../../src/core/tasks';

describe('AgentTaskManager', () => {
  it('creates a task in pending state', () => {
    const mgr = new AgentTaskManager();
    const task = mgr.create('researcher', 'Find info about X');
    expect(task.status).toBe('pending');
    expect(task.agentName).toBe('researcher');
  });

  it('transitions task to running', () => {
    const mgr = new AgentTaskManager();
    const task = mgr.create('researcher', 'Find info');
    mgr.start(task.id);
    expect(mgr.get(task.id)?.status).toBe('running');
  });

  it('completes a task with result', () => {
    const mgr = new AgentTaskManager();
    const task = mgr.create('researcher', 'Find info');
    mgr.start(task.id);
    mgr.complete(task.id, 'Found the info');
    const t = mgr.get(task.id);
    expect(t?.status).toBe('completed');
    expect(t?.result).toBe('Found the info');
  });

  it('fails a task with error', () => {
    const mgr = new AgentTaskManager();
    const task = mgr.create('researcher', 'Find info');
    mgr.start(task.id);
    mgr.fail(task.id, 'Network error');
    expect(mgr.get(task.id)?.status).toBe('failed');
  });

  it('lists running tasks', () => {
    const mgr = new AgentTaskManager();
    const t1 = mgr.create('researcher', 'Task 1');
    const t2 = mgr.create('writer', 'Task 2');
    mgr.start(t1.id);
    mgr.start(t2.id);
    mgr.complete(t1.id, 'Done');
    expect(mgr.running()).toHaveLength(1);
    expect(mgr.running()[0].agentName).toBe('writer');
  });

  it('queues messages for running tasks', () => {
    const mgr = new AgentTaskManager();
    const task = mgr.create('researcher', 'Find info');
    mgr.start(task.id);
    mgr.queueMessage(task.id, 'Also check Y');
    expect(mgr.consumeMessages(task.id)).toEqual(['Also check Y']);
    expect(mgr.consumeMessages(task.id)).toEqual([]); // consumed
  });
});
