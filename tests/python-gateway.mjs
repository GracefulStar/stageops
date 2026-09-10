import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Miniflare } from "miniflare";

const forwarded = [];
let upstreamStatus = 200;
const mf = new Miniflare({
  modules: ["index.js", ...readdirSync("dist/server", { recursive: true })
    .filter((p) => p.endsWith(".js") && p !== "index.js")]
    .map((p) => ({ type: "ESModule", path: resolve("dist/server", p) })),
  compatibilityDate: "2026-05-15",
  compatibilityFlags: ["nodejs_compat"],
  bindings: { PYTHON_API_URL: "https://python.example" },
  d1Databases: { DB: "unused-python-gateway-test" },
  cf: false,
  outboundService: async (request) => {
    forwarded.push({
      url: request.url,
      method: request.method,
      cookie: request.headers.get("cookie"),
      origin: request.headers.get("origin"),
      body: await request.text(),
    });
    return new Response(JSON.stringify({ upstream: "python", error: "upstream failure" }), {
      status: upstreamStatus,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": "stageops_scenario=test; Path=/; HttpOnly; Secure; SameSite=Lax",
        "X-StageOps-Backend": "python-fastapi",
        ...(upstreamStatus === 302 ? { Location: "https://other.example" } : {}),
      },
    });
  },
});

try {
  for (const [path, method] of [
    ["catalog", "GET"], ["operations", "GET"], ["orders", "POST"], ["scenario", "POST"],
  ]) {
    const response = await mf.dispatchFetch(`https://stageops.test/api/${path}`, {
      method,
      headers: { Cookie: "stageops_scenario=demo", Origin: "https://stageops.test", "Content-Type": "application/json" },
      ...(method === "POST" ? { body: '{"demo":true}' } : {}),
    });
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(response.headers.get("x-stageops-backend"), "python-fastapi");
    assert.match(response.headers.get("set-cookie"), /HttpOnly/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(forwarded.at(-1), {
      url: `https://python.example/api/${path}`, method,
      cookie: "stageops_scenario=demo", origin: "https://stageops.test",
      body: method === "POST" ? '{"demo":true}' : "",
    });
  }
  const count = forwarded.length;
  const oversized = await mf.dispatchFetch("https://stageops.test/api/orders", { method: "POST", body: "x".repeat(24001) });
  assert.equal(oversized.status, 413);
  assert.equal(forwarded.length, count);
  upstreamStatus = 503;
  const failed = await mf.dispatchFetch("https://stageops.test/api/orders", { method: "POST", body: "{}" });
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).upstream, "python");
  upstreamStatus = 302;
  const redirect = await mf.dispatchFetch("https://stageops.test/api/catalog");
  assert.equal(redirect.status, 503);
  assert.equal(forwarded.length, count + 2);
  console.log("PASS: Python proxy forwards all four routes, cookies and JSON; limits payloads, rejects redirects and never falls back to D1 on upstream failure.");
} finally {
  await mf.dispose();
}
