// Pre-Call AI server: holds the team's Claude API key and runs the AI check for techs who send a valid team code.
//
// POST /analyze   Authorization: Bearer <team code>   {"readings": "..."}
//   200 {"result": {...}, "model": "..."}
//   4xx/5xx {"error": "<code>", "message": "<what to tell the tech>"}
// GET /           health check

import Anthropic from "@anthropic-ai/sdk";
// @ts-expect-error: plain JS module shared with the app, typed loosely here.
import { buildRequest, readResult, MAX_READINGS } from "../../ai-prompt.js";

interface Env {
  ANTHROPIC_API_KEY: string;
  // "name:code,name:code". One code per tech, so one can be removed without touching the rest.
  TEAM_CODES: string;
  // Comma-separated origins the app is served from, e.g. "https://you.github.io".
  ALLOWED_ORIGINS?: string;
  // Only for local testing against a fake API.
  ANTHROPIC_BASE_URL?: string;
  LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") return new Response(null, { status: cors ? 204 : 403, headers: cors ?? {} });
    if (url.pathname === "/" && request.method === "GET") return json({ ok: true }, 200, cors);
    if (url.pathname !== "/analyze") return fail(404, "not_found", "Not found.", cors);
    if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST.", cors);
    if (request.headers.get("Origin") && !cors) return fail(403, "origin_not_allowed", "This app isn't allowed to use the AI server.", null);

    if (!env.ANTHROPIC_API_KEY || !env.TEAM_CODES) {
      console.error("Server is missing ANTHROPIC_API_KEY or TEAM_CODES");
      return fail(500, "not_configured", "The AI server isn't set up yet. Tell whoever runs it.", cors);
    }

    const who = await checkCode(request.headers.get("Authorization"), env.TEAM_CODES);
    if (!who) return fail(401, "bad_code", "Your team code wasn't accepted. Check it in Profile.", cors);

    if (env.LIMITER && !(await env.LIMITER.limit({ key: who })).success) {
      return fail(429, "rate_limited", "Too many checks in a short time. Wait a minute and try again.", cors);
    }

    let readings: unknown;
    try {
      readings = ((await request.json()) as { readings?: unknown }).readings;
    } catch {
      return fail(400, "bad_request", "The app sent something the server couldn't read.", cors);
    }
    if (typeof readings !== "string" || !readings.trim() || readings.length > MAX_READINGS) {
      return fail(400, "bad_request", "The app sent something the server couldn't read.", cors);
    }

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL || undefined, maxRetries: 1 });
    const started = Date.now();
    try {
      const res = await client.beta.messages.create(buildRequest(readings));
      const result = readResult(res);
      console.log(JSON.stringify({ who, ms: Date.now() - started, model: res.model, input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens }));
      return json({ result, model: res.model }, 200, cors);
    } catch (e) {
      console.error(JSON.stringify({ who, ms: Date.now() - started, error: e instanceof Error ? e.message : String(e) }));
      const code = (e as { code?: string }).code;
      if (code === "refusal") return fail(422, "refusal", (e as Error).message, cors);
      if (code === "truncated" || code === "bad_output") return fail(502, code, (e as Error).message, cors);
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        return fail(502, "server_key", "The AI server's Claude key isn't working. Tell whoever runs it.", cors);
      }
      if (e instanceof Anthropic.RateLimitError) return fail(429, "busy", "Claude is busy right now. Wait a minute and try again.", cors);
      if (e instanceof Anthropic.APIConnectionError) return fail(502, "upstream", "The AI server couldn't reach Claude. Try again.", cors);
      if (e instanceof Anthropic.APIError) return fail(502, "upstream", "Claude returned an error" + (e.status ? " (" + e.status + ")" : "") + ". Try again.", cors);
      return fail(500, "server_error", "Something went wrong on the AI server. Try again.", cors);
    }
  },
};

// Returns the tech's name for a valid code, or null. Compares hashes so timing doesn't leak the code.
async function checkCode(header: string | null, teamCodes: string): Promise<string | null> {
  const given = (header ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!given) return null;
  const givenHash = await sha256(given);
  let match: string | null = null;
  for (const entry of teamCodes.split(",")) {
    const i = entry.indexOf(":");
    if (i < 1) continue;
    const name = entry.slice(0, i).trim(), code = entry.slice(i + 1).trim();
    if (!code) continue;
    if (crypto.subtle.timingSafeEqual(givenHash, await sha256(code))) match = match ?? name;
  }
  return match;
}

async function sha256(s: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
}

function corsHeaders(request: Request, env: Env): Record<string, string> | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
  if (!allowed.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, cors: Record<string, string> | null): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...(cors ?? {}) } });
}

function fail(status: number, error: string, message: string, cors: Record<string, string> | null): Response {
  return json({ error, message }, status, cors);
}
