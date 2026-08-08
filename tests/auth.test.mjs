import assert from "node:assert/strict";
import worker, { withClientNoStore } from "../src/index.js";

const origin = "https://orders.example.test";
const env = {
  DASHBOARD_PASSWORD: "Correct-Horse-42!",
  SESSION_SECRET: "test-only-session-secret-that-is-long-and-random-like",
  ASSETS: { fetch: () => new Response("asset") }
};
const ctx = { waitUntil() {} };

const call = (path, init = {}, customEnv = env) => worker.fetch(new Request(`${origin}${path}`, init), customEnv, ctx);

const cacheable = new Response("cached-payload", { headers: { "cache-control": "public, max-age=60" } });
const clientResponse = withClientNoStore(cacheable);
assert.equal(clientResponse.headers.get("cache-control"), "no-store");
assert.equal(await clientResponse.text(), "cached-payload");

let response = await call("/api/session");
assert.equal(response.status, 200);
assert.equal((await response.json()).authenticated, false);

response = await call("/api/order-status", { headers: { "cf-access-jwt-assertion": "forged" } });
assert.equal(response.status, 401);

response = await call("/api/login", {
  method: "POST",
  headers: { origin, "content-type": "application/json", "cf-connecting-ip": "192.0.2.10" },
  body: JSON.stringify({ password: "x".repeat(5000) })
});
assert.equal(response.status, 413);

response = await call("/api/login", {
  method: "POST",
  headers: { origin, "content-type": "application/json", "cf-connecting-ip": "192.0.2.11" },
  body: JSON.stringify({ password: "wrong-password-value" })
});
assert.equal(response.status, 401);

response = await call("/api/login", {
  method: "POST",
  headers: { origin, "content-type": "application/json", "cf-connecting-ip": "192.0.2.12" },
  body: JSON.stringify({ password: env.DASHBOARD_PASSWORD })
});
assert.equal(response.status, 200);
const cookie = response.headers.get("set-cookie").split(";", 1)[0];
assert.match(response.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Strict/);

response = await call("/api/session", { headers: { cookie } });
assert.equal((await response.json()).authenticated, true);

response = await call("/api/logout", { method: "POST", headers: { origin, cookie } });
assert.equal(response.status, 200);
assert.match(response.headers.get("set-cookie"), /Max-Age=0/);

response = await call("/api/login", {
  method: "POST",
  headers: { origin, "content-type": "application/json" },
  body: JSON.stringify({ password: "short" })
}, { ...env, DASHBOARD_PASSWORD: "too-short" });
assert.equal(response.status, 503);

console.log("auth tests passed");
