import { getSql } from "@/db";
import { pythonGateway } from "@/lib/python-gateway";
import { products, rentalWindow, shiftDay } from "@/lib/catalog";
import { stockQuery } from "@/lib/rental-engine";
import { currentScenario, json } from "@/lib/server";
export async function GET(request: Request) {
  const forwarded = await pythonGateway(request);
  if (forwarded) return forwarded;
  try {
    const scenario = await currentScenario(request);
    if (!scenario)
      return json({ error: "Обновите страницу, чтобы открыть склад." }, 401);
    const db = getSql();
    const query = stockQuery(scenario.id, rentalWindow().today);
    const result = await db.batch([
      db.prepare(query.sql).bind(...query.params),
      db
        .prepare(
          `SELECT o.number,o.first_name || ' ' || o.last_name AS customer,o.created_at AS createdAt,COUNT(l.id) AS lines FROM orders o JOIN order_lines l ON l.order_id=o.id WHERE o.scenario_id=? GROUP BY o.id ORDER BY o.created_at DESC`,
        )
        .bind(scenario.id),
      db
        .prepare(
          `SELECT p.id,o.number,l.product_id AS productId,p.quantity,p.needed_by AS neededBy,l.end_exclusive AS endExclusive,p.status FROM purchase_requests p JOIN order_lines l ON l.id=p.line_id JOIN orders o ON o.id=l.order_id WHERE o.scenario_id=? ORDER BY p.created_at DESC`,
        )
        .bind(scenario.id),
    ]);
    const stock = (result[0].results as { productId: string }[]).sort(
      (a, b) =>
        products.findIndex((p) => p.id === a.productId) -
        products.findIndex((p) => p.id === b.productId),
    );
    const purchases = result[2].results as { endExclusive: string }[];
    return json({
      stock,
      orders: result[1].results,
      purchases: purchases.map((p) => ({
        ...p,
        endDate: shiftDay(p.endExclusive, -1),
      })),
      scenarioMonth: scenario.month,
    });
  } catch (error) {
    console.error("Operations unavailable", error);
    return json({ error: "Не удалось загрузить склад." }, 503);
  }
}
