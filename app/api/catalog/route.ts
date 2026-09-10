import { products, rentalWindow } from "@/lib/catalog";
import { pythonGateway } from "@/lib/python-gateway";
import {
  createScenario,
  currentScenario,
  json,
  scenarioCookie,
} from "@/lib/server";
export async function GET(request: Request) {
  const forwarded = await pythonGateway(request);
  if (forwarded) return forwarded;
  try {
    let scenario = await currentScenario(request);
    let cookie: string | undefined;
    if (!scenario) {
      scenario = await createScenario();
      cookie = scenarioCookie(scenario.id, request);
    }
    return json(
      { products, window: rentalWindow(), scenarioMonth: scenario.month },
      200,
      cookie,
    );
  } catch (error) {
    console.error("Catalog unavailable", error);
    return json({ error: "Не удалось загрузить оборудование." }, 503);
  }
}
