"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

export async function resetOperationalHistoryAction(
  _state: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const profile = await requireAdmin();
  const confirmation = String(formData.get("confirmation") ?? "").trim().toUpperCase();

  if (confirmation !== "LIMPAR HISTORICO") {
    return { ok: false, message: 'Digite "LIMPAR HISTORICO" para confirmar.' };
  }

  const supabase = await createClient();
  const { data: openRegisters, error: registersError } = await supabase
    .from("cash_registers")
    .select("id,expected_amount")
    .eq("status", "open");

  if (registersError) {
    return { ok: false, message: registersError.message };
  }

  for (const register of openRegisters ?? []) {
    const { error } = await supabase.rpc("close_cash_register", {
      p_cash_register_id: register.id,
      p_closing_amount: Number(register.expected_amount),
      p_notes: "Caixa arquivado ao iniciar uma nova simulacao.",
    });

    if (error) {
      return { ok: false, message: `Nao foi possivel arquivar o caixa aberto: ${error.message}` };
    }
  }

  const { error } = await supabase.from("audit_logs").insert({
    user_id: profile.id,
    action: "operational_history.reset",
    entity: "system",
    metadata: {
      archived_registers: openRegisters?.length ?? 0,
      reset_at: new Date().toISOString(),
    },
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin");
  revalidatePath("/caixa");
  revalidatePath("/relatorios");
  revalidatePath("/estoque");

  return {
    ok: true,
    message: "Nova simulacao iniciada. O historico anterior foi arquivado.",
  };
}
