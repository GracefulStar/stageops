from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import ExcludeConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.sql import text


class Base(DeclarativeBase):
    pass


class Product(Base):
    __tablename__ = "products"
    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    category: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(String(100))
    detail: Mapped[str] = mapped_column(String(160))
    position: Mapped[int]


class Scenario(Base):
    __tablename__ = "scenarios"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    month: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Asset(Base):
    __tablename__ = "assets"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    scenario_id: Mapped[UUID] = mapped_column(ForeignKey("scenarios.id"))
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"))
    available_from: Mapped[date] = mapped_column(Date)
    __table_args__ = (Index("ix_asset_scenario_product", "scenario_id", "product_id"),)


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    number: Mapped[str] = mapped_column(String(40), unique=True)
    scenario_id: Mapped[UUID] = mapped_column(ForeignKey("scenarios.id"))
    request_id: Mapped[UUID]
    request_hash: Mapped[str] = mapped_column(String(64))
    first_name: Mapped[str] = mapped_column(String(60))
    last_name: Mapped[str] = mapped_column(String(60))
    email: Mapped[str] = mapped_column(String(160))
    phone: Mapped[str] = mapped_column(String(25))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    __table_args__ = (UniqueConstraint("scenario_id", "request_id", name="uq_order_request"),)


class OrderLine(Base):
    __tablename__ = "order_lines"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    order_id: Mapped[UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[int]
    start_date: Mapped[date] = mapped_column(Date)
    end_exclusive: Mapped[date] = mapped_column(Date)
    __table_args__ = (
        CheckConstraint("quantity BETWEEN 1 AND 6", name="ck_line_quantity"),
        CheckConstraint("start_date < end_exclusive", name="ck_line_dates"),
        UniqueConstraint("order_id", "product_id", name="uq_order_product"),
    )


class Reservation(Base):
    __tablename__ = "reservations"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    asset_id: Mapped[UUID] = mapped_column(ForeignKey("assets.id"))
    line_id: Mapped[UUID] = mapped_column(ForeignKey("order_lines.id"), index=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_exclusive: Mapped[date] = mapped_column(Date)
    __table_args__ = (
        CheckConstraint("start_date < end_exclusive", name="ck_reservation_dates"),
        UniqueConstraint("asset_id", "line_id", name="uq_asset_line"),
        ExcludeConstraint(
            ("asset_id", "="),
            (text("daterange(start_date, end_exclusive, '[)')"), "&&"),
            name="no_asset_overlap",
            using="gist",
        ),
    )


class PurchaseRequest(Base):
    __tablename__ = "purchase_requests"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    line_id: Mapped[UUID] = mapped_column(ForeignKey("order_lines.id"), unique=True)
    quantity: Mapped[int]
    needed_by: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="requested")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_purchase_quantity"),
        CheckConstraint("status = 'requested'", name="ck_purchase_status"),
    )


class SystemEvent(Base):
    __tablename__ = "system_events"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    order_id: Mapped[UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    line_id: Mapped[UUID] = mapped_column(ForeignKey("order_lines.id"), unique=True)
    type: Mapped[str] = mapped_column(String(40), default="stock_shortage")
    quantity: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    __table_args__ = (CheckConstraint("quantity > 0", name="ck_event_quantity"),)
