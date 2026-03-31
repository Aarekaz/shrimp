import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { streamSSE, stream } from 'hono/streaming';
import { formatError } from '../core/errors';
import type { ShrimpEventBus } from '../core/events';
import type { CapabilityRegistry } from '../core/registry';
import type { AgentLoop } from '../core/loop';
import type { SessionStore } from '../core/session';

export interface DashboardConfig {
  port: number;
  bus: ShrimpEventBus;
  registry: CapabilityRegistry;
  loop: AgentLoop;
  sessionStore?: SessionStore;
}

export function createDashboard(config: DashboardConfig) {
  const { bus, registry, loop, sessionStore } = config;
  const app = new Hono();

  // --- SSE: real-time event stream ---
  app.get('/api/events', (c) => {
    return streamSSE(c, async (stream) => {
      let id = 0;

      const handler = (event: string, payload: any) => {
        stream.writeSSE({
          id: String(id++),
          event,
          data: JSON.stringify(payload),
        });
      };

      // Subscribe to all agent events
      const events = [
        'agent:thinking', 'agent:tool-call', 'agent:tool-result',
        'agent:response', 'agent:chunk', 'agent:error', 'channel:message',
        'memory:fact-updated',
        'agent-task:spawned', 'agent-task:completed', 'agent-task:failed', 'agent-task:message',
      ] as const;

      for (const event of events) {
        bus.on(event, (payload: any) => handler(event, payload));
      }

      // Keep connection alive
      while (true) {
        await stream.writeSSE({ id: String(id++), event: 'ping', data: '' });
        await stream.sleep(15000);
      }
    });
  });

  // --- REST: conversation history ---
  app.get('/api/history', (c) => {
    return c.json(loop.getHistory());
  });

  // --- REST: event history ---
  app.get('/api/events/history', (c) => {
    return c.json(bus.getHistory().slice(-100));
  });

  // --- REST: capabilities and tools ---
  app.get('/api/capabilities', (c) => {
    const caps = registry.list().map(cap => ({
      name: cap.name,
      description: cap.description,
      tools: cap.tools.map(t => ({
        name: t.name,
        description: t.description,
        approvalLevel: t.approvalLevel,
      })),
    }));
    return c.json(caps);
  });

  // --- Streaming chat endpoint ---
  app.post('/api/chat', async (c) => {
    const { message } = await c.req.json();
    if (!message || typeof message !== 'string') {
      return c.json({ error: 'message is required' }, 400);
    }

    bus.emit('channel:message', { channel: 'dashboard', from: 'user', text: message });

    return stream(c, async (s) => {
      try {
        for await (const chunk of loop.handleMessageStreaming(message)) {
          await s.write(chunk);
          bus.emit('agent:chunk', { delta: chunk });
        }
      } catch (e: unknown) {
        const err = formatError(e);
        bus.emit('agent:error', { message: err.message });
        await s.write(`\n\nError: ${err.message}`);
      }
    });
  });

  // --- REST: cost tracking ---
  app.get('/api/cost', (c) => {
    return c.json(loop.costTracker.getState());
  });

  // --- REST: agent task events ---
  app.get('/api/tasks', (c) => {
    const taskEvents = bus.getHistory().filter(e => e.event.startsWith('agent-task:'));
    return c.json(taskEvents);
  });

  // --- REST: session list ---
  app.get('/api/sessions', (c) => {
    if (!sessionStore) return c.json({ error: 'Session store not configured' }, 503);
    return c.json(sessionStore.list());
  });

  // --- REST: resume a session ---
  app.post('/api/sessions/:id/resume', (c) => {
    const id = c.req.param('id');
    const loaded = loop.loadSession(id);
    if (!loaded) return c.json({ error: 'Session not found' }, 404);
    return c.json({ resumed: true, messages: loop.getHistory().length });
  });

  // --- REST: messages for a session ---
  app.get('/api/sessions/:id/messages', (c) => {
    if (!sessionStore) return c.json({ error: 'Session store not configured' }, 503);
    const id = c.req.param('id');
    const session = sessionStore.get(id);
    if (!session) return c.json({ error: 'Session not found' }, 404);
    return c.json(sessionStore.getMessages(id));
  });

  // --- Static files (dashboard UI) ---
  app.use('/*', serveStatic({ root: './src/dashboard/public' }));

  return app;
}
