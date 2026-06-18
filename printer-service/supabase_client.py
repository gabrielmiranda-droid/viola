from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx


@dataclass(frozen=True)
class PrintJob:
    id: str
    order_number: str
    order_payload: dict[str, Any]
    attempts: int


class PrintJobRepository:
    def __init__(self, supabase_url: str, service_role_key: str) -> None:
        if not supabase_url or not service_role_key:
            raise ValueError("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.")

        self.base_url = supabase_url.rstrip("/")
        self.headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
        }
        self.client = httpx.Client(base_url=f"{self.base_url}/rest/v1", headers=self.headers, timeout=15)

    def get_pending_jobs(self, limit: int = 10) -> list[PrintJob]:
        response = self.client.get(
            "/print_jobs",
            params={
                "select": "id,order_number,order_payload,attempts",
                "status": "eq.pending",
                "order": "created_at.asc",
                "limit": str(limit),
            },
        )
        response.raise_for_status()

        return [
            PrintJob(
                id=row["id"],
                order_number=row["order_number"],
                order_payload=row["order_payload"],
                attempts=int(row.get("attempts") or 0),
            )
            for row in response.json()
        ]

    def mark_processing(self, job: PrintJob, logs: list[str]) -> None:
        self._update(job.id, {
            "status": "processing",
            "attempts": job.attempts + 1,
            "logs": logs,
        })

    def mark_printed(self, job_id: str, logs: list[str]) -> None:
        self._update(job_id, {
            "status": "printed",
            "logs": logs,
            "error_message": None,
            "printed_at": current_timestamp(),
        })

    def mark_error(self, job_id: str, message: str, logs: list[str]) -> None:
        self._update(job_id, {
            "status": "error",
            "logs": logs,
            "error_message": message,
        })

    def _update(self, job_id: str, payload: dict[str, Any]) -> None:
        payload["updated_at"] = current_timestamp()
        response = self.client.patch(
            "/print_jobs",
            params={"id": f"eq.{job_id}"},
            headers={"Prefer": "return=minimal"},
            json=payload,
        )
        response.raise_for_status()


def current_timestamp() -> str:
    return datetime.now(UTC).isoformat()
