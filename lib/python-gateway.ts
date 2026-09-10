import { env } from "cloudflare:workers";

/** The Sites UI can forward its existing API to a separately hosted Python app. */
export async function pythonGateway(request: Request): Promise<Response | null> {
  const origin = (env as unknown as Record<string, unknown>).PYTHON_API_URL;
  if (typeof origin !== "string" || !origin) return null;
  try {
    const backend = new URL(origin);
    if (backend.protocol !== "https:" || backend.pathname !== "/" || backend.username || backend.password || backend.search || backend.hash) {
      throw new Error("PYTHON_API_URL must be an HTTPS origin");
    }
    const incoming = new URL(request.url);
    const target = new URL(incoming.pathname + incoming.search, backend);
    const headers = new Headers();
    for (const name of ["content-type", "accept", "cookie", "origin"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    let body: ArrayBuffer | undefined;
    if (request.method === "POST") {
      body = await request.arrayBuffer();
      if (body.byteLength > 24000) return Response.json({ error: "Заказ слишком большой." }, {
        status: 413, headers: { "Cache-Control": "no-store" },
      });
    }
    const response = await fetch(target, {
      method: request.method, headers, body, redirect: "manual", signal: AbortSignal.timeout(10000),
    });
    if (response.status >= 300 && response.status < 400) throw new Error("Unexpected API redirect");
    const outgoing = new Headers({ "Cache-Control": "no-store" });
    for (const name of ["content-type", "set-cookie", "retry-after", "x-stageops-backend"]) {
      const value = response.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch {
    // Never fall back to another database after a Python request may have committed.
    return Response.json({ error: "Сервис временно недоступен. Попробуйте ещё раз." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
