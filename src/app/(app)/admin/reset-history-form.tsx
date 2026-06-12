"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { ActionResult } from "@/lib/types";
import { cn } from "@/lib/cn";
import { resetOperationalHistoryAction } from "./actions";

const initialState: ActionResult = { ok: false };

export function ResetHistoryForm() {
  const [confirmation, setConfirmation] = useState("");
  const [state, action, pending] = useActionState(
    resetOperationalHistoryAction,
    initialState,
  );
  const confirmed = confirmation.trim().toUpperCase() === "LIMPAR HISTORICO";

  return (
    <form action={action} className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/5 p-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_300px_auto] lg:items-end">
        <div>
          <h3 className="font-black text-rose-100">Limpar historico operacional</h3>
          <p className="mt-1 text-sm text-muted">
            Arquiva caixas, vendas, entradas, saidas e conferencias anteriores. Usuarios e
            produtos permanecem.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="reset_confirmation">Digite LIMPAR HISTORICO</Label>
          <Input
            id="reset_confirmation"
            name="confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
          />
        </div>
        <Button type="submit" variant="danger" disabled={pending || !confirmed}>
          {pending ? "Limpando..." : "Limpar simulacao"}
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
