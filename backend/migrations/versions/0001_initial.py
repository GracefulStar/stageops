"""Initial PostgreSQL schema, including the no-overlap constraint."""

from pathlib import Path

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    source = Path(__file__).with_suffix(".sql").read_text()
    for statement in source.split("--> statement-breakpoint"):
        if statement.strip():
            op.execute(statement)


def downgrade():
    for table in (
        "system_events",
        "reservations",
        "purchase_requests",
        "order_lines",
        "orders",
        "assets",
        "scenarios",
        "products",
    ):
        op.drop_table(table)
    # btree_gist may be shared with other schemas; keep the extension installed.
