from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .models import Order, OrderLine, PurchaseRequest, Scenario

# A unit can next become free on its baseline return or a reservation's end.
# Keeping this as SQL makes the interval query directly inspectable in the portfolio.
STOCK_SQL = text("""
WITH candidates AS (
  SELECT id AS asset_id, GREATEST(available_from, :today) AS day
  FROM assets WHERE scenario_id = :scenario
  UNION
  SELECT r.asset_id, r.end_exclusive
  FROM reservations r JOIN assets a ON a.id = r.asset_id
  WHERE a.scenario_id = :scenario
    AND r.end_exclusive >= GREATEST(a.available_from, :today)
), next_free AS (
  SELECT c.asset_id, MIN(c.day) AS day FROM candidates c
  WHERE NOT EXISTS (
    SELECT 1 FROM reservations r WHERE r.asset_id = c.asset_id
      AND r.start_date <= c.day AND r.end_exclusive > c.day
  ) GROUP BY c.asset_id
)
SELECT a.product_id AS "productId", COUNT(*) AS total,
  COUNT(*) FILTER (WHERE f.day <= :today) AS "inWarehouse",
  COUNT(*) FILTER (WHERE f.day > :today) AS circulating,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM reservations r WHERE r.asset_id = a.id AND r.end_exclusive > :today
  )) AS reserved,
  CASE WHEN MIN(f.day) <= :today THEN NULL ELSE MIN(f.day) END AS "firstFree"
FROM assets a JOIN next_free f ON f.asset_id = a.id
JOIN products p ON p.id = a.product_id
WHERE a.scenario_id = :scenario
GROUP BY a.product_id, p.position ORDER BY p.position
""")


def operations_snapshot(session: Session, scenario: Scenario, today: date) -> dict:
    stock = [
        dict(row)
        for row in session.execute(STOCK_SQL, {"scenario": scenario.id, "today": today}).mappings()
    ]
    orders = list(
        session.scalars(
            select(Order).where(Order.scenario_id == scenario.id).order_by(Order.created_at.desc())
        )
    )
    order_ids = [order.id for order in orders]
    lines = (
        list(session.scalars(select(OrderLine).where(OrderLine.order_id.in_(order_ids))))
        if orders
        else []
    )
    counts: dict[UUID, int] = {}
    for line in lines:
        counts[line.order_id] = counts.get(line.order_id, 0) + 1
    purchases = session.execute(
        select(PurchaseRequest, OrderLine, Order)
        .join(OrderLine, PurchaseRequest.line_id == OrderLine.id)
        .join(Order, OrderLine.order_id == Order.id)
        .where(Order.scenario_id == scenario.id)
        .order_by(PurchaseRequest.created_at.desc())
    ).all()
    return {
        "stock": stock,
        "orders": [
            {
                "number": o.number,
                "customer": f"{o.first_name} {o.last_name}",
                "createdAt": o.created_at,
                "lines": counts.get(o.id, 0),
            }
            for o in orders
        ],
        "purchases": [
            {
                "id": p.id,
                "number": o.number,
                "productId": line.product_id,
                "quantity": p.quantity,
                "neededBy": p.needed_by,
                "endDate": line.end_exclusive - timedelta(days=1),
                "status": p.status,
            }
            for p, line, o in purchases
        ],
        "scenarioMonth": scenario.month,
    }
