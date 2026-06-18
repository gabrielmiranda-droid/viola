import { Panel } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { requireRole } from "@/lib/auth";
import {
  cashFlowSummary,
  mergeSalePaymentDetails,
  movementsByType,
  salesByPayment,
  type SalePaymentAudit,
} from "@/lib/cash";
import { todayRange } from "@/lib/dates";
import { defaultTrackStockForCategory, productTracksStock } from "@/lib/product-stock";
import { createClient } from "@/lib/supabase/server";
import type {
  CashMovement,
  CashRegister,
  Product,
  RegisterSale,
  RegisterSaleItem,
} from "@/lib/types";
import { PosTerminal } from "../pos-terminal";

type CashMovementAuditRow = {
  id: string;
  user_id: string | null;
  entity_id: string | null;
  metadata: {
    cash_register_id?: string;
    movement_type?: string;
    amount?: number | string;
    reason?: string;
  } | null;
  created_at: string;
};

function isMissingInventoryColumn(error: { message?: string; code?: string } | null) {
  return Boolean(
    error
      && (error.message?.toLowerCase().includes("max_stock")
        || error.message?.toLowerCase().includes("track_stock")
        || error.code === "PGRST204"),
  );
}

function isMissingOperationalColumn(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();

  return (
    error.code === "PGRST204"
    || message.includes("card_type")
    || message.includes("card_machine")
    || message.includes("preparation_status")
  );
}

function normalizeProduct(product: Product): Product {
  if (!productTracksStock(product)) {
    return {
      ...product,
      quantity: 0,
      min_stock: 0,
      max_stock: 0,
      track_stock: false,
    };
  }

  return product;
}

function normalizeSale(sale: Partial<RegisterSale>): RegisterSale {
  return {
    id: String(sale.id ?? ""),
    total_amount: Number(sale.total_amount ?? 0),
    payment_method: String(sale.payment_method ?? ""),
    status: String(sale.status ?? "completed"),
    created_at: sale.created_at,
    card_type: sale.card_type ?? null,
    card_machine: sale.card_machine ?? null,
    preparation_status: sale.preparation_status ?? "aguardando",
  };
}

async function loadProducts(supabase: Awaited<ReturnType<typeof createClient>>) {
  const result = await supabase
    .from("products")
    .select("id,name,category,quantity,cost_price,sale_price,min_stock,max_stock,track_stock,active,updated_at")
    .eq("active", true)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (!isMissingInventoryColumn(result.error)) {
    return ((result.data ?? []) as unknown as Product[]).map(normalizeProduct);
  }

  const fallback = await supabase
    .from("products")
    .select("id,name,category,quantity,cost_price,sale_price,min_stock,active,updated_at")
    .eq("active", true)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  return ((fallback.data ?? []) as unknown as Product[])
    .map((product) => ({
      ...product,
      max_stock: 0,
      track_stock: defaultTrackStockForCategory(product.category),
    }))
    .map(normalizeProduct);
}

async function loadRegisterSales(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cashRegisterId: string,
) {
  const result = await supabase
    .from("sales")
    .select("id,total_amount,payment_method,status,created_at,card_type,card_machine,preparation_status")
    .eq("cash_register_id", cashRegisterId)
    .order("created_at", { ascending: false });

  let sales: RegisterSale[];

  if (!isMissingOperationalColumn(result.error)) {
    sales = ((result.data ?? []) as unknown as RegisterSale[]).map(normalizeSale);
  } else {
    const fallback = await supabase
      .from("sales")
      .select("id,total_amount,payment_method,status,created_at")
      .eq("cash_register_id", cashRegisterId)
      .order("created_at", { ascending: false });

    sales = ((fallback.data ?? []) as unknown as RegisterSale[]).map(normalizeSale);
  }

  if (!sales.length) return sales;

  const { data: paymentAudits } = await supabase
    .from("audit_logs")
    .select("entity_id,metadata")
    .eq("action", "sale.payment_details")
    .in("entity_id", sales.map((sale) => sale.id));

  return mergeSalePaymentDetails(
    sales,
    (paymentAudits ?? []) as unknown as SalePaymentAudit[],
  );
}

async function loadRegisterSaleItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  saleIds: string[],
) {
  if (!saleIds.length) return [];

  const { data } = await supabase
    .from("sale_items")
    .select("id,sale_id,product_name_snapshot,quantity")
    .in("sale_id", saleIds);

  return (data ?? []) as unknown as RegisterSaleItem[];
}

function cashMovementFromAudit(row: CashMovementAuditRow, cashRegisterId: string): CashMovement {
  return {
    id: row.id,
    cash_register_id: row.metadata?.cash_register_id ?? cashRegisterId,
    user_id: row.user_id ?? "",
    movement_type: row.metadata?.movement_type === "saida" ? "saida" : "entrada",
    amount: Number(row.metadata?.amount ?? 0),
    reason: row.metadata?.reason ?? "Movimentacao de caixa",
    created_at: row.created_at,
  };
}

export default async function CashFechamentoPage() {
  const profile = await requireRole(["admin", "caixa"]);
  const supabase = await createClient();
  const today = todayRange();
  const todayDate = today.start.slice(0, 10);
  const reportHref = `/relatorios?start=${todayDate}&end=${todayDate}`;

  const [products, { data: openRegister }] = await Promise.all([
    loadProducts(supabase),
    supabase
      .from("cash_registers")
      .select("*")
      .eq("user_id", profile.id)
      .eq("status", "open")
      .maybeSingle<CashRegister>(),
  ]);

  const register = (openRegister as unknown as CashRegister | null) ?? null;
  let registerSales: RegisterSale[] = [];
  let registerSaleItems: RegisterSaleItem[] = [];
  let cashMovements: CashMovement[] = [];

  if (register) {
    const [sales, movementsResult] = await Promise.all([
      loadRegisterSales(supabase, register.id),
      supabase
        .from("cash_movements")
        .select("id,cash_register_id,user_id,movement_type,amount,reason,created_at")
        .eq("cash_register_id", register.id)
        .order("created_at", { ascending: false }),
    ]);

    registerSales = sales;
    registerSaleItems = await loadRegisterSaleItems(
      supabase,
      registerSales.map((sale) => sale.id),
    );
    cashMovements = (movementsResult.data ?? []) as unknown as CashMovement[];

    if (movementsResult.error) {
      const fallbackMovementsResult = await supabase
        .from("audit_logs")
        .select("id,user_id,entity_id,metadata,created_at")
        .like("action", "cash_movement.%")
        .eq("metadata->>cash_register_id", register.id)
        .order("created_at", { ascending: false })
        .limit(20);

      cashMovements = ((fallbackMovementsResult.data ?? []) as unknown as CashMovementAuditRow[])
        .map((row) => cashMovementFromAudit(row, register.id));
    }

    const expectedCash = cashFlowSummary({
      opening: Number(register.opening_amount),
      cashSales: salesByPayment(registerSales, "dinheiro"),
      cashIn: movementsByType(cashMovements, "entrada"),
      cashOut: movementsByType(cashMovements, "saida"),
    }).expectedCash;

    if (Math.abs(Number(register.expected_amount) - expectedCash) > 0.009) {
      await supabase
        .from("cash_registers")
        .update({ expected_amount: expectedCash })
        .eq("id", register.id)
        .eq("status", "open");

      register.expected_amount = expectedCash;
    }
  }

  return (
    <Panel>
      <SectionHeader
        eyebrow="Caixa"
        title="Fechar Caixa"
        description="Confira os valores e salve o fechamento do caixa."
      />
      <PosTerminal
        userId={profile.id}
        products={products}
        openRegister={register}
        registerSales={registerSales}
        registerSaleItems={registerSaleItems}
        cashMovements={cashMovements}
        reportHref={reportHref}
        canViewReports={profile.role === "admin"}
        view="cash"
        initialTab="fechamento"
      />
    </Panel>
  );
}
