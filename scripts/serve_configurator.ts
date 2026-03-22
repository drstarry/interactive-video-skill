#!/usr/bin/env npx tsx
/**
 * Ephemeral server for the lesson configurator.
 * Serves static files + listens for POST /config.
 * Prints config JSON to stdout on submit, then exits.
 *
 * Usage:
 *   npx tsx scripts/serve_configurator.ts \
 *     --lang en --source "encoded source" --topics "encoded topics JSON" \
 *     --audience-hint beginner --source-type url
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFileSync, existsSync, realpathSync } from "fs";
import { join, extname, sep } from "path";
import { execFileSync } from "child_process";

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

// ── Parse CLI args ──
function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith("--") && i + 1 < argv.length) {
      args[argv[i].slice(2)] = argv[++i];
    }
  }
  return args;
}

const args = parseArgs(process.argv);
const lang = args.lang || "en";
const source = args.source || "";
const topics = args.topics || "";
const audienceHint = args["audience-hint"] || "";
const sourceType = args["source-type"] || "";

// ── Recommendation heuristic ──
function computeRecommendation(): { preset: string; reason: string } {
  let topicCount = 0;
  try { topicCount = JSON.parse(decodeURIComponent(topics)).length; } catch {}

  if (audienceHint === "beginner") {
    return { preset: "quick-explainer", reason: "beginner audience" };
  }
  if (topicCount < 5) {
    return { preset: "quick-explainer", reason: topicCount > 0 ? `${topicCount} topics — a focused overview` : "short content" };
  }
  if (topicCount > 10) {
    return { preset: "deep-workshop", reason: `${topicCount} topics from a dense source — needs room` };
  }
  if (sourceType === "codebase") {
    return { preset: "standard-lesson", reason: "codebase walkthrough — technical audience" };
  }
  return { preset: "standard-lesson", reason: "balanced depth for this content" };
}

const rec = computeRecommendation();

// ── Server setup ──
const ROOT = join(import.meta.dirname, "..");
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  // POST /config — the callback
  if (req.method === "POST" && req.url === "/config") {
    const MAX_BODY = 1024 * 1024; // 1 MB
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) { req.destroy(); return; }
    });
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end('{"ok":true}');
      process.stdout.write(body + "\n");
      setTimeout(() => process.exit(0), 200);
    });
    return;
  }

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  // Static file serving — contained to ROOT
  const urlPath = req.url?.split("?")[0] || "/";
  const filePath = join(ROOT, urlPath === "/" ? "configurator.html" : urlPath);

  // Path traversal guard: resolve symlinks and ensure path stays under ROOT
  let resolved: string;
  try { resolved = realpathSync(filePath); } catch { resolved = filePath; }
  if (!resolved.startsWith(ROOT + sep) && resolved !== ROOT) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = extname(filePath);
  const mime = MIME[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": mime });
  res.end(readFileSync(filePath));
});

// Let OS pick an available port (server.listen is async, try/catch won't catch EADDRINUSE)
server.listen(0, "127.0.0.1");

server.on("listening", () => {
  const addr = server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : 0;

  const params = new URLSearchParams({
    lang, source, topics,
    recommend: rec.preset,
    reason: rec.reason,
    port: String(actualPort),
  });

  const url = `http://localhost:${actualPort}/configurator.html?${params}`;

  // Open browser
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try { execFileSync(opener, [url]); } catch {}

  process.stderr.write(`Configurator running at ${url}\n`);
});

// Auto-exit after timeout
setTimeout(() => {
  process.stderr.write("Configurator timed out after 10 minutes.\n");
  process.exit(1);
}, TIMEOUT_MS);
