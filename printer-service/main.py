from __future__ import annotations

import time
from collections.abc import Callable

from config import Config, load_config
from elgin_printer import ElginPrinter
from mock_printer import MockPrinter
from printer import Order, Printer
from supabase_client import PrintJob, PrintJobRepository


def log(message: str) -> None:
    print(message, flush=True)


def build_printer(config: Config) -> Printer:
    if config.printer_mode == "mock":
        return MockPrinter(config.printed_mock_dir)

    if config.printer_mode == "usb":
        printer = ElginPrinter(config.printer_vendor_id, config.printer_product_id)
        printer.connect()
        return printer

    raise ValueError("PRINTER_MODE deve ser mock ou usb.")


Logger = Callable[[str], None]


def process_job(
    job: PrintJob,
    printer: Printer,
    repository: PrintJobRepository,
    emit: Logger = log,
) -> None:
    emit("Pedido encontrado.")
    logs: list[str] = ["Pedido encontrado."]
    repository.mark_processing(job, logs)

    try:
        order = Order.from_payload(job.order_payload)

        emit("Gerando cozinha...")
        logs.append("Gerando cozinha...")
        printer.print_kitchen(order)

        emit("Gerando caixa...")
        logs.append("Gerando caixa...")
        printer.print_cashier(order)

        emit("Gerando delivery...")
        logs.append("Gerando delivery...")
        printer.print_delivery(order)

        emit("Arquivos criados.")
        logs.append("Arquivos criados.")
        emit("Pedido concluido.")
        logs.append("Pedido concluido.")
        repository.mark_printed(job.id, logs)
    except Exception as error:
        message = str(error)
        logs.append(f"Erro: {message}")
        repository.mark_error(job.id, message, logs)
        emit(f"Erro ao processar pedido {job.order_number}: {message}")


def main() -> None:
    log("Conectando...")
    config = load_config()
    repository = PrintJobRepository(
        config.supabase_url,
        config.supabase_service_role_key,
    )
    printer = build_printer(config)

    while True:
        log("Buscando pedidos...")
        jobs = repository.get_pending_jobs()

        for job in jobs:
            process_job(job, printer, repository)

        time.sleep(config.poll_interval)


if __name__ == "__main__":
    main()
