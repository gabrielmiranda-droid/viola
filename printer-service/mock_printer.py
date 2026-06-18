from __future__ import annotations

from pathlib import Path

from formatter import format_order
from printer import Order, Printer


class MockPrinter(Printer):
    def __init__(self, output_dir: Path) -> None:
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def print_kitchen(self, order: Order) -> None:
        self._write(order, "cozinha")

    def print_cashier(self, order: Order) -> None:
        self._write(order, "caixa")

    def print_delivery(self, order: Order) -> None:
        self._write(order, "delivery")

    def _write(self, order: Order, destination: str) -> None:
        filename = f"pedido_{order.number}_{destination}.txt"
        path = self.output_dir / filename
        path.write_text(format_order(order), encoding="utf-8")
