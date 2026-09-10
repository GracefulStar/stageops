import hashlib
import json
from datetime import UTC, date, datetime
from uuid import UUID, uuid4

from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session

from .models import (
    Asset,
    Order,
    OrderLine,
    Product,
    PurchaseRequest,
    Reservation,
    Scenario,
    SystemEvent,
)
from .schemas import OrderInput, Receipt


class BookingError(Exception):
    def __init__(self, message: str, status: int = 400):
        self.message, self.status = message, status


def overlaps(start: date, end_exclusive: date, other_start: date, other_end: date) -> bool:
    """Two inclusive customer ranges have already been converted to half-open intervals."""
    return start < other_end and other_start < end_exclusive


def request_fingerprint(order: OrderInput) -> str:
    value = order.model_dump(mode="json", exclude={"request_id"})
    value["items"].sort(key=lambda line: line["product_id"])
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()


def receipt_for(session: Session, order: Order) -> Receipt:
    quantity = session.scalar(
        select(func.sum(OrderLine.quantity)).where(OrderLine.order_id == order.id)
    )
    return Receipt(
        number=order.number,
        created_at=order.created_at.astimezone(UTC).isoformat(),
        items=quantity or 0,
    )


def place_order(session: Session, scenario_id: UUID, request: OrderInput, min_date: date):
    # Keep one inventory scenario's allocation transactions sequential. The lock is
    # held until the caller commits. Different scenarios use different row locks.
    scenario = session.scalar(select(Scenario).where(Scenario.id == scenario_id).with_for_update())
    if scenario is None:
        raise BookingError("Обновите страницу, чтобы продолжить оформление.", 401)

    fingerprint = request_fingerprint(request)
    existing = session.scalar(
        select(Order).where(
            Order.scenario_id == scenario_id, Order.request_id == request.request_id
        )
    )
    if existing:
        if existing.request_hash != fingerprint:
            raise BookingError("Этот запрос уже использован для другого заказа.", 409)
        return receipt_for(session, existing), False

    if any(item.range.start < min_date for item in request.items):
        raise BookingError("Аренда доступна только со следующего месяца. Обновите даты.")
    product_ids = set(session.scalars(select(Product.id)))
    if any(item.product_id not in product_ids for item in request.items):
        raise BookingError("Проверьте состав подбора.")

    now = datetime.now(UTC)
    order_id = uuid4()
    order = Order(
        id=order_id,
        number=f"ST-{now:%Y%m}-{order_id.hex[:12].upper()}",
        scenario_id=scenario_id,
        request_id=request.request_id,
        request_hash=fingerprint,
        **request.contact.model_dump(),
        created_at=now,
    )
    session.add(order)
    session.flush()
    for item in request.items:
        line = OrderLine(
            order_id=order.id,
            product_id=item.product_id,
            quantity=item.quantity,
            start_date=item.range.start,
            end_exclusive=item.range.end_exclusive,
        )
        session.add(line)
        session.flush()
        occupied = exists(
            select(Reservation.id).where(
                Reservation.asset_id == Asset.id,
                Reservation.start_date < line.end_exclusive,
                Reservation.end_exclusive > line.start_date,
            )
        )
        available = list(
            session.scalars(
                select(Asset)
                .where(
                    Asset.scenario_id == scenario_id,
                    Asset.product_id == item.product_id,
                    Asset.available_from <= line.start_date,
                    ~occupied,
                )
                .order_by(Asset.id)
                .limit(item.quantity)
            )
        )
        for asset in available:
            session.add(
                Reservation(
                    asset_id=asset.id,
                    line_id=line.id,
                    start_date=line.start_date,
                    end_exclusive=line.end_exclusive,
                )
            )
        missing = item.quantity - len(available)
        if missing:
            session.add(
                PurchaseRequest(
                    line_id=line.id,
                    quantity=missing,
                    needed_by=line.start_date,
                    created_at=now,
                )
            )
            session.add(
                SystemEvent(
                    order_id=order.id,
                    line_id=line.id,
                    quantity=missing,
                    created_at=now,
                )
            )
        session.flush()
    return receipt_for(session, order), True
