"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, CardType, PaymentMethod, PreparationStatus, TerminalClosing } from "@/lib/types";

const paymentMethods = ["pix", "dinheiro", "cartao"] as const;

const saleSchema = z.object({
  cashRegisterId: z.string().uuid(),
  paymentMethod: z.enum(paymentMethods),
  cardType: z.enum(["credito", "debito"]).nullable().optional(),
  cardMachine: z.string().trim().max(80).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().positive(),
      }),
    )
    .min(1),
}).superRefine((data, ctx) => {
  if (data.paymentMethod === "cartao" && !data.cardType) {
    ctx.addIssue({
      code: "custom",
      path: ["cardType"],
      message: "Informe credito ou debito para venda no cartao.",
    });
  }
});

const closeRegisterSchema = z.object({
  cashRegisterId: z.string().uuid(),
  cashAmount: z.coerce.number().min(0, "Dinheiro fisico invalido."),
  creditAmount: z.coerce.number().min(0, "Valor de credito invalido."),
  debitAmount: z.coerce.number().min(0, "Valor de debito invalido."),
  pixAmount: z.coerce.number().min(0, "Valor de PIX invalido."),
  notes: z.string().trim().max(600).optional(),
});

const preparationStatusSchema = z.object({
  saleId: z.string().uuid(),
  status: z.enum(["aguardando", "preparando", "pronto", "entregue"]),
});

const cashMovementSchema = z.object({
  cashRegisterId: z.string().uuid(),
  movementType: z.enum(["entrada", "saida"]),
  amount: z.coerce.number().positive("Valor deve ser maior que zero."),
  reason: z.string().min(3, "Informe o motivo da movimentacao."),
});

function isMissingRpc(
  error: { message?: string; code?: string } | null,
  rpcName: string,
) {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();

  return (
    error.code === "PGRST202"
    || message.includes("could not find the function")
    || message.includes(`public.${rpcName}`)
    || message.includes(rpcName)
  );
}

function isMissingSaleDetailSupport(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();

  return (
    isMissingRpc(error, "finalize_sale")
    || message.includes("card_type")
    || message.includes("card_machine")
    || message.includes("preparation_status")
  );
}

function terminalRowsFromFormData(formData: FormData): TerminalClosing[] {
  const names = formData.getAll("terminal_name");
  const credits = formData.getAll("terminal_credit");
  const debits = formData.getAll("terminal_debit");
  const pixes = formData.getAll("terminal_pix");

  return names
    .map((name, index) => ({
      terminal_name: String(name ?? "").trim(),
      credit_amount: Number(credits[index] ?? 0),
      debit_amount: Number(debits[index] ?? 0),
      pix_amount: Number(pixes[index] ?? 0),
    }))
    .filter((row) => {
      const total = row.credit_amount + row.debit_amount + row.pix_amount;
      return row.terminal_name || total > 0;
    })
    .map((row, index) => ({
      terminal_name: row.terminal_name || `Maquininha ${index + 1}`,
      credit_amount: Number.isFinite(row.credit_amount) ? Math.max(0, row.credit_amount) : 0,
      debit_amount: Number.isFinite(row.debit_amount) ? Math.max(0, row.debit_amount) : 0,
      pix_amount: Number.isFinite(row.pix_amount) ? Math.max(0, row.pix_amount) : 0,
    }));
}

export async function openRegisterAction(
  _state: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole(["admin", "caixa"]);
  const supabase = await createClient();
  const openingAmount = Number(formData.get("opening_amount") ?? 0);
  const notes = String(formData.get("notes") ?? "").trim();

  if (!Number.isFinite(openingAmount) || openingAmount < 0) {
    return { ok: false, message: "Valor inicial invalido." };
  }

  const { error } = await supabase.rpc("open_cash_register", {
    p_opening_amount: openingAmount,
    p_notes: notes || null,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/caixa");
  return { ok: true, message: "Caixa aberto." };
}

export async function closeRegisterAction(
  _state: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole(["admin", "caixa"]);
  const supabase = await createClient();
  const parsed = closeRegisterSchema.safeParse({
    cashRegisterId: formData.get("cash_register_id"),
    cashAmount: formData.get("cash_amount") ?? formData.get("closing_amount"),
    creditAmount: formData.get("credit_amount") ?? 0,
    debitAmount: formData.get("debit_amount") ?? 0,
    pixAmount: formData.get("pix_amount") ?? 0,
    notes: String(formData.get("notes") ?? "").trim(),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Fechamento invalido.",
    };
  }

  const terminalRows = terminalRowsFromFormData(formData);
  const detailedResult = await supabase.rpc("close_cash_register_detailed", {
    p_cash_register_id: parsed.data.cashRegisterId,
    p_closing_cash_amount: parsed.data.cashAmount,
    p_closing_credit_amount: parsed.data.creditAmount,
    p_closing_debit_amount: parsed.data.debitAmount,
    p_closing_pix_amount: parsed.data.pixAmount,
    p_terminal_rows: terminalRows,
    p_notes: parsed.data.notes || null,
  });

  if (detailedResult.error) {
    return {
      ok: false,
      message: isMissingRpc(detailedResult.error, "close_cash_register_detailed")
        ? "Atualize o banco com a migration operacional antes de fechar o caixa."
        : detailedResult.error.message,
    };
  }

  revalidatePath("/caixa");
  revalidatePath("/admin");
  revalidatePath("/relatorios");
  return { ok: true, message: "Caixa fechado." };
}

export async function cashMovementAction(
  _state: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole(["admin", "caixa"]);
  const parsed = cashMovementSchema.safeParse({
    cashRegisterId: formData.get("cash_register_id"),
    movementType: formData.get("movement_type"),
    amount: formData.get("amount"),
    reason: String(formData.get("reason") ?? "").trim(),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Movimentacao invalida.",
    };
  }

  const supabase = await createClient();
  const movementLabel = parsed.data.movementType === "entrada" ? "Entrada" : "Saida";
  const { error } = await supabase.rpc("register_cash_movement", {
    p_cash_register_id: parsed.data.cashRegisterId,
    p_movement_type: parsed.data.movementType,
    p_amount: parsed.data.amount,
    p_reason: parsed.data.reason,
  });

  if (error) {
    return {
      ok: false,
      message: isMissingRpc(error, "register_cash_movement")
        ? "Atualize o banco com a migration de caixa antes de movimentar dinheiro."
        : error.message,
    };
  }

  revalidatePath("/caixa");
  revalidatePath("/admin");
  revalidatePath("/relatorios");

  return {
    ok: true,
    message: `${movementLabel} de dinheiro registrada.`,
  };
}

export async function finalizeSaleAction(input: {
  cashRegisterId: string;
  paymentMethod: PaymentMethod;
  cardType?: CardType | null;
  cardMachine?: string | null;
  items: Array<{ productId: string; quantity: number }>;
}): Promise<ActionResult<{ saleId: string }>> {
  await requireRole(["admin", "caixa"]);
  const parsed = saleSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Venda invalida. Confira os itens.",
    };
  }

  const supabase = await createClient();
  const result = await supabase.rpc("finalize_sale", {
    p_cash_register_id: parsed.data.cashRegisterId,
    p_payment_method: parsed.data.paymentMethod,
    p_card_type: parsed.data.cardType ?? null,
    p_card_machine:
      parsed.data.paymentMethod === "cartao"
        ? parsed.data.cardMachine?.trim() || "Principal"
        : parsed.data.cardMachine?.trim() || null,
    p_items: parsed.data.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
    })),
  });

  if (result.error) {
    return {
      ok: false,
      message: isMissingSaleDetailSupport(result.error)
        ? "Atualize o banco com a migration operacional antes de registrar vendas."
        : result.error.message,
    };
  }

  revalidatePath("/caixa");
  revalidatePath("/admin");
  revalidatePath("/estoque");
  revalidatePath("/relatorios");

  return {
    ok: true,
    message: "Venda finalizada.",
    data: { saleId: String(result.data) },
  };
}

export async function updatePreparationStatusAction(input: {
  saleId: string;
  status: PreparationStatus;
}): Promise<ActionResult> {
  await requireRole(["admin", "caixa"]);
  const parsed = preparationStatusSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Status invalido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_sale_preparation_status", {
    p_sale_id: parsed.data.saleId,
    p_status: parsed.data.status,
  });

  if (error) {
    return {
      ok: false,
      message: isMissingRpc(error, "update_sale_preparation_status")
        ? "Aplique a migracao de preparo para alterar status."
        : error.message,
    };
  }

  revalidatePath("/caixa");
  revalidatePath("/relatorios");

  return { ok: true, message: "Status atualizado." };
}
