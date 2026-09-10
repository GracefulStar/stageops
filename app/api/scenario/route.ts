import { createScenario, json, sameOrigin, scenarioCookie } from "@/lib/server";
import { pythonGateway } from "@/lib/python-gateway";
export async function POST(request: Request) {
  const forwarded = await pythonGateway(request);
  if (forwarded) return forwarded;
  if (!sameOrigin(request))
    return json({ error: "Недопустимый источник запроса." }, 403);
  try {
    const scenario = await createScenario();
    return json({ ok: true }, 201, scenarioCookie(scenario.id, request));
  } catch (error) {
    console.error("Scenario unavailable", error);
    return json({ error: "Не удалось создать сценарий." }, 503);
  }
}
