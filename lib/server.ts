import { getSql } from "@/db";
import { isoDate, parseDate, products, rentalWindow } from "@/lib/catalog";
import { seedAssetQuery, type Query } from "@/lib/rental-engine";

export const COOKIE = "stageops_scenario";
export function json(data: unknown, status = 200, cookie?: string) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(cookie ? { "Set-Cookie": cookie } : {}),
    },
  });
}
export function scenarioCookie(id: string, request: Request) {
  return `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export async function currentScenario(request: Request) {
  const id = (request.headers.get("cookie") || "")
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!id || !/^[a-f0-9-]{36}$/i.test(id)) return null;
  return getSql()
    .prepare("SELECT id,month FROM scenarios WHERE id=?")
    .bind(id)
    .first<{ id: string; month: string }>();
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
export async function runBatch(queries: Query[]) {
  const db = getSql();
  return db.batch(
    queries.map((query) => db.prepare(query.sql).bind(...query.params)),
  );
}
export async function createScenario() {
  const id = crypto.randomUUID();
  const window = rentalWindow();
  const month = window.minDate;
  const date = parseDate(month);
  const later = isoDate(new Date(date.getFullYear(), date.getMonth() + 3, 1));
  const queries: Query[] = [
    {
      sql: "INSERT INTO scenarios (id,month,created_at) VALUES (?,?,?)",
      params: [id, month, new Date().toISOString()],
    },
  ];
  for (const p of products)
    queries.push(
      seedAssetQuery(
        id,
        p.id,
        p.total,
        p.freeUnits,
        window.today,
        `${month.slice(0, 8)}${String(p.releaseDay).padStart(2, "0")}`,
        later,
      ),
    );
  await runBatch(queries);
  return { id, month };
}
