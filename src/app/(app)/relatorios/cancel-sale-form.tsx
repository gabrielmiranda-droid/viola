"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cancelSaleAction } from "./actions";

export function CancelSaleForm({ saleId }: { saleId: string }) {
  const [state, action, pending] = useActionState(cancelSaleAction, { ok: false });
  const { showToast } = useToast();

  useEffect(() => {
    if (!state.message) return;
    showToast({
      title: state.ok ? "Venda cancelada" : "Venda nao cancelada",
      message: state.message,
      tone: state.ok ? "success" : "danger",
    });
  }, [showToast, state.message, state.ok]);

  return (
    <form action={action} className="flex gap-2">
      <input type="hidden" name="sale_id" value={saleId} />
      <Input name="reason" placeholder="Motivo" minLength={3} required />
      <Button type="submit" variant="danger" disabled={pending}>
        {pending ? "Cancelando..." : "Cancelar"}
      </Button>
    </form>
  );
}
