"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

export async function cancelSaleAction(
  _state: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const saleId = String(formData.get("sale_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!saleId || reason.length < 3) {
    return { ok: false, message: "Informe um motivo com pelo menos 3 caracteres." };
  }

  const supabase = await createClient();
  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .select("id,cash_registers(status)")
    .eq("id", saleId)
    .single<{
      id: string;
      cash_registers?: { status: string } | null;
    }>();

  if (saleError || !sale) {
    return { ok: false, message: saleError?.message ?? "Venda nao encontrada." };
  }

  if (sale.cash_registers?.status === "closed") {
    return {
      ok: false,
      message: "Nao e permitido cancelar uma venda depois que o caixa foi fechado.",
    };
  }

  const { error } = await supabase.rpc("cancel_sale", {
    p_sale_id: saleId,
    p_reason: reason,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/relatorios");
  revalidatePath("/admin");
  revalidatePath("/estoque");
  revalidatePath("/caixa");
  return { ok: true, message: "Venda cancelada." };
}
