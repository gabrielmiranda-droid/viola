from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os
import sys

from dotenv import load_dotenv


@dataclass(frozen=True)
class Config:
    printer_mode: str
    supabase_url: str
    supabase_service_role_key: str
    printer_vendor_id: str
    printer_product_id: str
    poll_interval: int
    printed_mock_dir: Path


def load_config() -> Config:
    base_dir = resolve_base_dir()
    env_file = base_dir / ".env"
    load_dotenv(env_file if env_file.exists() else None)

    return Config(
        printer_mode=os.getenv("PRINTER_MODE", "mock").strip().lower(),
        supabase_url=os.getenv("SUPABASE_URL", "").strip(),
        supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip(),
        printer_vendor_id=os.getenv("PRINTER_VENDOR_ID", "").strip(),
        printer_product_id=os.getenv("PRINTER_PRODUCT_ID", "").strip(),
        poll_interval=int(os.getenv("POLL_INTERVAL", "2")),
        printed_mock_dir=base_dir / "printed_mock",
    )


def resolve_base_dir() -> Path:
    if getattr(sys, "frozen", False):
        executable_dir = Path(sys.executable).resolve().parent
        if executable_dir.name.lower() == "dist":
            return executable_dir.parent

        return executable_dir

    return Path(__file__).resolve().parent
