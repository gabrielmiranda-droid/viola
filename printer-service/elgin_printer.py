from __future__ import annotations

from formatter import format_order
from printer import Order, Printer


class ElginPrinter(Printer):
    def __init__(self, vendor_id: str, product_id: str) -> None:
        self.vendor_id = vendor_id
        self.product_id = product_id
        self._device = None

    def connect(self) -> None:
        # Futuro ponto de integração com python-escpos:
        #
        # from escpos.printer import Usb
        # self._device = Usb(int(self.vendor_id, 16), int(self.product_id, 16))
        #
        # A Elgin i9 USB deverá ser validada no cliente com Vendor ID e
        # Product ID reais. A interface do restante do sistema não muda.
        print("Conectando Elgin i9 USB...")

    def disconnect(self) -> None:
        # Quando python-escpos estiver ativo, fechar/liberar o dispositivo aqui
        # se o backend USB exigir.
        print("Desconectando Elgin i9 USB...")
        self._device = None

    def print_kitchen(self, order: Order) -> None:
        self._print_text(format_order(order))

    def print_cashier(self, order: Order) -> None:
        self._print_text(format_order(order))

    def print_delivery(self, order: Order) -> None:
        self._print_text(format_order(order))

    def _print_text(self, text: str) -> None:
        # Implementação futura com python-escpos:
        #
        # if self._device is None:
        #     self.connect()
        # self._device.text(text)
        # self._device.cut()
        #
        # Por enquanto, manter falha explícita evita falso positivo em campo.
        raise NotImplementedError(
            "Impressão USB ainda não implementada. Use PRINTER_MODE=mock em casa."
        )
