import { describe, it, expect, afterEach } from 'bun:test';
import { SessionStore } from '../../src/core/session';
import { unlinkSync, existsSync } from 'fs';

const TEST_DB = './data/test-sessions.db';

function cleanup() {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
}

afterEach(() => {
  cleanup();
});

describe('SessionStore', () => {
  it('creates a new session', () => {
    const store = new SessionStore(TEST_DB);
    const session = store.create('My first session');

    expect(session.id).toBeTruthy();
    expect(session.title).toBe('My first session');
    expect(session.createdAt).toBeTruthy();
    expect(session.updatedAt).toBeTruthy();

    store.close();
  });

  it('adds messages to a session', () => {
    const store = new SessionStore(TEST_DB);
    const session = store.create('Chat session');

    store.addMessage(session.id, { role: 'user', content: 'Hello' });
    store.addMessage(session.id, { role: 'assistant', content: 'Hi there!' });

    const messages = store.getMessages(session.id);
    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('Hello');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toBe('Hi there!');

    store.close();
  });

  it('lists all sessions', () => {
    const store = new SessionStore(TEST_DB);
    store.create('Session A');
    store.create('Session B');
    store.create('Session C');

    const sessions = store.list();
    expect(sessions.length).toBe(3);
    const titles = sessions.map(s => s.title);
    expect(titles).toContain('Session A');
    expect(titles).toContain('Session B');
    expect(titles).toContain('Session C');

    store.close();
  });

  it('persists data across instances', () => {
    const store1 = new SessionStore(TEST_DB);
    const session = store1.create('Persistent session');
    store1.addMessage(session.id, { role: 'user', content: 'Remember me?' });
    store1.close();

    // Open a new instance pointing to same DB
    const store2 = new SessionStore(TEST_DB);
    const found = store2.get(session.id);
    expect(found).toBeDefined();
    expect(found!.title).toBe('Persistent session');

    const messages = store2.getMessages(session.id);
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe('Remember me?');

    store2.close();
  });

  it('retrieves a session by id', () => {
    const store = new SessionStore(TEST_DB);
    const created = store.create('Lookup test');

    const found = store.get(created.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);

    const missing = store.get('nonexistent-id');
    expect(missing).toBeUndefined();

    store.close();
  });
});
