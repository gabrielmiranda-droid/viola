import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, Panel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/input";
import { SectionHeader } from "@/components/ui/section-header";
import { requireAdmin } from "@/lib/auth";
import {
  cardSalesByType,
  cardSalesWithoutType,
  cashFlowSummary,
  groupSalesByMachine,
  mergeSalePaymentDetails,
  movementsByType,
  salesByPayment,
  sumMoney,
  type SalePaymentAudit,
} from "@/lib/cash";
import { cn } from "@/lib/cn";
import { monthRange, rangeFromSearch, todayRange } from "@/lib/dates";
import { dateTime, money, paymentLabel, quantity } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/supabase/pagination";
import { CancelSaleForm } from "./cancel-sale-form";
import {
  Banknote,
  Calculator,
  CreditCard,
  ReceiptText,
  WalletCards,
} from "lucide-react";

type Search = {
  start?: string;
  end?: string;
};

type SaleRow = {
  id: string;
  cash_register_id: string;
  total_amount: number;
  total_cost: number;
  gross_profit: number;
  payment_method: string;
  status: string;
  card_type?: string | null;
  card_machine?: string | null;
  preparation_status?: string | null;
  created_at: string;
  users?: { name: string | null; email: string | null } | null;
};

type SaleItemRow = {
  quantity: number;
  total_price: number;
  product_name_snapshot: string;
};

type CashRegisterRow = {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opening_amount: number;
  closing_amount: number | null;
  expected_amount: number;
  cash_difference: number | null;
  sales_amount: number;
  status: string;
  users?: { name: string | null; email: string | null } | null;
};

type CashMovementRow = {
  id: string;
  cash_register_id: string;
  movement_type: "entrada" | "saida";
  amount: number;
  reason: string;
  created_at: string;
  users?: { name: string | null; email: string | null } | null;
};

type CashMovementAuditRow = {
  id: string;
  entity_id: string | null;
  metadata: {
    cash_register_id?: string;
    movement_type?: string;
    amount?: number | string;
    reason?: string;
  } | null;
  created_at: string;
  users?: { name: string | null; email: string | null } | null;
};

type TerminalClosingRow = {
  id: string;
  cash_register_id: string;
  terminal_name: string;
  credit_amount: number;
  debit_amount: number;
  pix_amount: number;
  created_at: string;
};

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

function personName(row: { users?: { name: string | null; email: string | null } | null }) {
  return row.users?.name || row.users?.email || "Sem nome";
}

function movementFromAudit(row: CashMovementAuditRow): CashMovementRow {
  return {
    id: row.id,
    cash_register_id: row.metadata?.cash_register_id ?? "",
    movement_type: row.metadata?.movement_type === "saida" ? "saida" : "entrada",
    amount: Number(row.metadata?.amount ?? 0),
    reason: row.metadata?.reason ?? "Movimento de caixa",
    created_at: row.created_at,
    users: row.users,
  };
}

function Metric({
  label,
  value,
  format = "money",
  tone = "default",
}: {
  label: string;
  value: number;
  format?: "money" | "number";
  tone?: "default" | "good" | "bad";
}) {
  return (
    <div className="rounded-lg border border-line bg-panel-strong p-3">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg font-black",
          tone === "good" && "text-green-300",
          tone === "bad" && "text-rose-200",
        )}
      >
        {format === "money" ? money(value) : quantity(value)}
      </p>
    </div>
  );
}

function SectionTitle({
  number,
  title,
  aside,
}: {
  number: string;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-black text-white">
          {number}
        </span>
        <h2 className="font-bold">{title}</h2>
      </div>
      {aside}
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: Promise<Search>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const today = todayRange();
  const month = monthRange();
  const todayDate = today.start.slice(0, 10);
  const monthStart = month.start.slice(0, 10);
  const range = rangeFromSearch(params?.start, params?.end);
  const supabase = await createClient();
  const { data: resetLog } = await supabase
    .from("audit_logs")
    .select("created_at")
    .eq("action", "operational_history.reset")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ created_at: string }>();
  const rangeStart =
    resetLog?.created_at && resetLog.created_at > range.start
      ? resetLog.created_at
      : range.start;

  const [salesResult, registersResult, movementsResult, terminalClosingsResult] = await Promise.all([
    fetchAllPages<SaleRow>((from, to) =>
      supabase
        .from("sales")
        .select("id,cash_register_id,total_amount,total_cost,gross_profit,payment_method,status,card_type,card_machine,preparation_status,created_at,users:users!sales_user_id_fkey(name,email)")
        .gte("created_at", rangeStart)
        .lte("created_at", range.end)
        .order("created_at", { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: SaleRow[] | null; error: { message: string; code?: string } | null }>,
    ),
    fetchAllPages<CashRegisterRow>((from, to) =>
      supabase
        .from("cash_registers")
        .select("id,opened_at,closed_at,opening_amount,closing_amount,expected_amount,cash_difference,sales_amount,status,users(name,email)")
        .gte("opened_at", rangeStart)
        .lte("opened_at", range.end)
        .order("opened_at", { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: CashRegisterRow[] | null; error: { message: string; code?: string } | null }>,
    ),
    fetchAllPages<CashMovementRow>((from, to) =>
      supabase
        .from("cash_movements")
        .select("id,cash_register_id,movement_type,amount,reason,created_at,users(name,email)")
        .gte("created_at", rangeStart)
        .lte("created_at", range.end)
        .order("created_at", { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: CashMovementRow[] | null; error: { message: string; code?: string } | null }>,
    ),
    fetchAllPages<TerminalClosingRow>((from, to) =>
      supabase
        .from("cash_terminal_closings")
        .select("id,cash_register_id,terminal_name,credit_amount,debit_amount,pix_amount,created_at")
        .gte("created_at", rangeStart)
        .lte("created_at", range.end)
        .order("created_at", { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: TerminalClosingRow[] | null; error: { message: string; code?: string } | null }>,
    ),
  ]);

  let sales = salesResult.data;
  if (isMissingOperationalColumn(salesResult.error)) {
    const fallback = await fetchAllPages<SaleRow>((from, to) =>
      supabase
        .from("sales")
        .select("id,cash_register_id,total_amount,total_cost,gross_profit,payment_method,status,created_at,users:users!sales_user_id_fkey(name,email)")
        .gte("created_at", rangeStart)
        .lte("created_at", range.end)
        .order("created_at", { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: SaleRow[] | null; error: { message: string; code?: string } | null }>,
    );

    sales = fallback.data;
    if (fallback.error) throw fallback.error;
  } else if (salesResult.error) {
    throw salesResult.error;
  }

  if (sales.length) {
    const { data: paymentAudits } = await supabase
      .from("audit_logs")
      .select("entity_id,metadata")
      .eq("action", "sale.payment_details")
      .in("entity_id", sales.map((sale) => sale.id));

    sales = mergeSalePaymentDetails(
      sales,
      (paymentAudits ?? []) as unknown as SalePaymentAudit[],
    );
  }

  let registers = registersResult.data;
  if (registersResult.error) {
    const fallback = await fetchAllPages<CashRegisterRow>((from, to) =>
      supabase
        .from("cash_registers")
        .select("id,opened_at,closed_at,opening_amount,closing_amount,expected_amount,sales_amount,status,users(name,email)")
        .gte("opened_at", rangeStart)
        .lte("opened_at", range.end)
        .order("opened_at", { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: CashRegisterRow[] | null; error: { message: string; code?: string } | null }>,
    );

    registers = ((fallback.data ?? []) as unknown as Omit<CashRegisterRow, "cash_difference">[])
      .map((register) => ({ ...register, cash_difference: null }));
    if (fallback.error) throw fallback.error;
  }

  let movements = movementsResult.data;
  if (movementsResult.error) {
    const fallback = await fetchAllPages<CashMovementAuditRow>((from, to) =>
      supabase
        .from("audit_logs")
        .select("id,entity_id,metadata,created_at,users(name,email)")
        .like("action", "cash_movement.%")
        .not("metadata->>cash_register_id", "is", null)
        .gte("created_at", rangeStart)
        .lte("created_at", range.end)
        .order("created_at", { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: CashMovementAuditRow[] | null; error: { message: string; code?: string } | null }>,
    );

    movements = ((fallback.data ?? []) as unknown as CashMovementAuditRow[]).map(movementFromAudit);
    if (fallback.error) throw fallback.error;
  }

  let terminalClosings = terminalClosingsResult.error
    ? []
    : terminalClosingsResult.data;

  const registerIds = new Set(registers.map((register) => register.id));
  sales = sales.filter((sale) => registerIds.has(sale.cash_register_id));
  movements = movements.filter((movement) => registerIds.has(movement.cash_register_id));
  terminalClosings = terminalClosings.filter((closing) =>
    registerIds.has(closing.cash_register_id),
  );

  const completed = sales.filter((sale) => sale.status === "completed");
  const cancelled = sales.filter((sale) => sale.status === "cancelled");
  const completedIds = completed.map((sale) => sale.id);
  const itemsResult = completedIds.length
    ? await fetchAllPages<SaleItemRow>((from, to) =>
        supabase
          .from("sale_items")
          .select("quantity,total_price,product_name_snapshot")
          .in("sale_id", completedIds)
          .range(from, to) as unknown as PromiseLike<{ data: SaleItemRow[] | null; error: { message: string; code?: string } | null }>,
      )
    : { data: [] };
  if ("error" in itemsResult && itemsResult.error) throw itemsResult.error;
  const items = (itemsResult.data ?? []) as unknown as SaleItemRow[];

  const revenue = sumMoney(completed.map((sale) => sale.total_amount));
  const cost = sumMoney(completed.map((sale) => sale.total_cost));
  const profit = sumMoney(completed.map((sale) => sale.gross_profit));
  const cancelledValue = sumMoney(cancelled.map((sale) => sale.total_amount));
  const averageTicket = completed.length ? revenue / completed.length : 0;
  const cashSales = salesByPayment(sales, "dinheiro");
  const pixSales = salesByPayment(sales, "pix");
  const creditSales = cardSalesByType(sales, "credito");
  const debitSales = cardSalesByType(sales, "debito");
  const cardSalesUnknown = cardSalesWithoutType(sales);
  const registerSummaries = registers.map((register) => {
    const registerSales = sales.filter(
      (sale) => sale.cash_register_id === register.id,
    );
    const registerMovements = movements.filter(
      (movement) => movement.cash_register_id === register.id,
    );
    const flow = cashFlowSummary({
      opening: Number(register.opening_amount),
      cashSales: salesByPayment(registerSales, "dinheiro"),
      cashIn: movementsByType(registerMovements, "entrada"),
      cashOut: movementsByType(registerMovements, "saida"),
    });
    const counted =
      register.status === "closed" && register.closing_amount !== null
        ? Number(register.closing_amount)
        : null;

    return {
      register,
      flow,
      salesTotal: sumMoney(
        registerSales
          .filter((sale) => sale.status === "completed")
          .map((sale) => sale.total_amount),
      ),
      salesCount: registerSales.filter((sale) => sale.status === "completed").length,
      counted,
      difference: counted === null ? 0 : counted - flow.expectedCash,
      savedExpectedDifference:
        Number(register.expected_amount) - flow.expectedCash,
    };
  });
  const cashFlow = cashFlowSummary({
    opening: sumMoney(registerSummaries.map(({ flow }) => flow.opening)),
    cashSales: sumMoney(registerSummaries.map(({ flow }) => flow.cashSales)),
    cashIn: sumMoney(registerSummaries.map(({ flow }) => flow.otherCashIn)),
    cashOut: sumMoney(registerSummaries.map(({ flow }) => flow.cashOut)),
  });
  const expectedCash = cashFlow.expectedCash;
  const countedCash = sumMoney(
    registerSummaries.map(({ counted }) => counted),
  );
  const cashDifference = sumMoney(
    registerSummaries.map(({ difference }) => difference),
  );
  const openRegisters = registers.filter((register) => register.status === "open").length;
  const closedRegisters = registers.filter((register) => register.status === "closed").length;
  const registersWithDifference = registers.filter(
    (register) => {
      const summary = registerSummaries.find(({ register: row }) => row.id === register.id);
      return register.status === "closed" && Math.abs(summary?.difference ?? 0) > 0.009;
    },
  ).length;
  const savedFormulaDifference = sumMoney(
    registerSummaries.map(({ savedExpectedDifference }) => savedExpectedDifference),
  );
  const digitalSales =
    pixSales + creditSales + debitSales + cardSalesUnknown;
  const closedExpectedCash = sumMoney(
    registerSummaries
      .filter(({ register }) => register.status === "closed")
      .map(({ flow }) => flow.expectedCash),
  );
  const openExpectedCash = sumMoney(
    registerSummaries
      .filter(({ register }) => register.status === "open")
      .map(({ flow }) => flow.expectedCash),
  );

  const paymentRows = [
    { label: "Dinheiro", value: cashSales },
    { label: "PIX", value: pixSales },
    { label: "Credito", value: creditSales },
    { label: "Debito", value: debitSales },
    { label: "Cartao s/ tipo", value: cardSalesUnknown },
  ];

  const terminalClosingRows = Object.values(
    terminalClosings.reduce<Record<string, {
      terminal: string;
      credit: number;
      debit: number;
      pix: number;
      total: number;
    }>>((acc, row) => {
      const terminal = row.terminal_name || "Sem maquininha";
      acc[terminal] ??= { terminal, credit: 0, debit: 0, pix: 0, total: 0 };
      acc[terminal].credit += Number(row.credit_amount ?? 0);
      acc[terminal].debit += Number(row.debit_amount ?? 0);
      acc[terminal].pix += Number(row.pix_amount ?? 0);
      acc[terminal].total +=
        Number(row.credit_amount ?? 0)
        + Number(row.debit_amount ?? 0)
        + Number(row.pix_amount ?? 0);
      return acc;
    }, {}),
  ).sort((a, b) => b.total - a.total);
  const salesMachineRows = groupSalesByMachine(sales);
  const machineRows = terminalClosingRows.length ? terminalClosingRows : salesMachineRows;
  const machineCredit = sumMoney(machineRows.map((row) => row.credit));
  const machineDebit = sumMoney(machineRows.map((row) => row.debit));
  const machinePix = sumMoney(machineRows.map((row) => row.pix));
  const machineTotal = machineCredit + machineDebit + machinePix;
  const machineDifference = machineTotal - (creditSales + debitSales + cardSalesUnknown + pixSales);

  const employeeRows = Object.values(
    completed.reduce<Record<string, { name: string; total: number; count: number }>>(
      (acc, sale) => {
        const name = personName(sale);
        acc[name] ??= { name, total: 0, count: 0 };
        acc[name].count += 1;
        acc[name].total += Number(sale.total_amount ?? 0);
        return acc;
      },
      {},
    ),
  ).sort((a, b) => b.total - a.total);

  const productRanking = Object.values(
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
    .slice(0, 8);

  return (
    <Panel>
      <SectionHeader
        eyebrow="Historico"
        title="Historico financeiro"
        description="Vendas, gavetas e fechamentos conciliados caixa por caixa."
        action={
          <LinkButton href="/caixa" variant="secondary">
            Caixa do dia
          </LinkButton>
        }
      />

      <Card className="border-accent/20">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold">Periodo analisado</h2>
                <p className="text-sm text-muted">
                  O relatorio considera somente os movimentos ligados aos caixas deste periodo.
                </p>
              </div>
              <div className="flex gap-2">
                <LinkButton href={`/relatorios?start=${todayDate}&end=${todayDate}`} size="sm">
                  Hoje
                </LinkButton>
                <LinkButton href={`/relatorios?start=${monthStart}&end=${todayDate}`} size="sm">
                  Mes
                </LinkButton>
              </div>
            </div>
            <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <div className="space-y-2">
                <Label htmlFor="start">Inicio</Label>
                <Input id="start" name="start" type="date" defaultValue={params?.start ?? todayDate} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end">Fim</Label>
                <Input id="end" name="end" type="date" defaultValue={params?.end ?? todayDate} />
              </div>
              <Button type="submit" className="self-end">
                Filtrar
              </Button>
            </form>
          </div>
        </div>
      </Card>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-accent/25 bg-accent/5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted">Vendido no periodo</p>
              <p className="mt-1 text-3xl font-black">{money(revenue)}</p>
              <p className="mt-2 text-sm text-muted">
                {completed.length} venda(s), ticket medio {money(averageTicket)}
              </p>
            </div>
            <ReceiptText className="h-5 w-5 text-accent" />
          </div>
        </Card>
        <Card className="border-green-500/25 bg-green-500/5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted">Entrou em dinheiro</p>
              <p className="mt-1 text-3xl font-black text-green-300">
                {money(cashFlow.cashSales + cashFlow.otherCashIn)}
              </p>
              <p className="mt-2 text-sm text-muted">
                Vendas e outras entradas na gaveta
              </p>
            </div>
            <Banknote className="h-5 w-5 text-green-300" />
          </div>
        </Card>
        <Card className="border-accent/25 bg-accent/5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted">PIX e cartao</p>
              <p className="mt-1 text-3xl font-black">{money(digitalSales)}</p>
              <p className="mt-2 text-sm text-muted">
                Faz parte das vendas, fora da gaveta
              </p>
            </div>
            <CreditCard className="h-5 w-5 text-accent" />
          </div>
        </Card>
        <Card
          className={cn(
            "border-line",
            closedRegisters && Math.abs(cashDifference) > 0.009
              ? "border-rose-500/30 bg-rose-500/5"
              : "border-green-500/20",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted">Diferenca nos fechamentos</p>
              <p
                className={cn(
                  "mt-1 text-3xl font-black",
                  Math.abs(cashDifference) > 0.009 && "text-rose-200",
                )}
              >
                {money(cashDifference)}
              </p>
              <p className="mt-2 text-sm text-muted">
                {closedRegisters} fechado(s), {openRegisters} aberto(s)
              </p>
            </div>
            <Calculator className="h-5 w-5 text-muted" />
          </div>
        </Card>
      </div>

      <Card className="mt-4 border-accent/20">
        <SectionTitle
          number="1"
          title="Conta consolidada da gaveta"
          aside={
            closedRegisters ? (
              <Badge variant={Math.abs(cashDifference) > 0.009 ? "warning" : "success"}>
                Diferenca fechada {money(cashDifference)}
              </Badge>
            ) : (
              <Badge variant="neutral">Sem caixa fechado</Badge>
            )
          }
        />
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="Saldo inicial" value={cashFlow.opening} />
          <Metric label="Vendas em dinheiro" value={cashFlow.cashSales} tone="good" />
          <Metric label="Outras entradas" value={cashFlow.otherCashIn} tone="good" />
          <Metric label="Pagamentos e saidas" value={cashFlow.cashOut} tone="bad" />
          <Metric label="Esperado total" value={expectedCash} />
          <Metric
            label={closedRegisters ? "Diferenca fechada" : "Ainda nao contado"}
            value={closedRegisters ? cashDifference : 0}
            tone={closedRegisters && Math.abs(cashDifference) > 0.009 ? "bad" : "default"}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 rounded-lg border border-line bg-background/40 p-3 text-sm">
          <span>{money(cashFlow.opening)} inicial</span>
          <span className="text-green-300">+ {money(cashFlow.cashSales)} vendas em dinheiro</span>
          <span className="text-green-300">
            + {money(cashFlow.otherCashIn)} outras entradas
          </span>
          <span className="text-rose-200">
            - {money(cashFlow.cashOut)} pagamentos/saidas
          </span>
          <strong>= {money(cashFlow.expectedCash)} pela formula</strong>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-line bg-panel-strong p-3">
            <p className="text-sm text-muted">Ainda em caixas abertos</p>
            <p className="mt-1 font-black">{money(openExpectedCash)}</p>
          </div>
          <div className="rounded-lg border border-line bg-panel-strong p-3">
            <p className="text-sm text-muted">Esperado nos caixas fechados</p>
            <p className="mt-1 font-black">{money(closedExpectedCash)}</p>
          </div>
          <div className="rounded-lg border border-line bg-panel-strong p-3">
            <p className="text-sm text-muted">Contado nos fechamentos</p>
            <p className="mt-1 font-black">{money(countedCash)}</p>
          </div>
        </div>
        {Math.abs(savedFormulaDifference) > 0.009 ? (
          <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
            Auditoria: o valor antigo salvo no banco difere das operacoes em{" "}
            {money(savedFormulaDifference)}. Este relatorio usa a conta reconstruida acima.
          </p>
        ) : null}
      </Card>

      <Card className="mt-4">
        <SectionTitle
          number="2"
          title="Conferencia por caixa"
          aside={<Badge>{registers.length} caixa(s)</Badge>}
        />
        {registerSummaries.length ? (
          <div className="space-y-3">
            {registerSummaries.map(({ register, flow, salesTotal, salesCount, counted, difference }) => (
              <div
                key={register.id}
                className="rounded-xl border border-line bg-panel-strong p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg border border-accent/25 bg-accent/10 p-2 text-accent">
                      <WalletCards className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black">{personName(register)}</p>
                        <Badge variant={register.status === "closed" ? "neutral" : "success"}>
                          {register.status === "closed" ? "Fechado" : "Aberto"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        Aberto em {dateTime(register.opened_at)}
                        {register.closed_at ? ` - fechado em ${dateTime(register.closed_at)}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-sm text-muted">Vendas deste caixa</p>
                    <p className="font-black">{money(salesTotal)}</p>
                    <p className="text-xs text-muted">{salesCount} venda(s)</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
                  <Metric label="Abertura" value={flow.opening} />
                  <Metric label="Vendas dinheiro" value={flow.cashSales} tone="good" />
                  <Metric label="Outras entradas" value={flow.otherCashIn} tone="good" />
                  <Metric label="Saidas" value={flow.cashOut} tone="bad" />
                  <Metric label="Esperado" value={flow.expectedCash} />
                  <Metric
                    label={counted === null ? "Aguardando fechamento" : "Diferenca"}
                    value={counted === null ? 0 : difference}
                    tone={counted !== null && Math.abs(difference) > 0.009 ? "bad" : "default"}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-background/40 p-3 text-sm">
                  <span>
                    {money(flow.opening)} + {money(flow.cashSales)} +{" "}
                    {money(flow.otherCashIn)} - {money(flow.cashOut)} ={" "}
                    <strong>{money(flow.expectedCash)}</strong>
                  </span>
                  <span className="text-muted">
                    {counted === null
                      ? "O valor contado aparecera quando o caixa for fechado."
                      : `Contado no fechamento: ${money(counted)}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>Nenhum caixa pertence ao periodo selecionado.</EmptyState>
        )}
      </Card>

      <Card className="mt-4">
        <SectionTitle number="3" title="Resultado comercial" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Faturamento" value={revenue} />
          <Metric label="Custo estimado" value={cost} />
          <Metric label="Lucro bruto" value={profit} tone={profit < 0 ? "bad" : "good"} />
          <Metric label="Ticket medio" value={averageTicket} />
          <Metric
            label="Vendas canceladas"
            value={cancelledValue}
            tone={cancelledValue > 0 ? "bad" : "default"}
          />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-5">
          <Metric label="Vendas concluidas" value={completed.length} format="number" />
          <Metric
            label="Cancelamentos"
            value={cancelled.length}
            format="number"
            tone={cancelled.length ? "bad" : "default"}
          />
          <Metric label="Caixas abertos" value={openRegisters} format="number" />
          <Metric label="Caixas fechados" value={closedRegisters} format="number" />
          <Metric
            label="Caixas com diferenca"
            value={registersWithDifference}
            format="number"
            tone={registersWithDifference ? "bad" : "default"}
          />
        </div>
      </Card>

      <Card className="mt-4 border-green-400/20">
        <SectionTitle
          number="4"
          title="Maquininhas"
          aside={
            <Badge variant={Math.abs(machineDifference) > 0.009 ? "warning" : "success"}>
              Divergencia {money(machineDifference)}
            </Badge>
          }
        />
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Total maquinas" value={machineTotal} />
          <Metric label="Credito" value={machineCredit} />
          <Metric label="Debito" value={machineDebit} />
          <Metric label="PIX" value={machinePix} />
        </div>
        <div className="mt-3">
          {machineRows.length ? (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {machineRows.map((row) => (
                <div key={row.terminal} className="rounded-lg border border-line bg-panel-strong p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="font-bold">{row.terminal}</p>
                    <strong>{money(row.total)}</strong>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm text-muted">
                    <span>Cred. {money(row.credit)}</span>
                    <span>Deb. {money(row.debit)}</span>
                    <span>PIX {money(row.pix)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>Nenhum fechamento de maquininha no periodo.</EmptyState>
          )}
        </div>
        {!terminalClosingRows.length && salesMachineRows.length ? (
          <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-100">
            Mostrando maquininhas registradas nas vendas. Para conferencia oficial, aplique a
            migracao e feche o caixa com os totais de cada maquininha.
          </p>
        ) : null}
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <h2 className="mb-3 font-bold">Formas de pagamento</h2>
          <div className="space-y-2">
            {paymentRows.map((row) => (
              <div key={row.label} className="flex justify-between rounded-lg border border-line bg-panel-strong p-3">
                <span>{row.label}</span>
                <strong>{money(row.value)}</strong>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 font-bold">Produtos vendidos</h2>
          {productRanking.length ? (
            <div className="space-y-2">
              {productRanking.map((product) => (
                <div key={product.name} className="flex justify-between gap-3 rounded-lg border border-line bg-panel-strong p-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{product.name}</p>
                    <p className="text-sm text-muted">{quantity(product.quantity)} un.</p>
                  </div>
                  <strong>{money(product.total)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>Nenhum produto vendido.</EmptyState>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-bold">Por funcionario</h2>
            <Badge>{employeeRows.length} funcionario(s)</Badge>
          </div>
          {employeeRows.length ? (
            <div className="space-y-2">
              {employeeRows.map((employee) => (
                <div key={employee.name} className="flex justify-between gap-3 rounded-lg border border-line bg-panel-strong p-3">
                  <div>
                    <p className="font-semibold">{employee.name}</p>
                    <p className="text-sm text-muted">{employee.count} venda(s)</p>
                  </div>
                  <strong>{money(employee.total)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>Nenhuma venda por funcionario.</EmptyState>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <SectionTitle
          number="5"
          title="Detalhes salvos"
          aside={<Badge>{sales.length + registers.length + movements.length} registro(s)</Badge>}
        />

        <div className="space-y-3">
          <details className="rounded-lg border border-line bg-panel-strong p-3">
            <summary className="cursor-pointer font-bold">Vendas ({sales.length})</summary>
            <div className="mt-3 overflow-x-auto">
              {sales.length ? (
                <div className="min-w-[900px] space-y-2">
                  {sales.map((sale) => (
                    <div
                      key={sale.id}
                      className="grid grid-cols-[100px_1fr_120px_110px_110px_250px] items-center gap-3 rounded-lg border border-line bg-panel p-3"
                    >
                      <Badge variant={sale.status === "completed" ? "success" : "danger"}>
                        {sale.status === "completed" ? "OK" : "Cancelada"}
                      </Badge>
                      <div>
                        <p className="font-semibold">{personName(sale)}</p>
                        <p className="text-sm text-muted">{dateTime(sale.created_at)}</p>
                      </div>
                      <strong>{money(sale.total_amount)}</strong>
                      <span>{paymentLabel(sale.payment_method)}</span>
                      <span className="text-green-300">{money(sale.gross_profit)}</span>
                      {sale.status === "completed" ? (
                        <CancelSaleForm saleId={sale.id} />
                      ) : (
                        <span className="text-sm text-muted">Sem acao</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState>Nenhuma venda no periodo.</EmptyState>
              )}
            </div>
          </details>

          <details className="rounded-lg border border-line bg-panel-strong p-3">
            <summary className="cursor-pointer font-bold">
              Outras entradas, pagamentos e saidas ({movements.length})
            </summary>
            <div className="mt-3">
              {movements.length ? (
                <div className="grid gap-2 md:grid-cols-2">
                  {movements.map((movement) => (
                    <div key={movement.id} className="flex justify-between gap-3 rounded-lg border border-line bg-panel p-3">
                      <div className="min-w-0">
                        <Badge
                          variant={movement.movement_type === "entrada" ? "success" : "warning"}
                        >
                          {movement.movement_type === "entrada"
                            ? "Outra entrada"
                            : "Pagamento/saida"}
                        </Badge>
                        <p className="truncate font-semibold">{movement.reason}</p>
                        <p className="text-sm text-muted">
                          {personName(movement)} - {dateTime(movement.created_at)}
                        </p>
                      </div>
                      <strong className={movement.movement_type === "entrada" ? "text-green-300" : "text-rose-200"}>
                        {movement.movement_type === "entrada" ? "+" : "-"}
                        {money(movement.amount)}
                      </strong>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState>Nenhuma entrada ou saida no periodo.</EmptyState>
              )}
            </div>
          </details>

          <details className="rounded-lg border border-line bg-panel-strong p-3">
            <summary className="cursor-pointer font-bold">Caixas salvos ({registers.length})</summary>
            <div className="mt-3">
              {registers.length ? (
                <div className="space-y-2">
                  {registerSummaries.map(({ register, flow, counted, difference }) => (
                    <div key={register.id} className="grid gap-2 rounded-lg border border-line bg-panel p-3 md:grid-cols-[1fr_auto]">
                      <div>
                        <p className="font-semibold">{personName(register)}</p>
                        <p className="text-sm text-muted">
                          {dateTime(register.opened_at)} - {dateTime(register.closed_at)}
                        </p>
                      </div>
                      <div className="text-sm md:text-right">
                        <p>Esperado calculado: {money(flow.expectedCash)}</p>
                        <p>Contado: {counted === null ? "Caixa aberto" : money(counted)}</p>
                        <p>Dif.: {counted === null ? "-" : money(difference)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState>Nenhum caixa no periodo.</EmptyState>
              )}
            </div>
          </details>
        </div>
      </Card>
    </Panel>
  );
}
