from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from uuid import UUID, uuid4

import pytest
from sqlalchemy import event, select, text
from sqlalchemy.exc import IntegrityError

from stageops.main import COOKIE
from stageops.models import Order, OrderLine, Reservation, SystemEvent


def snapshot(client):
    response = client.get("/api/operations")
    assert response.status_code == 200, response.text
    return response.json()


def test_catalog_is_database_backed_and_fixture_totals_match(client):
    catalog = client.get("/api/catalog")
    assert len(catalog.json()["products"]) == 12
    assert catalog.headers["x-stageops-backend"] == "python-fastapi"
    stock = snapshot(client)["stock"]
    assert sum(row["total"] for row in stock) == 343
    assert sum(row["inWarehouse"] for row in stock) == 13
    assert sum(row["total"] for row in stock[:4]) == 118


@pytest.mark.parametrize(
    "start,end,purchase",
    [
        ("2026-10-01", "2026-10-10", True),
        ("2026-10-16", "2026-10-16", True),
        ("2026-10-01", "2026-10-20", True),
        ("2026-10-17", "2026-10-20", False),
    ],
)
def test_full_interval_allocation_and_internal_shortages(client, payload, start, end, purchase):
    response = client.post("/api/orders", json=payload(start, end))
    assert response.status_code == 201, response.text
    assert set(response.json()) == {"number", "createdAt", "items"}
    result = snapshot(client)
    assert len(result["orders"]) == 1
    assert len(result["purchases"]) == int(purchase)
    assert sum(row["total"] for row in result["stock"]) == 343


def test_early_purchase_does_not_consume_later_available_asset(client, payload):
    assert client.post("/api/orders", json=payload("2026-10-02", "2026-10-20")).status_code == 201
    assert client.post("/api/orders", json=payload()).status_code == 201
    result = snapshot(client)
    assert len(result["purchases"]) == 1
    assert result["stock"][0]["reserved"] == 1


def test_overlapping_order_cannot_reuse_asset_but_adjacent_order_can(client, payload):
    for start, end in [
        ("2026-10-17", "2026-10-20"),
        ("2026-10-18", "2026-10-19"),
        ("2026-10-21", "2026-10-21"),
    ]:
        assert client.post("/api/orders", json=payload(start, end)).status_code == 201
    assert len(snapshot(client)["purchases"]) == 1


def test_only_missing_quantity_is_purchased_and_items_have_individual_dates(client, payload):
    value = payload(quantity=3)
    value["items"] += payload("2026-10-02", "2026-10-10", product_id="mic-sm58")["items"]
    assert client.post("/api/orders", json=value).status_code == 201
    purchases = {p["productId"]: p["quantity"] for p in snapshot(client)["purchases"]}
    assert purchases == {"pa-kudo": 2, "mic-sm58": 1}


def test_retry_returns_same_order_and_reused_key_with_new_body_is_rejected(client, payload):
    value = payload()
    first = client.post("/api/orders", json=value)
    again = client.post("/api/orders", json=value)
    assert first.status_code == 201 and again.status_code == 200
    assert first.json() == again.json()
    changed = deepcopy(value)
    changed["items"][0]["quantity"] = 2
    assert client.post("/api/orders", json=changed).status_code == 409
    assert len(snapshot(client)["orders"]) == 1


def test_retry_timestamp_does_not_depend_on_database_timezone(client, app, payload):
    with app.state.sessions.begin() as session:
        session.execute(text("SET TIME ZONE 'Pacific/Auckland'"))
    try:
        value = payload()
        first = client.post("/api/orders", json=value)
        again = client.post("/api/orders", json=value)
        assert first.status_code == 201 and again.status_code == 200
        assert first.json() == again.json()
        assert first.json()["createdAt"].endswith("+00:00")
    finally:
        with app.state.sessions.begin() as session:
            session.execute(text("SET TIME ZONE 'UTC'"))


@pytest.mark.parametrize("mutation", ["past", "unknown", "duplicate", "contact"])
def test_invalid_order_has_no_side_effects(client, payload, mutation):
    value = payload()
    if mutation == "past":
        value["items"][0]["range"] = {"start": "2026-09-30", "end": "2026-10-02"}
    elif mutation == "unknown":
        value["items"][0]["productId"] = "nonexistent"
    elif mutation == "duplicate":
        value["items"] *= 2
    else:
        value["contact"]["email"] = "broken"
    assert client.post("/api/orders", json=value).status_code == 400
    assert snapshot(client)["orders"] == []


def test_session_isolation_and_new_scenario_preserve_old_records(client, payload):
    old_cookie = client.cookies.get(COOKIE)
    assert client.post("/api/orders", json=payload()).status_code == 201
    assert client.post("/api/scenario").status_code == 201
    assert snapshot(client)["orders"] == []
    client.cookies.clear()
    client.cookies.set(COOKIE, old_cookie)
    assert len(snapshot(client)["orders"]) == 1


def test_origin_payload_limit_and_missing_cookie(client, payload):
    assert (
        client.post(
            "/api/orders", json=payload(), headers={"Origin": "https://other.example"}
        ).status_code
        == 403
    )
    assert client.post("/api/orders", content=b"x" * 24001).status_code == 413
    client.cookies.clear()
    assert client.post("/api/orders", json=payload()).status_code == 401


def test_entire_transaction_rolls_back_when_event_insert_fails(client, payload):
    def break_event(mapper, connection, target):
        target.quantity = 0  # Forces a real database CHECK failure after the other inserts.

    event.listen(SystemEvent, "before_insert", break_event)
    value = payload("2026-10-01", "2026-10-10")
    try:
        assert client.post("/api/orders", json=value).status_code == 503
    finally:
        event.remove(SystemEvent, "before_insert", break_event)
    result = snapshot(client)
    assert result["orders"] == result["purchases"] == []
    assert client.post("/api/orders", json=value).status_code == 201


def test_database_constraint_rejects_overlapping_direct_insert(client, app, payload):
    assert client.post("/api/orders", json=payload()).status_code == 201
    scenario_id = UUID(client.cookies.get(COOKIE))
    with pytest.raises(IntegrityError), app.state.sessions.begin() as session:
        original = session.scalar(
            select(Reservation).join(OrderLine).join(Order).where(Order.scenario_id == scenario_id)
        )
        second_line = OrderLine(
            id=uuid4(),
            order_id=session.scalar(select(Order.id).where(Order.scenario_id == scenario_id)),
            product_id="mic-sm58",
            quantity=1,
            start_date=original.start_date,
            end_exclusive=original.end_exclusive,
        )
        session.add(second_line)
        session.flush()
        session.add(
            Reservation(
                asset_id=original.asset_id,
                line_id=second_line.id,
                start_date=original.start_date,
                end_exclusive=original.end_exclusive,
            )
        )
        session.flush()


@pytest.mark.postgres
@pytest.mark.parametrize("same_request", [False, True])
def test_concurrent_requests_use_real_database_locks(client, payload, same_request):
    first = payload()
    second = deepcopy(first) if same_request else payload()
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(
            pool.map(lambda value: client.post("/api/orders", json=value), [first, second])
        )
    assert sorted(r.status_code for r in responses) == ([200, 201] if same_request else [201, 201])
    result = snapshot(client)
    assert len(result["orders"]) == (1 if same_request else 2)
    assert len(result["purchases"]) == (0 if same_request else 1)
    assert result["stock"][0]["reserved"] == 1


def test_frontend_operator_and_api_docs_are_served_by_python(client):
    for path in ("/", "/operator", "/images/sound.png", "/docs", "/openapi.json"):
        response = client.get(path)
        assert response.status_code == 200, f"{path}: {response.text[:120]}"
    assert client.get("/").text == client.get("/operator").text
    assert client.get("/healthz").json()["backend"] == "python-fastapi"
    assert "/api/orders" in client.get("/openapi.json").json()["paths"]
