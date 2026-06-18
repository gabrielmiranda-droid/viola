"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, CardType, OrderType, PaymentMethod, PreparationStatus, TerminalClosing } from "@/lib/types";

const paymentMethods = ["pix", "dinheiro", "cartao", "cartao_alimentacao", "cartao_refeicao"] as const;

const saleSchema = z.object({
  cashRegisterId: z.string().uuid(),
  paymentMethod: z.enum(paymentMethods),
  cardType: z.enum(["credito", "debito"]).nullable().optional(),
  cardMachine: z.string().trim().max(80).nullable().optional(),
  orderType: z.enum(["retirada", "local", "entrega"]).default("retirada"),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(40).optional(),
  deliveryAddress: z.string().trim().max(220).optional(),
  deliveryNeighborhood: z.string().trim().max(120).optional(),
  deliveryReference: z.string().trim().max(160).optional(),
  deliveryFee: z.number().min(0).default(0),
  deliveryDriver: z.string().trim().max(120).optional(),
  orderNotes: z.string().trim().max(600).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().positive(),
        modifiers: z.array(z.string().trim().max(80)).default([]),
        notes: z.string().trim().max(240).nullable().optional(),
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

  if (data.orderType === "entrega" && !data.deliveryDriver?.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["deliveryDriver"],
      message: "Informe o motoboy da entrega.",
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

function paymentLabel(paymentMethod: PaymentMethod, cardType?: CardType | null) {
  const labels: Record<PaymentMethod, string> = {
    pix: "PIX",
    dinheiro: "Dinheiro",
    cartao: cardType === "debito" ? "Cartao debito" : "Cartao credito",
    cartao_alimentacao: "Cartao alimentacao",
    cartao_refeicao: "Cartao refeicao",
  };

  return labels[paymentMethod];
}

async function createSalePrintJob(
  supabase: Awaited<ReturnType<typeof createClient>>,
  saleId: string,
  createdBy: string,
) {
  const saleResult = await supabase
    .from("sales")
    .select([
      "id",
      "total_amount",
      "payment_method",
      "card_type",
      "card_machine",
      "customer_name",
      "customer_phone",
      "delivery_address",
      "delivery_neighborhood",
      "delivery_reference",
      "order_notes",
      "order_type",
      "delivery_fee",
      "delivery_driver",
      "created_at",
    ].join(","))
    .eq("id", saleId)
    .single<{
      id: string;
      total_amount: number;
      payment_method: PaymentMethod;
      card_type: CardType | null;
      card_machine: string | null;
      customer_name: string | null;
      customer_phone: string | null;
      delivery_address: string | null;
      delivery_neighborhood: string | null;
      delivery_reference: string | null;
      order_notes: string | null;
      order_type: OrderType | null;
      delivery_fee: number | null;
      delivery_driver: string | null;
      created_at: string;
    }>();

  if (saleResult.error || !saleResult.data) {
    return saleResult.error?.message ?? "Venda nao encontrada para impressao.";
  }

  const itemsResult = await supabase
    .from("sale_items")
    .select("product_name_snapshot,quantity,modifiers,item_notes,total_price")
    .eq("sale_id", saleId)
    .order("created_at")
    .returns<Array<{
      product_name_snapshot: string;
      quantity: number;
      modifiers: string[] | null;
      item_notes: string | null;
      total_price: number;
    }>>();

  if (itemsResult.error) {
    return itemsResult.error.message;
  }

  const sale = saleResult.data;
  const shortId = saleId.slice(0, 8).toUpperCase();
  const orderNumber = shortId;

  const { error } = await supabase.from("print_jobs").insert({
    order_number: orderNumber,
    created_by: createdBy,
    order_payload: {
      number: orderNumber,
      sale_id: saleId,
      created_at: sale.created_at,
      customer_name: sale.customer_name ?? "",
      customer_phone: sale.customer_phone ?? "",
      delivery_address: sale.delivery_address ?? "",
      delivery_neighborhood: sale.delivery_neighborhood ?? "",
      delivery_reference: sale.delivery_reference ?? "",
      order_type: sale.order_type ?? "retirada",
      delivery_fee: Number(sale.delivery_fee ?? 0),
      delivery_driver: sale.delivery_driver ?? "",
      observation: sale.order_notes ?? "",
      payment_method: paymentLabel(sale.payment_method, sale.card_type),
      card_machine: sale.card_machine ?? "",
      total: Number(sale.total_amount ?? 0),
      items: (itemsResult.data ?? []).map((item) => ({
        name: item.product_name_snapshot,
        quantity: Number(item.quantity),
        modifiers: Array.isArray(item.modifiers) ? item.modifiers : [],
        observation: item.item_notes ?? "",
        total: Number(item.total_price ?? 0),
      })),
    },
    status: "pending",
    logs: ["Pedido criado ao finalizar venda."],
  });

  return error?.message ?? null;
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

async function reconcileRegisterExpectedAmount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cashRegisterId: string,
) {
  const [registerResult, salesResult, movementsResult] = await Promise.all([
    supabase
      .from("cash_registers")
      .select("id,opening_amount,expected_amount,status")
      .eq("id", cashRegisterId)
      .single<{
        id: string;
        opening_amount: number;
        expected_amount: number;
        status: string;
      }>(),
    supabase
      .from("sales")
      .select("total_amount")
      .eq("cash_register_id", cashRegisterId)
      .eq("status", "completed")
      .eq("payment_method", "dinheiro"),
    supabase
      .from("cash_movements")
      .select("movement_type,amount")
      .eq("cash_register_id", cashRegisterId),
  ]);

  if (registerResult.error || !registerResult.data || salesResult.error || movementsResult.error) {
    return;
  }

  const cashSales = (salesResult.data ?? []).reduce(
    (total, sale) => total + Number(sale.total_amount ?? 0),
    0,
  );
  const movements = movementsResult.data ?? [];
  const cashIn = movements
    .filter((movement) => movement.movement_type === "entrada")
    .reduce((total, movement) => total + Number(movement.amount ?? 0), 0);
  const cashOut = movements
    .filter((movement) => movement.movement_type === "saida")
    .reduce((total, movement) => total + Number(movement.amount ?? 0), 0);
  const expected = Math.round(
    (Number(registerResult.data.opening_amount) + cashSales + cashIn - cashOut) * 100,
  ) / 100;

  if (
    registerResult.data.status === "open"
    && Math.abs(Number(registerResult.data.expected_amount) - expected) > 0.009
  ) {
    await supabase
      .from("cash_registers")
      .update({ expected_amount: expected })
      .eq("id", cashRegisterId)
      .eq("status", "open");
  }
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

  await reconcileRegisterExpectedAmount(supabase, parsed.data.cashRegisterId);
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
    if (isMissingRpc(detailedResult.error, "close_cash_register_detailed")) {
      const legacyNotes = [
        parsed.data.notes,
        `Conferencia: dinheiro ${parsed.data.cashAmount.toFixed(2)}; credito ${parsed.data.creditAmount.toFixed(2)}; debito ${parsed.data.debitAmount.toFixed(2)}; PIX ${parsed.data.pixAmount.toFixed(2)}.`,
        terminalRows.length
          ? `Maquininhas: ${terminalRows.map((row) =>
              `${row.terminal_name} (credito ${row.credit_amount.toFixed(2)}, debito ${row.debit_amount.toFixed(2)}, PIX ${row.pix_amount.toFixed(2)})`
            ).join("; ")}.`
          : "",
      ].filter(Boolean).join("\n");
      const legacyResult = await supabase.rpc("close_cash_register", {
        p_cash_register_id: parsed.data.cashRegisterId,
        p_closing_amount: parsed.data.cashAmount,
        p_notes: legacyNotes || null,
      });

      if (!legacyResult.error) {
        revalidatePath("/caixa");
        revalidatePath("/admin");
        revalidatePath("/relatorios");
        return {
          ok: true,
          message: "Caixa fechado. A conferencia detalhada foi salva nas observacoes.",
        };
      }

      return { ok: false, message: legacyResult.error.message };
    }

    return {
      ok: false,
      message: detailedResult.error.message,
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
  const profile = await requireRole(["admin", "caixa"]);
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
  await reconcileRegisterExpectedAmount(supabase, parsed.data.cashRegisterId);
  const movementLabel = parsed.data.movementType === "entrada" ? "Entrada" : "Saida";
  const { error } = await supabase.rpc("register_cash_movement", {
    p_cash_register_id: parsed.data.cashRegisterId,
    p_movement_type: parsed.data.movementType,
    p_amount: parsed.data.amount,
    p_reason: parsed.data.reason,
  });

  if (error) {
    if (isMissingRpc(error, "register_cash_movement")) {
      const { data: register, error: registerError } = await supabase
        .from("cash_registers")
        .select("id,user_id,status,expected_amount")
        .eq("id", parsed.data.cashRegisterId)
        .single<{
          id: string;
          user_id: string;
          status: string;
          expected_amount: number;
        }>();

      if (registerError || !register) {
        return { ok: false, message: registerError?.message ?? "Caixa nao encontrado." };
      }

      if (register.status !== "open") {
        return { ok: false, message: "Caixa fechado." };
      }

      if (register.user_id !== profile.id && profile.role !== "admin") {
        return { ok: false, message: "Sem permissao para movimentar este caixa." };
      }

      const before = Number(register.expected_amount);
      const delta = parsed.data.movementType === "entrada"
        ? parsed.data.amount
        : -parsed.data.amount;
      const after = Math.round((before + delta) * 100) / 100;

      if (after < 0) {
        return { ok: false, message: "Saida maior que o dinheiro esperado no caixa." };
      }

      const { data: updated, error: updateError } = await supabase
        .from("cash_registers")
        .update({ expected_amount: after })
        .eq("id", register.id)
        .eq("status", "open")
        .eq("expected_amount", before)
        .select("id")
        .maybeSingle<{ id: string }>();

      if (updateError || !updated) {
        return {
          ok: false,
          message: updateError?.message ?? "O caixa mudou durante a operacao. Tente novamente.",
        };
      }

      const { error: auditError } = await supabase.from("audit_logs").insert({
        user_id: profile.id,
        action: `cash_movement.${parsed.data.movementType}`,
        entity: "cash_registers",
        entity_id: register.id,
        metadata: {
          cash_register_id: register.id,
          movement_type: parsed.data.movementType,
          amount: parsed.data.amount,
          delta,
          reason: parsed.data.reason,
          expected_before: before,
          expected_after: after,
          legacy: true,
        },
      });

      if (auditError) {
        await supabase
          .from("cash_registers")
          .update({ expected_amount: before })
          .eq("id", register.id)
          .eq("expected_amount", after);

        return { ok: false, message: auditError.message };
      }

      revalidatePath("/caixa");
      revalidatePath("/admin");
      revalidatePath("/relatorios");

      return {
        ok: true,
        message: `${movementLabel} de dinheiro registrada.`,
      };
    }

    return {
      ok: false,
      message: error.message,
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
  orderType?: OrderType;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryNeighborhood?: string;
  deliveryReference?: string;
  deliveryFee?: number;
  deliveryDriver?: string;
  orderNotes?: string;
  items: Array<{
    productId: string;
    quantity: number;
    modifiers?: string[];
    notes?: string | null;
  }>;
}): Promise<ActionResult<{ saleId: string }>> {
  const profile = await requireRole(["admin", "caixa"]);
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
    p_customer_name: parsed.data.customerName?.trim() || null,
    p_customer_phone: parsed.data.customerPhone?.trim() || null,
    p_delivery_address: parsed.data.deliveryAddress?.trim() || null,
    p_delivery_neighborhood: parsed.data.deliveryNeighborhood?.trim() || null,
    p_delivery_reference: parsed.data.deliveryReference?.trim() || null,
    p_order_notes: parsed.data.orderNotes?.trim() || null,
    p_order_type: parsed.data.orderType,
    p_delivery_fee: parsed.data.orderType === "entrega" ? parsed.data.deliveryFee : 0,
    p_delivery_driver: parsed.data.orderType === "entrega"
      ? parsed.data.deliveryDriver?.trim() || null
      : null,
    p_items: parsed.data.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
      modifiers: item.modifiers ?? [],
      item_notes: item.notes?.trim() || null,
    })),
  });

  if (result.error) {
    if (isMissingSaleDetailSupport(result.error)) {
      const legacyResult = await supabase.rpc("finalize_sale", {
        p_cash_register_id: parsed.data.cashRegisterId,
        p_payment_method: parsed.data.paymentMethod,
        p_items: parsed.data.items.map((item) => ({
          product_id: item.productId,
          quantity: item.quantity,
        })),
      });

      if (!legacyResult.error) {
        const saleId = String(legacyResult.data);

        if (parsed.data.paymentMethod === "cartao") {
          await supabase.from("audit_logs").insert({
            user_id: profile.id,
            action: "sale.payment_details",
            entity: "sales",
            entity_id: saleId,
            metadata: {
              card_type: parsed.data.cardType ?? null,
              card_machine: parsed.data.cardMachine?.trim() || "Principal",
              legacy: true,
            },
          });
        }

        await reconcileRegisterExpectedAmount(supabase, parsed.data.cashRegisterId);

        const printError = await createSalePrintJob(supabase, saleId, profile.id);

        revalidatePath("/caixa");
        revalidatePath("/admin");
        revalidatePath("/estoque");
        revalidatePath("/relatorios");

        return {
          ok: true,
          message: printError
            ? `Venda finalizada, mas a impressao nao foi enviada: ${printError}`
            : parsed.data.paymentMethod === "cartao"
            ? "Venda finalizada. Os detalhes do cartao foram salvos no historico."
            : "Venda finalizada.",
          data: { saleId },
        };
      }

      return {
        ok: false,
        message: legacyResult.error.message,
      };
    }

    return {
      ok: false,
      message: result.error.message,
    };
  }

  await reconcileRegisterExpectedAmount(supabase, parsed.data.cashRegisterId);
  const saleId = String(result.data);
  const printError = await createSalePrintJob(supabase, saleId, profile.id);

  revalidatePath("/caixa");
  revalidatePath("/admin");
  revalidatePath("/estoque");
  revalidatePath("/relatorios");

  return {
    ok: true,
    message: printError
      ? `Venda finalizada, mas a impressao nao foi enviada: ${printError}`
      : "Venda finalizada e enviada para impressao.",
    data: { saleId },
  };
}

export async function updatePreparationStatusAction(input: {
  saleId: string;
  status: PreparationStatus;
}): Promise<ActionResult> {
  const profile = await requireRole(["admin", "caixa"]);
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
    if (isMissingRpc(error, "update_sale_preparation_status")) {
      const { error: auditError } = await supabase.from("audit_logs").insert({
        user_id: profile.id,
        action: "sale.preparation_status",
        entity: "sales",
        entity_id: parsed.data.saleId,
        metadata: {
          to: parsed.data.status,
          legacy: true,
        },
      });

      return auditError
        ? { ok: false, message: auditError.message }
        : { ok: true, message: "Status salvo no historico." };
    }

    return {
      ok: false,
      message: error.message,
    };
  }

  revalidatePath("/caixa");
  revalidatePath("/relatorios");

  return { ok: true, message: "Status atualizado." };
}
