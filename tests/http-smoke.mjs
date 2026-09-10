import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Miniflare } from "miniflare";

const mf = new Miniflare({
  modules: [
    "index.js",
    ...readdirSync("dist/server", { recursive: true }).filter(
      (path) => path.endsWith(".js") && path !== "index.js",
    ),
  ].map((path) => ({ type: "ESModule", path: resolve("dist/server", path) })),
  compatibilityDate: "2026-05-15",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: { DB: "rental-integration" },
  assets: {
    directory: resolve("dist/client"),
    binding: "ASSETS",
    routerConfig: {
      has_user_worker: true,
      invoke_user_worker_ahead_of_assets: true,
    },
  },
  cf: false,
});
try {
  const db = await mf.getD1Database("DB");
  const schema = readFileSync(
    "drizzle/0000_fantastic_frightful_four.sql",
    "utf8",
  );
  await db.batch(
    schema
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((sql) => db.prepare(sql)),
  );
  const catalogResponse = await mf.dispatchFetch(
    "http://stageops.test/api/catalog",
  );
  assert.equal(
    catalogResponse.status,
    200,
    await catalogResponse.clone().text(),
  );
  const catalog = await catalogResponse.json();
  const cookie = catalogResponse.headers.get("set-cookie").split(";")[0];
  const month = catalog.window.minDate.slice(0, 8);
  const body = {
    requestId: crypto.randomUUID(),
    contact: {
      firstName: "Demo",
      lastName: "Tester",
      email: "demo@example.com",
      phone: "+12025550123",
    },
    items: [
      {
        productId: "pa-kudo",
        quantity: 1,
        range: { start: `${month}17`, end: `${month}20` },
      },
    ],
  };
  async function post(value = body, sessionCookie = cookie) {
    const response = await mf.dispatchFetch("http://stageops.test/api/orders", {
      method: "POST",
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
        Origin: "http://stageops.test",
      },
      body: JSON.stringify(value),
    });
    return { status: response.status, data: await response.json() };
  }
  const first = await post();
  assert.equal(first.status, 201, JSON.stringify(first.data));
  const retry = await post();
  assert.equal(retry.status, 200);
  assert.equal(retry.data.number, first.data.number);
  const second = await post({ ...body, requestId: crypto.randomUUID() });
  assert.equal(second.status, 201);
  const ops = await mf
    .dispatchFetch("http://stageops.test/api/operations", {
      headers: { Cookie: cookie },
    })
    .then((r) => r.json());
  assert.equal(ops.orders.length, 2);
  assert.equal(ops.purchases.length, 1);
  assert.equal(ops.purchases[0].quantity, 1);
  const invalid = await post({
    ...body,
    requestId: crypto.randomUUID(),
    items: [
      {
        ...body.items[0],
        range: { start: catalog.window.today, end: catalog.window.today },
      },
    ],
  });
  assert.equal(invalid.status, 400);
  const otherResponse = await mf.dispatchFetch(
    "http://stageops.test/api/catalog",
  );
  const otherCookie = otherResponse.headers.get("set-cookie").split(";")[0];
  const otherOps = await mf
    .dispatchFetch("http://stageops.test/api/operations", {
      headers: { Cookie: otherCookie },
    })
    .then((r) => r.json());
  assert.equal(otherOps.orders.length, 0);
  const imageResponse = await mf.dispatchFetch(
    "http://stageops.test/images/sound.png",
  );
  assert.equal(imageResponse.status, 200);
  const page = await mf.dispatchFetch("http://stageops.test/");
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /StageOps/);
  assert.match(html, /Категории/);
  assert.doesNotMatch(html, /Открыть склад и заявки/);
  const operatorPage = await mf.dispatchFetch("http://stageops.test/operator", {
    headers: { Cookie: cookie },
  });
  const operatorHtml = await operatorPage.text();
  assert.equal(operatorPage.status, 200);
  assert.match(operatorHtml, /class="rental-app operator-app"/);
  assert.match(operatorHtml, /Склад и заявки/);
  assert.doesNotMatch(operatorHtml, /aria-label="Этапы заказа"/);
  const simultaneous = await Promise.all([
    post({ ...body, requestId: crypto.randomUUID() }, otherCookie),
    post({ ...body, requestId: crypto.randomUUID() }, otherCookie),
  ]);
  assert.ok(simultaneous.every((result) => result.status === 201));
  const current = await db
    .prepare("SELECT COUNT(*) AS n FROM reservations")
    .first();
  assert.equal(current.n, 2);
  const afterRace = await mf
    .dispatchFetch("http://stageops.test/api/operations", {
      headers: { Cookie: otherCookie },
    })
    .then((r) => r.json());
  assert.equal(afterRace.purchases.length, 1);
  console.log(
    "PASS: built Worker serves the app, assets and real SQL-backed API; order retry, stock shortage, cutoff and scenario isolation verified.",
  );
} finally {
  await mf.dispose();
}
