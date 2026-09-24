/**
 * apps/web/e2e/mock-gateway/server.mjs (Phase 9.2a)
 *
 * A tiny stand-in for the New API gateway so e2e can exercise the REAL
 * chat path (web /api/chat → apps/api /chat → gateway → billing) with no
 * network access and no provider keys. Zero dependencies (Node built-ins).
 *
 * Implements only what apps/api actually calls:
 *   POST /v1/chat/completions  OpenAI-style SSE (content deltas, then a
 *                              usage chunk, then [DONE]) — the exact
 *                              shape services/gateway.service.ts parses
 *   GET  /v1/models            model-sync.service.ts
 *   GET  /api/channel/         gateway-channels.service.ts (admin/channels)
 *   GET  /health               Playwright's webServer readiness probe
 *
 * The reply text is fixed so specs can assert it. Usage is fixed too
 * (12 in / 6 out) so billing is deterministic.
 */
import http from "node:http";

const PORT = Number(process.env.MOCK_GATEWAY_PORT ?? 4010);
export const REPLY_WORDS = ["Hello", "from", "the", "mock", "gateway."];

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.method === "GET" && url.pathname === "/v1/models") {
    json(res, 200, { object: "list", data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/channel/") {
    json(res, 200, {
      success: true,
      data: { items: [{ id: 1, name: "mock-channel", type: 1, status: 1, response_time: 120, models: "gpt-4o,gpt-4o-mini" }] },
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
    if (!req.headers.authorization?.startsWith("Bearer ")) {
      json(res, 401, { error: "missing bearer token" });
      return;
    }
    req.resume(); // body is not needed; drain it
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      let i = 0;
      const tick = setInterval(() => {
        if (i < REPLY_WORDS.length) {
          const delta = (i === 0 ? "" : " ") + REPLY_WORDS[i];
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`);
          i += 1;
          return;
        }
        clearInterval(tick);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 12, completion_tokens: 6 } })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      }, 30);
      res.on("close", () => clearInterval(tick));
    });
    return;
  }

  json(res, 404, { error: `mock gateway: no route for ${req.method} ${url.pathname}` });
});

server.listen(PORT, () => console.log(`mock gateway on :${PORT}`));
