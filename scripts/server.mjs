#!/usr/bin/env node
/**
 * Zero-dependency static server for the portable build.
 *
 *   node server.mjs            -> http://localhost:8080
 *   node server.mjs 9000       -> http://localhost:9000
 *
 * It only exists because mods must be fetched over HTTP: browsers block
 * fetch()/import() on file:// URLs. The game itself also runs by simply
 * opening GeoDash.html.
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = existsSync(join(here, "web")) ? join(here, "web") : here;
const port = Number(process.argv[2] ?? process.env.PORT ?? 8080);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let target = resolve(join(webRoot, normalize(urlPath)));

  // never serve outside web/
  if (!target.startsWith(webRoot)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  if (existsSync(target) && statSync(target).isDirectory()) target = join(target, "index.html");
  if (!existsSync(target)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end(`not found: ${urlPath}`);
    return;
  }

  res.writeHead(200, {
    "content-type": MIME[extname(target)] ?? "application/octet-stream",
    "cache-control": "no-cache",
  });
  createReadStream(target).pipe(res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Geo Dash is running:  http://localhost:${port}`);
  console.log(`serving:              ${webRoot}`);
  console.log("press Ctrl+C to stop");
});
