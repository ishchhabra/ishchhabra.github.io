import path from "path";
import type { Plugin, ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "http";

/**
 * Vite plugin that adds the design-overlay `/api/chat` endpoint.
 *
 * Environment variables (loaded from .env in project root):
 * - OLLAMA_BASE_URL (default: http://localhost:11434)
 * - OLLAMA_MODEL   (default: llama3.2)
 */
export function designOverlayApiPlugin(): Plugin {
  return {
    name: "design-overlay-api",

    configResolved(config: { root: string }) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const dotenv = require("dotenv") as { config: (opts: { path: string }) => void };
        dotenv.config({ path: path.resolve(config.root, ".env") });
      } catch {
        // dotenv is optional — env vars can be set externally
      }
    },

    configureServer(server: ViteDevServer) {
      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          if (req.url?.split("?")[0] !== "/api/chat" || req.method !== "POST") {
            return next();
          }

          try {
            const body = await readBody(req);
            const request = new Request("http://localhost/api/chat", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body,
            });

            const mod = await import("@i2-labs/design-overlay/server");
            const handleChatRequest = mod.handleChatRequest as (req: Request) => Promise<Response>;
            const response = await handleChatRequest(request);

            res.statusCode = response.status;
            response.headers.forEach((v, k) => res.setHeader(k, v));

            if (response.body) {
              await pipeReadableStream(response.body, res);
            } else {
              res.end();
            }
          } catch (err) {
            console.error("[design-overlay] Chat API error:", err);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  error: err instanceof Error ? err.message : "Internal server error",
                }),
              );
            }
          }
        },
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read the full request body as a string. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/** Pipe a web ReadableStream into a Node.js ServerResponse. */
async function pipeReadableStream(stream: ReadableStream, res: ServerResponse): Promise<void> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    res.end();
  }
}
