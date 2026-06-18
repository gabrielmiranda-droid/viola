from __future__ import annotations

import queue
import threading
import time
import tkinter as tk
from tkinter import ttk

from config import Config, load_config
from main import build_printer, process_job
from supabase_client import PrintJobRepository


class PrinterMonitorApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Viola Printer Monitor")
        self.root.geometry("560x420")
        self.root.minsize(520, 380)

        self.messages: queue.Queue[str] = queue.Queue()
        self.stop_event = threading.Event()
        self.worker: threading.Thread | None = None

        self.status_var = tk.StringVar(value="Iniciando...")
        self.mode_var = tk.StringVar(value="Modo: carregando")
        self.last_event_var = tk.StringVar(value="Aguardando conexao")

        self._build_ui()
        self._start_worker()
        self._poll_messages()

        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_ui(self) -> None:
        self.root.configure(bg="#0f172a")

        container = ttk.Frame(self.root, padding=18)
        container.pack(fill="both", expand=True)

        title = ttk.Label(container, text="Viola Printer Monitor", font=("Segoe UI", 18, "bold"))
        title.pack(anchor="w")

        subtitle = ttk.Label(
            container,
            text="Servico local de impressao do PDV",
            font=("Segoe UI", 10),
        )
        subtitle.pack(anchor="w", pady=(2, 16))

        cards = ttk.Frame(container)
        cards.pack(fill="x", pady=(0, 14))

        self._add_card(cards, "Status", self.status_var).pack(side="left", fill="x", expand=True, padx=(0, 8))
        self._add_card(cards, "Configuracao", self.mode_var).pack(side="left", fill="x", expand=True, padx=(8, 0))

        last_event = ttk.Label(container, textvariable=self.last_event_var, font=("Segoe UI", 11, "bold"))
        last_event.pack(anchor="w", pady=(0, 8))

        self.log_text = tk.Text(
            container,
            height=14,
            relief="flat",
            bg="#020617",
            fg="#e5e7eb",
            insertbackground="#e5e7eb",
            font=("Consolas", 10),
            wrap="word",
        )
        self.log_text.pack(fill="both", expand=True)
        self.log_text.configure(state="disabled")

        footer = ttk.Label(
            container,
            text="Deixe esta janela aberta para imprimir automaticamente.",
            font=("Segoe UI", 9),
        )
        footer.pack(anchor="w", pady=(10, 0))

    def _add_card(self, parent: ttk.Frame, label: str, value: tk.StringVar) -> ttk.Frame:
        frame = ttk.Frame(parent, padding=12)
        ttk.Label(frame, text=label, font=("Segoe UI", 9)).pack(anchor="w")
        ttk.Label(frame, textvariable=value, font=("Segoe UI", 12, "bold")).pack(anchor="w", pady=(4, 0))
        return frame

    def _start_worker(self) -> None:
        self.worker = threading.Thread(target=self._run_service, daemon=True)
        self.worker.start()

    def _run_service(self) -> None:
        try:
            self._emit("Conectando...")
            config = load_config()
            self._update_mode(config)
            repository = PrintJobRepository(config.supabase_url, config.supabase_service_role_key)
            printer = build_printer(config)

            self._emit("Servico iniciado.")
            while not self.stop_event.is_set():
                self._emit("Buscando pedidos...")
                jobs = repository.get_pending_jobs()

                for job in jobs:
                    if self.stop_event.is_set():
                        break

                    process_job(job, printer, repository, self._emit)

                self.stop_event.wait(config.poll_interval)
        except Exception as error:
            self._emit(f"Erro: {error}")
            self.messages.put("__STATUS__:Erro")

    def _update_mode(self, config: Config) -> None:
        label = "Mock" if config.printer_mode == "mock" else "USB"
        self.messages.put(f"__MODE__:Modo: {label}")

    def _emit(self, message: str) -> None:
        self.messages.put(message)

    def _poll_messages(self) -> None:
        while True:
            try:
                message = self.messages.get_nowait()
            except queue.Empty:
                break

            if message.startswith("__MODE__:"):
                self.mode_var.set(message.removeprefix("__MODE__:"))
                continue

            if message.startswith("__STATUS__:"):
                self.status_var.set(message.removeprefix("__STATUS__:"))
                continue

            if message == "Servico iniciado.":
                self.status_var.set("Rodando")

            self.last_event_var.set(message)
            self._append_log(message)

        self.root.after(300, self._poll_messages)

    def _append_log(self, message: str) -> None:
        timestamp = time.strftime("%H:%M:%S")
        self.log_text.configure(state="normal")
        self.log_text.insert("end", f"[{timestamp}] {message}\n")
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    def _on_close(self) -> None:
        self.stop_event.set()
        self.root.destroy()


def main() -> None:
    root = tk.Tk()
    PrinterMonitorApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
