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
  cashRegisterDifference,
  expectedCashTotal,
  groupSalesByMachine,
  movementsByType,
  salesByPayment,
  sumMoney,
} from "@/lib/cash";
import { cn } from "@/lib/cn";
import { monthRange, rangeFromSearch, todayRange } from "@/lib/dates";
import { dateTime, money, paymentLabel, quantity } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/supabase/pagination";
import { CancelSaleForm } from "./cancel-sale-form";

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
    cash_register_id: row.entity_id ?? "",
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

  const [salesResult, registersResult, movementsResult, terminalClosingsResult] = await Promise.all([
    fetchAllPages<SaleRow>((from, to) =>
      supabase
        .from("sales")
        .select("id,cash_register_id,total_amount,total_cost,gross_profit,payment_method,status,card_type,card_machine,preparation_status,created_at,users(name,email)")
        .gte("created_at", range.start)
        .lte("created_at", range.end)
        .order("created_at", { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: SaleRow[] | null; error: { message: string; code?: string } | null }>,
    ),
    fetchAllPages<CashRegisterRow>((from, to) =>
      supabase
        .from("cash_registers")
        .select("id,opened_at,closed_at,opening_amount,closing_amount,expected_amount,cash_difference,sales_amount,status,users(name,email)")
        .gte("opened_at", range.start)
        .lte("opened_at", range.end)
        .order("opened_at", { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: CashRegisterRow[] | null; error: { message: string; code?: string } | null }>,
    ),
    fetchAllPages<CashMovementRow>((from, to) =>
      supabase
        .from("cash_movements")
        .select("id,cash_register_id,movement_type,amount,reason,created_at,users(name,email)")
        .gte("created_at", range.start)
        .lte("created_at", range.end)
        .order("created_at", { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: CashMovementRow[] | null; error: { message: string; code?: string } | null }>,
    ),
    fetchAllPages<TerminalClosingRow>((from, to) =>
      supabase
        .from("cash_terminal_closings")
        .select("id,cash_register_id,terminal_name,credit_amount,debit_amount,pix_amount,created_at")
        .gte("created_at", range.start)
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
        .select("id,cash_register_id,total_amount,total_cost,gross_profit,payment_method,status,created_at,users(name,email)")
        .gte("created_at", range.start)
        .lte("created_at", range.end)
        .order("created_at", { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: SaleRow[] | null; error: { message: string; code?: string } | null }>,
    );

    sales = fallback.data;
    if (fallback.error) throw fallback.error;
  } else if (salesResult.error) {
    throw salesResult.error;
  }
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

  let registers = registersResult.data;
  if (registersResult.error) {
    const fallback = await fetchAllPages<CashRegisterRow>((from, to) =>
      supabase
        .from("cash_registers")
        .select("id,opened_at,closed_at,opening_amount,closing_amount,expected_amount,sales_amount,status,users(name,email)")
        .gte("opened_at", range.start)
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
        .eq("action", "cash_register.cash_movement")
        .gte("created_at", range.start)
        .lte("created_at", range.end)
        .order("created_at", { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: CashMovementAuditRow[] | null; error: { message: string; code?: string } | null }>,
    );

    movements = ((fallback.data ?? []) as unknown as CashMovementAuditRow[]).map(movementFromAudit);
    if (fallback.error) throw fallback.error;
  }

  const terminalClosings = terminalClosingsResult.error
    ? []
    : terminalClosingsResult.data;

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
  const cashIn = movementsByType(movements, "entrada");
  const cashOut = movementsByType(movements, "saida");
  const cashEntered = cashSales + cashIn;
  const openingTotal = sumMoney(registers.map((register) => register.opening_amount));
  const expectedCash = sumMoney(registers.map((register) => register.expected_amount));
  const expectedByFormula = expectedCashTotal({
    opening: openingTotal,
    cashSales,
    cashIn,
    cashOut,
  });
  const countedCash = sumMoney(
    registers
      .filter((register) => register.status === "closed")
      .map((register) => register.closing_amount ?? 0),
  );
  const cashDifference = sumMoney(
    registers
      .filter((register) => register.status === "closed")
      .map((register) => cashRegisterDifference(register)),
  );
  const openRegisters = registers.filter((register) => register.status === "open").length;
  const closedRegisters = registers.filter((register) => register.status === "closed").length;
  const registersWithDifference = registers.filter(
    (register) =>
      register.status === "closed" && Math.abs(cashRegisterDifference(register)) > 0.009,
  ).length;
  const expectedFormulaDifference = expectedCash - expectedByFormula;

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
        title="Historico por data"
        description="Escolha um periodo e veja somente o que ficou salvo nele."
        action={
          <LinkButton href="/caixa" variant="secondary">
            Caixa do dia
          </LinkButton>
        }
      />

      <Card>
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold">Periodo</h2>
                <p className="text-sm text-muted">Vendas, caixas e entradas/saidas dessas datas.</p>
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

      <Card className="mt-4">
        <SectionTitle number="1" title="Resultado do periodo" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Faturamento" value={revenue} />
          <Metric label="Custo" value={cost} />
          <Metric label="Lucro bruto" value={profit} tone={profit < 0 ? "bad" : "default"} />
          <Metric label="Ticket medio" value={averageTicket} />
          <Metric label="Cancelado" value={cancelledValue} tone={cancelledValue > 0 ? "bad" : "default"} />
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-5">
          <Metric label="Vendas concluidas" value={completed.length} format="number" />
          <Metric label="Cancelamentos" value={cancelled.length} format="number" tone={cancelled.length ? "bad" : "default"} />
          <Metric label="Caixas abertos" value={openRegisters} format="number" />
          <Metric label="Caixas fechados" value={closedRegisters} format="number" />
          <Metric label="Caixas com diferenca" value={registersWithDifference} format="number" tone={registersWithDifference ? "bad" : "default"} />
        </div>
      </Card>

      <Card className="mt-4 border-accent/20">
        <SectionTitle
          number="2"
          title="Dinheiro do periodo"
          aside={
            <Badge variant={Math.abs(cashDifference) > 0.009 ? "warning" : "success"}>
              Diferenca {money(cashDifference)}
            </Badge>
          }
        />
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="Comecou com" value={openingTotal} />
          <Metric label="Entrou dinheiro" value={cashEntered} tone="good" />
          <Metric label="Saiu dinheiro" value={cashOut} tone="bad" />
          <Metric label="Era para ter" value={expectedCash} />
          <Metric label="Foi contado" value={countedCash} />
          <Metric label="Diferenca" value={cashDifference} tone={Math.abs(cashDifference) > 0.009 ? "bad" : "default"} />
        </div>
        {Math.abs(expectedFormulaDifference) > 0.009 ? (
          <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
            Conferir: o esperado salvo difere da formula em {money(expectedFormulaDifference)}.
          </p>
        ) : null}
      </Card>

      <Card className="mt-4 border-green-400/20">
        <SectionTitle
          number="3"
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
          number="4"
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
            <summary className="cursor-pointer font-bold">Dinheiro que entrou/saiu ({movements.length})</summary>
            <div className="mt-3">
              {movements.length ? (
                <div className="grid gap-2 md:grid-cols-2">
                  {movements.map((movement) => (
                    <div key={movement.id} className="flex justify-between gap-3 rounded-lg border border-line bg-panel p-3">
                      <div className="min-w-0">
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
                  {registers.map((register) => (
                    <div key={register.id} className="grid gap-2 rounded-lg border border-line bg-panel p-3 md:grid-cols-[1fr_auto]">
                      <div>
                        <p className="font-semibold">{personName(register)}</p>
                        <p className="text-sm text-muted">
                          {dateTime(register.opened_at)} - {dateTime(register.closed_at)}
                        </p>
                      </div>
                      <div className="text-sm md:text-right">
                        <p>Esperado: {money(register.expected_amount)}</p>
                        <p>Contado: {money(register.closing_amount)}</p>
                        <p>Dif.: {money(cashRegisterDifference(register))}</p>
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
