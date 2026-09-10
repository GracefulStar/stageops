import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const scenarios = sqliteTable("scenarios", {
  id: text("id").primaryKey(),
  month: text("month").notNull(),
  createdAt: text("created_at").notNull(),
});
export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    scenarioId: text("scenario_id")
      .notNull()
      .references(() => scenarios.id),
    productId: text("product_id").notNull(),
    availableFrom: text("available_from").notNull(),
  },
  (t) => [index("idx_assets_scenario_product").on(t.scenarioId, t.productId)],
);
export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    number: text("number").notNull(),
    scenarioId: text("scenario_id")
      .notNull()
      .references(() => scenarios.id),
    requestId: text("request_id").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_orders_number").on(t.number),
    uniqueIndex("idx_orders_scenario_request").on(t.scenarioId, t.requestId),
  ],
);
export const orderLines = sqliteTable(
  "order_lines",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    productId: text("product_id").notNull(),
    quantity: integer("quantity").notNull(),
    startDate: text("start_date").notNull(),
    endExclusive: text("end_exclusive").notNull(),
  },
  (t) => [
    index("idx_order_lines_order").on(t.orderId),
    check("line_quantity_positive", sql`${t.quantity} > 0`),
    check("line_dates_ordered", sql`${t.startDate} < ${t.endExclusive}`),
  ],
);
export const reservations = sqliteTable(
  "reservations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id),
    lineId: text("line_id")
      .notNull()
      .references(() => orderLines.id),
    startDate: text("start_date").notNull(),
    endExclusive: text("end_exclusive").notNull(),
  },
  (t) => [
    index("idx_reservations_asset_dates").on(
      t.assetId,
      t.startDate,
      t.endExclusive,
    ),
    index("idx_reservations_line").on(t.lineId),
    check("reservation_dates_ordered", sql`${t.startDate} < ${t.endExclusive}`),
  ],
);
export const purchaseRequests = sqliteTable(
  "purchase_requests",
  {
    id: text("id").primaryKey(),
    lineId: text("line_id")
      .notNull()
      .references(() => orderLines.id),
    quantity: integer("quantity").notNull(),
    neededBy: text("needed_by").notNull(),
    status: text("status").notNull().default("requested"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_purchases_line").on(t.lineId),
    check("purchase_quantity_positive", sql`${t.quantity} > 0`),
  ],
);
export const systemEvents = sqliteTable(
  "system_events",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    lineId: text("line_id")
      .notNull()
      .references(() => orderLines.id),
    type: text("type").notNull(),
    quantity: integer("quantity").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("idx_events_order").on(t.orderId)],
);
