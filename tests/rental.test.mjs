import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  orderQueries,
  seedAssetQuery,
  stockQuery,
} from "../lib/rental-engine.ts";
import { products, rentalWindow, shiftDay } from "../lib/catalog.ts";
import { orderInput } from "../lib/validation.ts";

const schema = readFileSync(
  new URL("../drizzle/0000_fantastic_frightful_four.sql", import.meta.url),
  "utf8",
);
function database(id = "scenario-a") {
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  db.prepare("INSERT INTO scenarios VALUES (?,?,?)").run(
    id,
    "2026-10-01",
    "2026-09-09",
  );
  for (const p of products) {
    const q = seedAssetQuery(
      id,
      p.id,
      p.total,
      p.freeUnits,
      "2026-09-09",
      `2026-10-${String(p.releaseDay).padStart(2, "0")}`,
      "2027-01-01",
    );
    db.prepare(q.sql).run(...q.params);
  }
  return db;
}
function book(db, start, end, options = {}) {
  const id = options.id || crypto.randomUUID();
  const order = {
    id,
    number: `ST-${id}`,
    scenarioId: "scenario-a",
    requestId: options.requestId || crypto.randomUUID(),
    firstName: "Demo",
    lastName: "Tester",
    email: "demo@example.com",
    phone: "+12025550123",
    createdAt: "2026-09-09T12:00:00Z",
    lines: [
      {
        id: `line-${id}`,
        productId: options.productId || "pa-kudo",
        quantity: options.quantity || 1,
        start,
        endExclusive: shiftDay(end, 1),
      },
      ...(options.extra || []),
    ],
  };
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const q of orderQueries(order)) db.prepare(q.sql).run(...q.params);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const allocations = db
    .prepare(
      "SELECT COUNT(*) AS n FROM reservations r JOIN order_lines l ON l.id=r.line_id WHERE l.order_id=?",
    )
    .get(id).n;
  const needed = db
    .prepare(
      "SELECT COALESCE(SUM(p.quantity),0) AS n FROM purchase_requests p JOIN order_lines l ON l.id=p.line_id WHERE l.order_id=?",
    )
    .get(id).n;
  return { allocations, needed, order };
}

test("current month locked; month/year rollover follows Tashkent time", () => {
  assert.equal(
    rentalWindow(new Date("2026-09-09T00:00:00Z")).minDate,
    "2026-10-01",
  );
  assert.equal(
    rentalWindow(new Date("2026-09-30T19:01:00Z")).minDate,
    "2026-11-01",
  );
  assert.equal(
    rentalWindow(new Date("2026-12-15T00:00:00Z")).minDate,
    "2027-01-01",
  );
  assert.equal(shiftDay("2028-02-29", 1), "2028-03-01");
});
test("seed has 343 physical units, including 118 sound units", () => {
  const db = database();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM assets").get().n, 343);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM assets WHERE product_id IN ('pa-kudo','sub-sb28','mixer-ql1','mixer-sq6')",
      )
      .get().n,
    118,
  );
  const q = stockQuery("scenario-a", "2026-09-09");
  const rows = db.prepare(q.sql).all(...q.params);
  assert.equal(
    rows.reduce((n, row) => n + row.inWarehouse, 0),
    13,
  );
  db.close();
});
test("early interval creates purchase and shortage event without creating inventory", () => {
  const db = database();
  const result = book(db, "2026-10-01", "2026-10-10");
  assert.equal(result.allocations, 0);
  assert.equal(result.needed, 1);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM system_events WHERE type='stock_shortage'",
      )
      .get().n,
    1,
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM assets").get().n, 343);
  db.close();
});
test("17th is available; 16th and an interval crossing 16th require procurement", () => {
  for (const [start, end, allocated] of [
    ["2026-10-17", "2026-10-20", 1],
    ["2026-10-16", "2026-10-16", 0],
    ["2026-10-02", "2026-10-20", 0],
  ]) {
    const db = database();
    const result = book(db, start, end);
    assert.equal(result.allocations, allocated);
    assert.equal(result.needed, 1 - allocated);
    db.close();
  }
});
test("an order awaiting procurement leaves the existing unit free for another order", () => {
  const db = database();
  book(db, "2026-10-01", "2026-10-22");
  const second = book(db, "2026-10-17", "2026-10-20");
  assert.equal(second.allocations, 1);
  assert.equal(second.needed, 0);
  db.close();
});
test("overlapping orders cannot share the same unit; following day can reuse it", () => {
  const db = database();
  assert.equal(book(db, "2026-10-17", "2026-10-20").allocations, 1);
  assert.equal(book(db, "2026-10-18", "2026-10-20").needed, 1);
  assert.equal(book(db, "2026-10-20", "2026-10-20").needed, 1);
  assert.equal(book(db, "2026-10-21", "2026-10-21").allocations, 1);
  const q = stockQuery("scenario-a", "2026-09-09");
  const row = db
    .prepare(q.sql)
    .all(...q.params)
    .find((row) => row.productId === "pa-kudo");
  assert.equal(row.firstFree, "2026-10-22");
  db.close();
});
test("only missing quantity is requested", () => {
  const db = database();
  const result = book(db, "2026-10-17", "2026-10-20", { quantity: 3 });
  assert.equal(result.allocations, 1);
  assert.equal(result.needed, 2);
  db.close();
});
test("individual product dates are allocated independently", () => {
  const db = database();
  const result = book(db, "2026-10-01", "2026-10-05", {
    extra: [
      {
        id: "extra-line",
        productId: "mixer-ql1",
        quantity: 1,
        start: "2026-10-17",
        endExclusive: "2026-10-21",
      },
    ],
  });
  assert.equal(result.allocations, 1);
  assert.equal(result.needed, 1);
  assert.equal(
    db
      .prepare(
        "SELECT product_id FROM order_lines l JOIN purchase_requests p ON p.line_id=l.id",
      )
      .get().product_id,
    "pa-kudo",
  );
  db.close();
});
test("duplicate request rolls back completely", () => {
  const db = database();
  const requestId = crypto.randomUUID();
  book(db, "2026-10-17", "2026-10-20", { requestId });
  assert.throws(() => book(db, "2026-10-17", "2026-10-20", { requestId }));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM reservations").get().n, 1);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM purchase_requests").get().n,
    0,
  );
  db.close();
});
test("one scenario cannot consume another scenario's inventory", () => {
  const db = database();
  db.prepare("UPDATE assets SET scenario_id=?").run("scenario-a");
  db.prepare("INSERT INTO scenarios VALUES (?,?,?)").run(
    "scenario-b",
    "2026-10-01",
    "2026-09-09",
  );
  const q = seedAssetQuery(
    "scenario-b",
    "pa-kudo",
    2,
    2,
    "2026-09-09",
    "2026-10-17",
    "2027-01-01",
  );
  db.prepare(q.sql).run(...q.params);
  assert.equal(book(db, "2026-10-01", "2026-10-10").allocations, 0);
  db.close();
});
test("contacts and date validation rejects empty names, invalid phone, impossible dates", () => {
  const valid = {
    requestId: crypto.randomUUID(),
    contact: {
      firstName: "Demo",
      lastName: "Tester",
      email: "test@example.com",
      phone: "+1 202 555 0123",
    },
    items: [
      {
        productId: "pa-kudo",
        quantity: 1,
        range: { start: "2026-10-17", end: "2026-10-20" },
      },
    ],
  };
  assert.equal(orderInput.safeParse(valid).success, true);
  assert.equal(
    orderInput.safeParse({
      ...valid,
      contact: { ...valid.contact, firstName: "   " },
    }).success,
    false,
  );
  assert.equal(
    orderInput.safeParse({
      ...valid,
      contact: { ...valid.contact, phone: "------" },
    }).success,
    false,
  );
  assert.equal(
    orderInput.safeParse({
      ...valid,
      items: [
        {
          ...valid.items[0],
          range: { start: "2026-02-30", end: "2026-03-02" },
        },
      ],
    }).success,
    false,
  );
});
