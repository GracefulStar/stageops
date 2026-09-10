from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="STAGEOPS_", env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://stageops:stageops@localhost:5432/stageops"
    allowed_origins: list[str] = Field(default_factory=lambda: ["http://localhost:8000"])
    cookie_secure: bool = False
    time_zone: str = "Asia/Tashkent"
    frontend_dir: Path = Path(__file__).resolve().parents[2] / "frontend-dist"

    @field_validator("database_url")
    @classmethod
    def postgres_only(cls, value: str) -> str:
        if value.startswith("postgresql://"):
            value = value.replace("postgresql://", "postgresql+psycopg://", 1)
        if not value.startswith("postgresql+psycopg://"):
            raise ValueError("StageOps requires PostgreSQL with the psycopg driver")
        return value
