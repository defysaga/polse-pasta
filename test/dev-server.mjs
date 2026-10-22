// Lokal testserver: viser public/ og sender /api/ til Workeren (via harness.mjs).
// node --no-warnings test/dev-server.mjs [port]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { makeEnv } from "./harness.mjs";

const root = path.resolve(new URL("../public", import.meta.url).pathname);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json" };
const { env, worker } = makeEnv();

export function start(port = 8787) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost:" + port);
    if (url.pathname.startsWith("/api/")) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const r = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body }), env);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    let p = path.join(root, decodeURIComponent(url.pathname));
    if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end("Ikke funnet"); }
    res.writeHead(200, { "Content-Type": types[path.extname(p)] || "application/octet-stream", "Cache-Control": "no-cache" });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((r) => server.listen(port, "127.0.0.1", () => r(server)));
}
if (import.meta.url === `file://${process.argv[1]}`) start(Number(process.argv[2]) || 8787).then(() => console.log("Kjører på http://localhost:" + (process.argv[2] || 8787)));
