import logging
from contextlib import asynccontextmanager
from typing import Annotated
from uuid import UUID

from fastapi import Depends, FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .booking import BookingError, place_order
from .catalog import create_scenario, rental_window, seed_catalog
from .config import Settings
from .database import make_database
from .models import Product, Scenario
from .operations import operations_snapshot
from .schemas import OrderInput, Receipt

COOKIE = "stageops_scenario"
logger = logging.getLogger("stageops")


def booking_window(request: Request) -> dict:
    return rental_window(time_zone=request.app.state.settings.time_zone)


BookingWindow = Annotated[dict, Depends(booking_window)]


def current_scenario(session: Session, request: Request, *, lock: bool = False):
    try:
        scenario_id = UUID(request.cookies.get(COOKIE, ""))
    except ValueError:
        return None
    query = select(Scenario).where(Scenario.id == scenario_id)
    if lock:
        query = query.with_for_update(read=True)
    return session.scalar(query)


def json_response(data, status: int = 200) -> JSONResponse:
    return JSONResponse(jsonable_encoder(data), status_code=status)


def set_scenario_cookie(response: JSONResponse, scenario: Scenario, settings: Settings):
    response.set_cookie(
        COOKIE,
        str(scenario.id),
        max_age=30 * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


class ApiPolicy:
    """Bound POST bodies before parsing; keep API responses out of shared caches."""

    def __init__(self, app, settings: Settings):
        self.app, self.settings = app, settings

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/api/"):
            return await self.app(scope, receive, send)

        async def api_send(message):
            if message["type"] == "http.response.start":
                message["headers"] += [
                    (b"cache-control", b"no-store"),
                    (b"x-stageops-backend", b"python-fastapi"),
                ]
            await send(message)

        if scope["method"] == "POST":
            headers = dict(scope["headers"])
            origin = headers.get(b"origin", b"").decode()
            if origin and origin not in self.settings.allowed_origins:
                return await json_response({"error": "Недопустимый источник запроса."}, 403)(
                    scope, receive, api_send
                )
            body = bytearray()
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                body.extend(message.get("body", b""))
                if len(body) > 24000:
                    return await json_response({"error": "Заказ слишком большой."}, 413)(
                        scope, receive, api_send
                    )
                if not message.get("more_body", False):
                    break
            delivered = False

            async def buffered_receive():
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {"type": "http.request", "body": bytes(body), "more_body": False}
                return await receive()

            return await self.app(scope, buffered_receive, api_send)
        return await self.app(scope, receive, api_send)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    engine, sessions = make_database(settings.database_url)

    @asynccontextmanager
    async def lifespan(app):
        with sessions.begin() as session:
            seed_catalog(session)
        yield
        engine.dispose()

    app = FastAPI(
        title="StageOps API",
        version="0.1.0",
        lifespan=lifespan,
        description=(
            "Rental allocation and internal procurement. Demo data is isolated by browser cookie."
        ),
    )
    app.state.settings, app.state.sessions, app.state.engine = settings, sessions, engine
    app.add_middleware(ApiPolicy, settings=settings)

    @app.exception_handler(BookingError)
    async def booking_error(request, error):
        return json_response({"error": error.message}, error.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, error):
        return json_response({"error": "Проверьте контакты, количество и даты аренды."}, 400)

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request, error):
        logger.error("Database operation failed: %s", type(error).__name__)
        return json_response(
            {"error": "Не удалось сохранить или загрузить данные. Попробуйте ещё раз."}, 503
        )

    @app.get("/healthz", tags=["Health"])
    def health():
        with sessions() as session:
            session.execute(text("SELECT 1"))
        return {"status": "ok", "backend": "python-fastapi", "database": "postgresql"}

    @app.get("/api/catalog", tags=["Customer"])
    def catalog(request: Request, window: BookingWindow):
        with sessions.begin() as session:
            scenario = current_scenario(session, request)
            created = scenario is None
            if created:
                scenario = create_scenario(session, window["today"])
            products = list(session.scalars(select(Product).order_by(Product.position)))
            result = {
                "products": [
                    {key: getattr(p, key) for key in ("id", "category", "name", "kind", "detail")}
                    for p in products
                ],
                "window": window,
                "scenarioMonth": scenario.month,
            }
        response = json_response(result)
        if created:
            set_scenario_cookie(response, scenario, settings)
        return response

    @app.post(
        "/api/orders",
        tags=["Customer"],
        response_model=Receipt,
        responses={201: {"model": Receipt}, 400: {}, 401: {}, 409: {}, 503: {}},
    )
    def order(value: OrderInput, request: Request, window: BookingWindow):
        try:
            scenario_id = UUID(request.cookies.get(COOKIE, ""))
        except ValueError as error:
            raise BookingError("Обновите страницу, чтобы продолжить оформление.", 401) from error
        with sessions.begin() as session:
            receipt, created = place_order(session, scenario_id, value, window["minDate"])
        # The transaction has committed before returning success to the client.
        return json_response(receipt.model_dump(by_alias=True), 201 if created else 200)

    @app.get("/api/operations", tags=["Operator"])
    def operations(request: Request, window: BookingWindow):
        with sessions.begin() as session:
            scenario = current_scenario(session, request, lock=True)
            if scenario is None:
                raise BookingError("Обновите страницу, чтобы открыть склад.", 401)
            return operations_snapshot(session, scenario, window["today"])

    @app.post("/api/scenario", tags=["Demo"], status_code=201)
    def reset_scenario(window: BookingWindow):
        with sessions.begin() as session:
            scenario = create_scenario(session, window["today"])
        response = json_response({"ok": True}, 201)
        set_scenario_cookie(response, scenario, settings)
        return response

    if (settings.frontend_dir / "index.html").is_file():

        @app.get("/", include_in_schema=False)
        @app.get("/operator", include_in_schema=False)
        def frontend():
            return FileResponse(
                settings.frontend_dir / "index.html", headers={"Cache-Control": "no-cache"}
            )

        app.mount("/", StaticFiles(directory=settings.frontend_dir), name="frontend")
    return app


app = create_app()
