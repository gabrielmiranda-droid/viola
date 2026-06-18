from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any


@dataclass(frozen=True)
class OrderItem:
    name: str
    quantity: int
    modifiers: list[str] = field(default_factory=list)
    observation: str = ""
    total: Decimal = Decimal("0")


@dataclass(frozen=True)
class Order:
    number: str
    customer_name: str
    customer_phone: str
    delivery_address: str
    delivery_neighborhood: str
    delivery_reference: str
    order_type: str
    delivery_fee: Decimal
    delivery_driver: str
    payment_method: str
    card_machine: str
    items: list[OrderItem]
    observation: str
    total: Decimal

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "Order":
        items = [
            OrderItem(
                name=str(item.get("name", "")).strip(),
                quantity=int(item.get("quantity", 1)),
                modifiers=[str(modifier).strip() for modifier in item.get("modifiers", [])],
                observation=str(item.get("observation", "")).strip(),
                total=Decimal(str(item.get("total", "0"))),
            )
            for item in payload.get("items", [])
        ]

        return cls(
            number=str(payload.get("number", "")).strip(),
            customer_name=str(payload.get("customer_name", "")).strip(),
            customer_phone=str(payload.get("customer_phone", "")).strip(),
            delivery_address=str(payload.get("delivery_address", "")).strip(),
            delivery_neighborhood=str(payload.get("delivery_neighborhood", "")).strip(),
            delivery_reference=str(payload.get("delivery_reference", "")).strip(),
            order_type=str(payload.get("order_type", "")).strip(),
            delivery_fee=Decimal(str(payload.get("delivery_fee", "0"))),
            delivery_driver=str(payload.get("delivery_driver", "")).strip(),
            payment_method=str(payload.get("payment_method", "")).strip(),
            card_machine=str(payload.get("card_machine", "")).strip(),
            items=items,
            observation=str(payload.get("observation", "")).strip(),
            total=Decimal(str(payload.get("total", "0"))),
        )


class Printer(ABC):
    @abstractmethod
    def print_kitchen(self, order: Order) -> None:
        pass

    @abstractmethod
    def print_cashier(self, order: Order) -> None:
        pass

    @abstractmethod
    def print_delivery(self, order: Order) -> None:
        pass
