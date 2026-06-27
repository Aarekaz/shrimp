import { routeAgentRequest } from "agents";
import type { Env } from "./env";
import { ShrimpAgent } from "./ShrimpAgent";
import { css, html, js } from "./ui";

export { ShrimpAgent };

function isAgentApiAuthorized(request: Request, env: Env): boolean {
  const token = (env as Env & { SHRIMP_ACCESS_TOKEN?: string }).SHRIMP_ACCESS_TOKEN;
  if (!token) return true;

  const header = request.headers.get("authorization");
  return header === `Bearer ${token}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const agentResponse = await routeAgentRequest(request, env, { cors: true });
    if (agentResponse) return agentResponse;

    const url = new URL(request.url);

    const chatMatch = url.pathname.match(/^\/api\/agent\/([^/]+)\/chat$/);
    if (chatMatch && request.method === "POST") {
      if (!isAgentApiAuthorized(request, env)) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      const id = env.SHRIMP_AGENT.idFromName(chatMatch[1]);
      const stub = env.SHRIMP_AGENT.get(id);
      return stub.fetch(request);
    }

    const historyMatch = url.pathname.match(/^\/api\/agent\/([^/]+)\/history$/);
    if (historyMatch && request.method === "GET") {
      if (!isAgentApiAuthorized(request, env)) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      const id = env.SHRIMP_AGENT.idFromName(historyMatch[1]);
      const stub = env.SHRIMP_AGENT.get(id);
      return stub.fetch(request);
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "shrimp-agent" });
    }

    if (url.pathname === "/") {
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname === "/ui/styles.css") {
      return new Response(css, {
        headers: { "content-type": "text/css; charset=utf-8" },
      });
    }

    if (url.pathname === "/ui/app.js") {
      return new Response(js, {
        headers: { "content-type": "application/javascript; charset=utf-8" },
      });
    }

    return new Response("Shrimp Agent", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
