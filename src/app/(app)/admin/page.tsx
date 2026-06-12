import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, Panel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { requireAdmin } from "@/lib/auth";
import {
  cashFlowSummary,
  cashRegisterDifference,
  movementsByType,
  salesByPayment,
  sumMoney,
} from "@/lib/cash";
import { monthRange, todayRange } from "@/lib/dates";
import { dateTime, money, paymentLabel, quantity } from "@/lib/format";
import { defaultTrackStockForCategory, productTracksStock } from "@/lib/product-stock";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/supabase/pagination";
import {
  ArrowRight,
  Banknote,
  BarChart2,
  CheckCircle,
  Package,
  ReceiptText,
  TrendingUp,
  Users,
} from "lucide-react";
import { ResetHistoryForm } from "./reset-history-form";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

type SaleRow = {
  id: string;
  total_amount: number;
  gross_profit: number;
  payment_method: string;
  user_id: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  users?: { name: string | null; email: string | null } | null;
};

type ProductRow = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  min_stock: number;
  track_stock?: boolean | null;
};

type CashRegisterRow = {
  id: string;
  opening_amount: number;
  expected_amount: number;
  closing_amount: number | null;
  cash_difference: number | null;
  status: string;
};

type CashMovementRow = {
  movement_type: "entrada" | "saida";
  amount: number;
};

type CashMovementAuditRow = {
  metadata: {
    movement_type?: string;
    amount?: number | string;
  } | null;
};

type SaleItemRow = {
  quantity: number;
  total_price: number;
  product_name_snapshot: string;
};

function personName(row: { users?: { name: string | null; email: string | null } | null }) {
  return row.users?.name || row.users?.email || "Sem nome";
}

function total(rows: SaleRow[], key: "total_amount" | "gross_profit") {
  return sumMoney(rows.map((row) => row[key]));
}

function isMissingTrackStockColumn(error: { message?: string; code?: string } | null) {
  return Boolean(
    error
      && (error.message?.toLowerCase().includes("track_stock")
        || error.code === "PGRST204"),
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

export default async function AdminDashboardPage() {
  await requireAdmin();
  const supabase = await createClient();
  const today = todayRange();
  const month = monthRange();
  const { data: resetLog } = await supabase
    .from("audit_logs")
    .select("created_at")
    .eq("action", "operational_history.reset")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ created_at: string }>();
  const resetAt = resetLog?.created_at;
  const todayStart = resetAt && resetAt > today.start ? resetAt : today.start;
  const monthStart = resetAt && resetAt > month.start ? resetAt : month.start;
  const resetAffectsToday = Boolean(resetAt && resetAt > today.start);
  const resetAffectsMonth = Boolean(resetAt && resetAt > month.start);

  const [
    todaySalesResult,
    monthSalesResult,
    productStockResult,
    cancellationsResult,
    registersResult,
    movementsResult,
    activeRegistersResult,
  ] = await Promise.all([
    fetchAllPages<SaleRow>((from, to) =>
      supabase
        .from("sales")
        .select("id,total_amount,gross_profit,payment_method,user_id,cancelled_at,cancellation_reason,users(name,email)")
        .eq("status", "completed")
        .gte("created_at", todayStart)
        .lte("created_at", today.end)
        .order("created_at", { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: SaleRow[] | null; error: { message: string; code?: string } | null }>,
    ),
    fetchAllPages<SaleRow>((from, to) =>
      supabase
        .from("sales")
        .select("id,total_amount,gross_profit,payment_method,user_id,cancelled_at,cancellation_reason,users(name,email)")
        .eq("status", "completed")
        .gte("created_at", monthStart)
        .lt("created_at", month.end)
        .order("created_at", { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: SaleRow[] | null; error: { message: string; code?: string } | null }>,
    ),
    supabase
      .from("products")
      .select("id,name,category,quantity,min_stock,track_stock")
      .eq("active", true)
      .order("quantity", { ascending: true })
      .limit(120),
    fetchAllPages<SaleRow>((from, to) =>
      supabase
        .from("sales")
        .select("id,total_amount,gross_profit,payment_method,user_id,cancelled_at,cancellation_reason,users(name,email)")
        .eq("status", "cancelled")
        .gte("cancelled_at", todayStart)
        .lte("cancelled_at", today.end)
        .order("cancelled_at", { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: SaleRow[] | null; error: { message: string; code?: string } | null }>,
    ),
    supabase
      .from("cash_registers")
      .select("id,opening_amount,expected_amount,closing_amount,cash_difference,status")
      .gte("opened_at", todayStart)
      .lte("opened_at", today.end)
      .limit(80),
    supabase
      .from("cash_movements")
      .select("movement_type,amount")
      .gte("created_at", todayStart)
      .lte("created_at", today.end)
      .limit(400),
    supabase
      .from("cash_registers")
      .select("id,expected_amount")
      .eq("status", "open")
      .limit(80),
  ]);

  if (todaySalesResult.error) throw todaySalesResult.error;
  if (monthSalesResult.error) throw monthSalesResult.error;

  const todaySales = todaySalesResult.data;
  const monthSales = monthSalesResult.data;
  let productStockRows = (productStockResult.data ?? []) as unknown as ProductRow[];

  if (isMissingTrackStockColumn(productStockResult.error)) {
    const fallback = await supabase
      .from("products")
      .select("id,name,category,quantity,min_stock")
      .eq("active", true)
      .order("quantity", { ascending: true });

    productStockRows = ((fallback.data ?? []) as unknown as ProductRow[]).map((product) => ({
      ...product,
      track_stock: defaultTrackStockForCategory(product.category),
    }));
    if (fallback.error) throw fallback.error;
  } else if (productStockResult.error) {
    throw productStockResult.error;
  }

  const lowStock = productStockRows
    .filter(productTracksStock)
    .filter((product) => Number(product.quantity) <= Number(product.min_stock))
    .slice(0, 8);
  const cancellations = cancellationsResult.error
    ? []
    : (cancellationsResult.data ?? []) as unknown as SaleRow[];
  let registers = (registersResult.data ?? []) as unknown as CashRegisterRow[];

  if (registersResult.error) {
    const fallback = await supabase
        .from("cash_registers")
        .select("id,opening_amount,expected_amount,closing_amount,status")
        .gte("opened_at", todayStart)
        .lte("opened_at", today.end)
        .limit(80);

    registers = ((fallback.data ?? []) as unknown as Omit<CashRegisterRow, "cash_difference">[])
      .map((register) => ({ ...register, cash_difference: null }));
    if (fallback.error) throw fallback.error;
  }

  let movements = (movementsResult.data ?? []) as unknown as CashMovementRow[];

  if (movementsResult.error) {
    const fallback = await supabase
      .from("audit_logs")
      .select("metadata")
      .like("action", "cash_movement.%")
      .gte("created_at", todayStart)
      .lte("created_at", today.end)
      .limit(400);

    movements = ((fallback.data ?? []) as unknown as CashMovementAuditRow[])
      .map((row) => ({
        movement_type: row.metadata?.movement_type === "saida" ? "saida" : "entrada",
        amount: Number(row.metadata?.amount ?? 0),
      }));

    if (fallback.error) throw fallback.error;
  }
  const todayRevenue = total(todaySales, "total_amount");
  const todayProfit = total(todaySales, "gross_profit");
  const monthRevenue = total(monthSales, "total_amount");
  const averageTicket = todaySales.length ? todayRevenue / todaySales.length : 0;
  const savedExpectedCash = sumMoney(registers.map((register) => register.expected_amount));
  const activeRegisters = activeRegistersResult.error
    ? registers.filter((register) => register.status === "open")
    : activeRegistersResult.data ?? [];
  const openCashNow = sumMoney(activeRegisters.map((register) => register.expected_amount));
  const closedDifference = sumMoney(
    registers
      .filter((register) => register.status === "closed")
      .map((register) => cashRegisterDifference(register)),
  );
  const cashSales = salesByPayment(todaySales, "dinheiro");
  const pixSales = salesByPayment(todaySales, "pix");
  const cardSales = salesByPayment(todaySales, "cartao");
  const cashIn = movementsByType(movements, "entrada");
  const cashOut = movementsByType(movements, "saida");
  const cashFlow = cashFlowSummary({
    opening: sumMoney(registers.map((register) => register.opening_amount)),
    cashSales,
    cashIn,
    cashOut,
  });
  const openRegisters = activeRegisters.length;
  const closedRegisters = registers.filter((register) => register.status === "closed").length;
  const formulaDifference = savedExpectedCash - cashFlow.expectedCash;
  const saleIds = todaySales.map((sale) => sale.id);
  const itemsResult = saleIds.length
    ? await fetchAllPages<SaleItemRow>((from, to) =>
        supabase
          .from("sale_items")
          .select("quantity,total_price,product_name_snapshot")
          .in("sale_id", saleIds)
          .range(from, to) as unknown as PromiseLike<{ data: SaleItemRow[] | null; error: { message: string; code?: string } | null }>,
      )
    : { data: [] };
  if ("error" in itemsResult && itemsResult.error) throw itemsResult.error;
  const items = (itemsResult.data ?? []) as unknown as SaleItemRow[];

  const employees = Object.values(
    todaySales.reduce<Record<string, { name: string; total: number; count: number }>>(
      (acc, sale) => {
        const name = personName(sale);
        acc[name] ??= { name, total: 0, count: 0 };
        acc[name].total += Number(sale.total_amount ?? 0);
        acc[name].count += 1;
        return acc;
      },
      {},
    ),
  ).sort((a, b) => b.total - a.total);

  const topProducts = Object.values(
    items.reduce<Record<string, { name: string; total: number; quantity: number }>>(
      (acc, item) => {
        const name = item.product_name_snapshot || "Produto sem nome";
        acc[name] ??= { name, total: 0, quantity: 0 };
        acc[name].total += Number(item.total_price ?? 0);
        acc[name].quantity += Number(item.quantity ?? 0);
        return acc;
      },
      {},
    ),
  )
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
  const topProductTotal = topProducts[0]?.total || 1;

  return (
    <Panel>
      <SectionHeader
        eyebrow="Hoje"
        title="Resumo de hoje"
        description={
          resetAffectsToday && resetAt
            ? `Nova simulacao contabilizada desde ${dateTime(resetAt)}.`
            : "O que vendeu, o que entrou, o que saiu e quanto deve ter na gaveta."
        }
        action={
          <div className="flex gap-2">
            <LinkButton href="/caixa" variant="secondary">Caixa do dia</LinkButton>
            <LinkButton href="/relatorios" variant="secondary">
              Historico <ArrowRight className="h-4 w-4" />
            </LinkButton>
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Faturamento hoje"
          value={money(todayRevenue)}
          note={`${todaySales.length} venda(s) em ${today.label}`}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          title="Vendas hoje"
          value={quantity(todaySales.length)}
          note={`Ticket medio ${money(averageTicket)}`}
          icon={<ReceiptText className="h-5 w-5" />}
          tone="success"
        />
        <StatCard
          title="Lucro estimado"
          value={money(todayProfit)}
          note={
            resetAffectsMonth
              ? `Desde o reinicio: ${money(monthRevenue)}`
              : `Mes ${month.label}: ${money(monthRevenue)}`
          }
          icon={<Banknote className="h-5 w-5" />}
          tone="success"
        />
        <StatCard
          title="Estoque baixo"
          value={quantity(lowStock.length)}
          note={`${openRegisters} aberto(s), ${closedRegisters} fechado(s)`}
          icon={<Package className="h-5 w-5" />}
          tone={lowStock.length ? "warning" : "default"}
        />
      </div>

      <Card className="mt-4 border-accent/20">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-black">Dinheiro de hoje</h2>
            <p className="text-sm text-muted">
              Movimento acumulado dos caixas iniciados nesta operacao.
            </p>
          </div>
          <Badge variant={openRegisters ? "info" : "neutral"}>
            Gavetas abertas agora {money(openCashNow)}
          </Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border border-line bg-panel-strong p-3">
            <p className="text-sm text-muted">Saldo inicial</p>
            <p className="font-bold">{money(cashFlow.opening)}</p>
            <p className="mt-1 text-xs text-muted">Ja estava nos caixas</p>
          </div>
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
            <p className="text-sm text-muted">Vendas em dinheiro</p>
            <p className="font-bold text-green-300">{money(cashFlow.cashSales)}</p>
            <p className="mt-1 text-xs text-muted">Entrou pelas vendas</p>
          </div>
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
            <p className="text-sm text-muted">Outras entradas</p>
            <p className="font-bold text-green-300">{money(cashFlow.otherCashIn)}</p>
            <p className="mt-1 text-xs text-muted">Reforcos e recebimentos</p>
          </div>
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
            <p className="text-sm text-muted">Pagamentos e saidas</p>
            <p className="font-bold text-rose-300">{money(cashFlow.cashOut)}</p>
            <p className="mt-1 text-xs text-muted">Motoboy, compras e retiradas</p>
          </div>
          <div className="rounded-lg border border-accent/20 bg-accent/5 p-3">
            <p className="text-sm text-muted">Esperado nos caixas do dia</p>
            <p className="font-bold text-white">{money(cashFlow.expectedCash)}</p>
            <p className="mt-1 text-xs text-muted">Abertos e ja fechados</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 rounded-lg border border-line bg-background/40 p-3 text-sm">
          <span>{money(cashFlow.opening)} inicial</span>
          <span className="text-green-300">+ {money(cashFlow.cashSales)} vendas</span>
          <span className="text-green-300">+ {money(cashFlow.otherCashIn)} outras entradas</span>
          <span className="text-rose-200">- {money(cashFlow.cashOut)} pagamentos/saidas</span>
          <strong>= {money(cashFlow.expectedCash)} esperado</strong>
        </div>
        <p className="mt-3 text-sm text-muted">
          PIX {money(pixSales)} e cartao {money(cardSales)} fazem parte das vendas, mas nao da
          gaveta. Diferenca nos caixas fechados: {money(closedDifference)}.
        </p>
        {Math.abs(formulaDifference) > 0.009 ? (
          <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-100">
            Atencao: o saldo salvo nos caixas difere da formula em {money(formulaDifference)}.
          </p>
        ) : null}
      </Card>

      <ResetHistoryForm />

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-black">Vendas por funcionario</h2>
            <Badge>Hoje</Badge>
          </div>
          {employees.length ? (
            <div className="space-y-2">
              {employees.map((employee) => (
                <div key={employee.name} className="flex items-center gap-3 rounded-lg border border-line bg-panel-strong p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent ring-1 ring-accent/20">
                    {getInitials(employee.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{employee.name}</p>
                    <p className="text-sm text-muted">{employee.count} venda(s)</p>
                  </div>
                  <strong className="shrink-0">{money(employee.total)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Users className="h-5 w-5" />} title="Sem vendas hoje" description="Nenhuma venda registrada ainda." />
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-black">Estoque baixo</h2>
            <Badge variant={lowStock.length ? "warning" : "success"}>{lowStock.length}</Badge>
          </div>
          {lowStock.length ? (
            <div className="space-y-2">
              {lowStock.map((product) => {
                const qty = Number(product.quantity);
                const min = Number(product.min_stock);
                const pct = min > 0 ? Math.min(100, Math.round((qty / min) * 100)) : null;
                return (
                  <div key={product.id} className="rounded-lg border border-line bg-panel-strong p-3">
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{product.name}</p>
                        <p className="text-sm text-muted">{product.category}</p>
                      </div>
                      <span className="shrink-0 text-warning">{quantity(qty)}</span>
                    </div>
                    {pct !== null ? (
                      <div className="mt-2 h-1.5 rounded-full bg-panel">
                        <div
                          className="h-full rounded-full bg-warning/70"
                          style={{ width: `${Math.max(4, pct)}%` }}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={<CheckCircle className="h-5 w-5" />} title="Estoque ok" description="Nada para repor agora." />
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-black">Produtos mais vendidos</h2>
            <Badge>{topProducts.length}</Badge>
          </div>
          {topProducts.length ? (
            <div className="space-y-3">
              {topProducts.map((product) => (
                <div key={product.name}>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="truncate font-semibold">{product.name}</span>
                    <strong className="shrink-0">{money(product.total)}</strong>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-panel-strong">
                    <div
                      className="h-full rounded-full bg-accent-2"
                      style={{ width: `${Math.max(10, (product.total / topProductTotal) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted">{quantity(product.quantity)} vendido(s)</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<BarChart2 className="h-5 w-5" />} title="Sem vendas" description="Nenhum produto vendido hoje." />
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-black">Cancelamentos</h2>
          <Badge variant={cancellations.length ? "danger" : "success"}>{cancellations.length}</Badge>
        </div>
        {cancellations.length ? (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {cancellations.map((sale) => (
              <div key={sale.id} className="rounded-lg border border-red-500/15 bg-red-500/5 p-3">
                <div className="flex justify-between gap-3">
                  <strong>{money(sale.total_amount)}</strong>
                  <span>{paymentLabel(sale.payment_method)}</span>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {personName(sale)} - {dateTime(sale.cancelled_at)}
                </p>
                {sale.cancellation_reason ? (
                  <p className="mt-1 text-sm">{sale.cancellation_reason}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<CheckCircle className="h-5 w-5" />} title="Nenhum cancelamento" description="Todas as vendas estao ok." />
        )}
      </Card>
    </Panel>
  );
}
