import os
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool

from stageops.catalog import rental_window
from stageops.config import Settings
from stageops.main import booking_window, create_app


@pytest.fixture(scope="session")
def database_url():
    source = os.getenv("STAGEOPS_TEST_DATABASE_URL")
    if not source:
        pytest.skip("Set STAGEOPS_TEST_DATABASE_URL to run PostgreSQL integration tests")
    schema = "stageops_test_" + uuid4().hex
    admin = create_engine(source, poolclass=NullPool)
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    url = make_url(source).update_query_dict({"options": f"-csearch_path={schema},public"})
    value = url.render_as_string(hide_password=False)
    old = os.environ.get("STAGEOPS_DATABASE_URL")
    os.environ["STAGEOPS_DATABASE_URL"] = value
    try:
        command.upgrade(Config(str(Path(__file__).parents[1] / "alembic.ini")), "head")
        yield value
    finally:
        if old is None:
            os.environ.pop("STAGEOPS_DATABASE_URL", None)
        else:
            os.environ["STAGEOPS_DATABASE_URL"] = old
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


@pytest.fixture
def app(database_url):
    settings = Settings(database_url=database_url, allowed_origins=["http://testserver"])
    application = create_app(settings)
    application.dependency_overrides[booking_window] = lambda: rental_window(
        datetime(2026, 9, 9, tzinfo=UTC)
    )
    yield application


@pytest.fixture
def client(app):
    with TestClient(app) as client:
        response = client.get("/api/catalog")
        assert response.status_code == 200
        yield client


@pytest.fixture
def payload():
    def make(start="2026-10-17", end="2026-10-20", quantity=1, product_id="pa-kudo"):
        return {
            "requestId": str(uuid4()),
            "contact": {
                "firstName": "Demo",
                "lastName": "Tester",
                "email": "demo@example.com",
                "phone": "+1 202 555 0123",
            },
            "items": [
                {
                    "productId": product_id,
                    "quantity": quantity,
                    "range": {"start": start, "end": end},
                }
            ],
        }

    return make
