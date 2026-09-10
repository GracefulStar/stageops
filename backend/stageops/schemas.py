import re
from datetime import date, timedelta
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid", str_strip_whitespace=True
    )


class Contact(ApiModel):
    first_name: str = Field(min_length=1, max_length=60)
    last_name: str = Field(min_length=1, max_length=60)
    email: EmailStr = Field(max_length=160)
    phone: str = Field(max_length=25)

    @field_validator("phone")
    @classmethod
    def phone_number(cls, value: str) -> str:
        if not re.fullmatch(r"[+\d()\s-]+", value) or not 7 <= len(re.sub(r"\D", "", value)) <= 15:
            raise ValueError("Phone must contain 7–15 digits")
        return value


class RentalRange(ApiModel):
    start: date
    end: date

    @field_validator("start", "end", mode="before")
    @classmethod
    def calendar_date(cls, value):
        if isinstance(value, date):
            return value
        if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            raise ValueError("Use YYYY-MM-DD")
        return value

    @model_validator(mode="after")
    def ordered_dates(self):
        if self.start > self.end or self.end == date.max:
            raise ValueError("Invalid rental period")
        return self

    @property
    def end_exclusive(self) -> date:
        return self.end + timedelta(days=1)


class CartItem(ApiModel):
    product_id: str = Field(min_length=1, max_length=60)
    quantity: Annotated[int, Field(strict=True, ge=1, le=6)]
    range: RentalRange


class OrderInput(ApiModel):
    request_id: UUID
    contact: Contact
    items: list[CartItem] = Field(min_length=1, max_length=12)

    @model_validator(mode="after")
    def unique_products(self):
        if len({item.product_id for item in self.items}) != len(self.items):
            raise ValueError("A product may appear only once")
        return self


class Receipt(ApiModel):
    number: str
    created_at: str
    items: int
