from datetime import UTC, date, datetime

import pytest
from pydantic import ValidationError

from stageops.booking import overlaps, request_fingerprint
from stageops.catalog import first_of_month_after, rental_window
from stageops.schemas import OrderInput


def test_calendar_cutoff_handles_business_timezone_and_year_rollover():
    value = rental_window(datetime(2026, 12, 31, 20, 0, tzinfo=UTC))
    assert value["today"] == date(2027, 1, 1)
    assert value["minDate"] == date(2027, 2, 1)
    assert first_of_month_after(date(2028, 2, 29)) == date(2028, 3, 1)


def test_half_open_intervals_allow_adjacent_rentals():
    start, end = date(2026, 10, 17), date(2026, 10, 21)
    assert overlaps(start, end, date(2026, 10, 20), date(2026, 10, 22))
    assert not overlaps(start, end, date(2026, 10, 21), date(2026, 10, 22))


@pytest.mark.parametrize("quantity", [True, "1", 0, 7, 1.5])
def test_rejects_invalid_quantities(payload, quantity):
    with pytest.raises(ValidationError):
        OrderInput.model_validate(payload(quantity=quantity))


@pytest.mark.parametrize(
    "start,end",
    [
        ("2026-02-30", "2026-03-01"),
        ("2026-10-20", "2026-10-17"),
        (123, 124),
        ("2026-10-17T00:00:00", "2026-10-18"),
    ],
)
def test_rejects_invalid_dates(payload, start, end):
    with pytest.raises(ValidationError):
        OrderInput.model_validate(payload(start, end))


def test_one_day_range_and_canonical_idempotency_payload(payload):
    value = payload("2026-10-17", "2026-10-17")
    parsed = OrderInput.model_validate(value)
    assert parsed.items[0].range.end_exclusive == date(2026, 10, 18)
    a = request_fingerprint(parsed)
    value["items"][0]["quantity"] = 2
    assert request_fingerprint(OrderInput.model_validate(value)) != a
