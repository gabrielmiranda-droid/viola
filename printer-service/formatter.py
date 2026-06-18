from __future__ import annotations

from decimal import Decimal

from printer import Order

WIDTH = 42


def format_currency(value: Decimal) -> str:
    formatted = f"{value:.2f}".replace(".", ",")
    return f"R$ {formatted}"


def separator() -> str:
    return "-" * WIDTH


def append_field(lines: list[str], label: str, value: str) -> None:
    clean = value.strip()
    if clean:
        lines.append(f"{label}: {clean}")


def format_order(order: Order) -> str:
    lines: list[str] = [
        separator(),
        "VIOLA".center(WIDTH),
        f"PEDIDO {order.number}",
        separator(),
        "",
    ]

    append_field(lines, "Cliente", order.customer_name)
    append_field(lines, "Telefone", order.customer_phone)
    append_field(lines, "Tipo", order.order_type)
    append_field(lines, "Endereco", order.delivery_address)
    append_field(lines, "Bairro", order.delivery_neighborhood)
    append_field(lines, "Referencia", order.delivery_reference)
    append_field(lines, "Motoboy", order.delivery_driver)
    append_field(lines, "Pagamento", order.payment_method)
    append_field(lines, "Maquininha", order.card_machine)

    lines.extend(["", "ITENS", separator()])

    for item in order.items:
        lines.append(f"{item.quantity}x {item.name}")
        for modifier in item.modifiers:
            lines.append(f"+ {modifier}")
        if item.observation:
            lines.append(f"Obs item: {item.observation}")
        if item.total > 0:
            lines.append(f"Subtotal: {format_currency(item.total)}")
        lines.append("")

    if order.observation:
        lines.extend(["OBSERVACAO", separator(), order.observation, ""])

    lines.append(separator())
    if order.delivery_fee > 0:
        lines.append(f"TAXA ENTREGA: {format_currency(order.delivery_fee)}")
    lines.extend([f"TOTAL: {format_currency(order.total)}", separator(), ""])

    return "\n".join(lines)
