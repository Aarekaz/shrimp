import { z } from "zod";
import type { CloudTool } from "./index";

function assertPublicHttpUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http and https URLs are allowed");
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Local and private hostnames are not allowed");
  }

  return url;
}

export function createHttpTools(): CloudTool[] {
  return [
    {
      name: "http.fetch",
      description: "Fetch a public HTTP or HTTPS URL and return text content.",
      parameters: z.object({
        url: z.string(),
      }),
      approvalLevel: "auto",
      isReadOnly: true,
      handler: async (input) => {
        const url = assertPublicHttpUrl(String(input.url));
        const response = await fetch(url, {
          headers: { "user-agent": "ShrimpAgent/0.1" },
        });
        const text = await response.text();
        return {
          title: `Fetched ${url.hostname}`,
          output: {
            status: response.status,
            contentType: response.headers.get("content-type"),
            text: text.slice(0, 12000),
            truncated: text.length > 12000,
          },
        };
      },
    },
  ];
}
