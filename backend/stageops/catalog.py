import json
from datetime import UTC, date, datetime
from importlib.resources import files
from uuid import uuid4
from zoneinfo import ZoneInfo

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .models import Asset, Product, Scenario

FIXTURE = json.loads(files("stageops").joinpath("data/catalog.json").read_text())


def first_of_month_after(day: date, months: int = 1) -> date:
    year, month = divmod(day.year * 12 + day.month - 1 + months, 12)
    return date(year, month + 1, 1)


def rental_window(now: datetime | None = None, time_zone: str = "Asia/Tashkent") -> dict:
    today = (now or datetime.now(UTC)).astimezone(ZoneInfo(time_zone)).date()
    return {"today": today, "minDate": first_of_month_after(today), "timeZone": time_zone}


def seed_catalog(session: Session) -> None:
    for position, product in enumerate(FIXTURE["products"]):
        values = {key: product[key] for key in ("id", "category", "name", "kind", "detail")}
        session.execute(
            insert(Product).values(**values, position=position).on_conflict_do_nothing()
        )


def create_scenario(session: Session, today: date) -> Scenario:
    month = first_of_month_after(today)
    scenario = Scenario(id=uuid4(), month=month, created_at=datetime.now(UTC))
    session.add(scenario)
    session.flush()
    later = first_of_month_after(month, 3)
    for product in FIXTURE["products"]:
        for index in range(product["total"]):
            if index < product["freeUnits"]:
                available = today
            elif index == product["freeUnits"]:
                available = month.replace(day=product["releaseDay"])
            else:
                available = later
            session.add(
                Asset(scenario_id=scenario.id, product_id=product["id"], available_from=available)
            )
    session.flush()
    return scenario
