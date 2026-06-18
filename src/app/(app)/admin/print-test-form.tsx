"use client";

import { useActionState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/types";
import { cn } from "@/lib/cn";
import { createTestPrintJobAction } from "./actions";

const initialState: ActionResult<{ jobId: string }> = { ok: false };

export function PrintTestForm() {
  const [state, action, pending] = useActionState(
    createTestPrintJobAction,
    initialState,
  );

  return (
    <form action={action} className="mt-4 rounded-xl border border-accent/25 bg-accent/5 p-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <h3 className="font-black text-blue-100">Impressao de teste</h3>
          <p className="mt-1 text-sm text-muted">
            Cria um print_job pendente sem finalizar venda. Use com o printer-service
            em modo mock para gerar os arquivos TXT.
          </p>
        </div>
        <Button type="submit" disabled={pending}>
          <Printer className="h-4 w-4" />
          {pending ? "Gerando..." : "Gerar Pedido Teste"}
        </Button>
      </div>
      {state.message ? (
        <p className={cn("mt-3 text-sm", state.ok ? "text-green-300" : "text-rose-200")}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
