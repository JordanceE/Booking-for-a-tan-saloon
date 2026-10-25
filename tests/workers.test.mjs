import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { providerJson } from "../lib/integrations/http.ts";

// Execute the real helper in workerd, with intercepted outbound traffic and no credentials.
// A Node-only mock accepts redirect: "error", which Workers rejects before sending a request.
function workerFor(t, outboundService) {
  const worker = new Miniflare({
    modules: true,
    compatibilityDate: "2026-05-15",
    script: `
      ${providerJson.toString()}
      export default { async fetch() {
        try {
          const data = await providerJson(fetch, "https://provider.test/check", {
            method: "POST",
            headers: { Authorization: "Bearer test-only", "Content-Type": "application/json" },
            body: JSON.stringify({ test: true }),
          }, 5000);
          return Response.json({ ok: true, data });
        } catch {
          return Response.json({ ok: false }, { status: 503 });
        }
      }};`,
    outboundService,
  });
  t.after(() => worker.dispose());
  return worker;
}

test("provider HTTP requests run in Workers with the real fetch implementation", async (t) => {
  let calls = 0;
  const worker = workerFor(t, async (request) => {
    calls++;
    assert.equal(request.url, "https://provider.test/check");
    assert.equal(request.headers.get("Authorization"), "Bearer test-only");
    assert.deepEqual(await request.json(), { test: true });
    return Response.json({ accepted: true });
  });
  const response = await worker.dispatchFetch("http://worker.test/");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, data: { accepted: true } });
  assert.equal(calls, 1);
});

test("provider redirects are rejected in Workers without a second outbound request", async (t) => {
  for (const status of [301, 302, 303, 307, 308]) {
    let calls = 0;
    const worker = workerFor(t, () => {
      calls++;
      return new Response(null, { status, headers: { Location: "https://unexpected.test/" } });
    });
    const response = await worker.dispatchFetch("http://worker.test/");
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false });
    assert.equal(calls, 1, `HTTP ${status} must not forward the authenticated request`);
  }
});
