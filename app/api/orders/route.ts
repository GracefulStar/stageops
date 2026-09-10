import { getSql } from "@/db";
import { pythonGateway } from "@/lib/python-gateway";
import { products, rentalWindow, shiftDay } from "@/lib/catalog";
import { orderQueries } from "@/lib/rental-engine";
import { currentScenario, json, runBatch, sameOrigin } from "@/lib/server";
import { orderInput } from "@/lib/validation";

async function existingOrder(scenarioId: string, requestId: string) {
  return getSql()
    .prepare(
      `SELECT o.number,o.created_at AS createdAt,COALESCE(SUM(l.quantity),0) AS items FROM orders o JOIN order_lines l ON l.order_id=o.id WHERE o.scenario_id=? AND o.request_id=? GROUP BY o.id`,
    )
    .bind(scenarioId, requestId)
    .first();
}
export async function POST(request: Request) {
  const forwarded = await pythonGateway(request);
  if (forwarded) return forwarded;
  if (!sameOrigin(request))
    return json({ error: "Недопустимый источник запроса." }, 403);
  let scenarioId = "";
  let requestId = "";
  try {
    const scenario = await currentScenario(request);
    if (!scenario)
      return json(
        { error: "Обновите страницу, чтобы продолжить оформление." },
        401,
      );
    scenarioId = scenario.id;
    const raw = await request.text();
    if (raw.length > 24000)
      return json({ error: "Заказ слишком большой." }, 400);
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return json({ error: "Некорректный запрос." }, 400);
    }
    const parsed = orderInput.safeParse(value);
    if (!parsed.success)
      return json(
        { error: "Проверьте контакты, количество и даты аренды." },
        400,
      );
    const input = parsed.data;
    requestId = input.requestId;
    const existing = await existingOrder(scenarioId, requestId);
    if (existing) return json(existing);
    const minDate = rentalWindow().minDate;
    if (input.items.some((item) => item.range.start < minDate))
      return json(
        {
          error: "Аренда доступна только со следующего месяца. Обновите даты.",
        },
        400,
      );
    if (
      input.items.some(
        (item) => !products.some((p) => p.id === item.productId),
      ) ||
      new Set(input.items.map((item) => item.productId)).size !==
        input.items.length
    )
      return json({ error: "Проверьте состав подбора." }, 400);
    const now = new Date().toISOString();
    const number = `ST-${now.slice(0, 7).replace("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const booking = {
      id: crypto.randomUUID(),
      number,
      scenarioId,
      requestId,
      ...input.contact,
      createdAt: now,
      lines: input.items.map((item) => ({
        id: crypto.randomUUID(),
        productId: item.productId,
        quantity: item.quantity,
        start: item.range.start,
        endExclusive: shiftDay(item.range.end, 1),
      })),
    };
    await runBatch(orderQueries(booking));
    return json(
      {
        number,
        createdAt: now,
        items: input.items.reduce((sum, item) => sum + item.quantity, 0),
      },
      201,
    );
  } catch (error) {
    // A second request with the same idempotency key may race the first transaction.
    if (scenarioId && requestId) {
      try {
        const existing = await existingOrder(scenarioId, requestId);
        if (existing) return json(existing);
      } catch {
        /* Report the original storage failure below. */
      }
    }
    console.error("Order persistence failed", error);
    return json(
      {
        error:
          "Не удалось сохранить заказ. Попробуйте ещё раз: повтор не создаст дубликат.",
      },
      503,
    );
  }
}
