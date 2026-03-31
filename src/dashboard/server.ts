import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { streamSSE } from 'hono/streaming';
import type { ShrimpEventBus } from '../core/events';
import type { CapabilityRegistry } from '../core/registry';
import type { AgentLoop } from '../core/loop';

export interface DashboardConfig {
  port: number;
  bus: ShrimpEventBus;
  registry: CapabilityRegistry;
  loop: AgentLoop;
}

export function createDashboard(config: DashboardConfig) {
  const { bus, registry, loop } = config;
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
        'agent:response', 'agent:error', 'channel:message',
        'memory:fact-updated',
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

  // --- REST: send a message (so you can chat from the dashboard) ---
  app.post('/api/chat', async (c) => {
    const { message } = await c.req.json();
    if (!message || typeof message !== 'string') {
      return c.json({ error: 'message is required' }, 400);
    }

    bus.emit('channel:message', { channel: 'dashboard', from: 'user', text: message });

    try {
      const response = await loop.handleMessage(message);
      return c.json({ response });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // --- Static files (dashboard UI) ---
  app.use('/*', serveStatic({ root: './src/dashboard/public' }));

  return app;
}
