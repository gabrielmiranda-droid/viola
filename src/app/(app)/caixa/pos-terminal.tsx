"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Banknote,
  Calculator,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  CreditCard,
  Layers3,
  Minus,
  PackageCheck,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  cardSalesByType,
  cardSalesWithoutType,
  expectedCashTotal,
  movementsByType,
  salesByPayment,
  totalSales,
} from "@/lib/cash";
import { cn } from "@/lib/cn";
import { dateTime, money, quantity } from "@/lib/format";
import { productTracksStock } from "@/lib/product-stock";
import { createClient } from "@/lib/supabase/client";
import type {
  ActionResult,
  CardType,
  CashMovement,
  CashRegister,
  PaymentMethod,
  Product,
  RegisterSale,
  RegisterSaleItem,
} from "@/lib/types";
import {
  cashMovementAction,
  closeRegisterAction,
  finalizeSaleAction,
  openRegisterAction,
} from "./actions";

type CartItem = {
  product: Product;
  quantity: number;
};

type MetricProps = {
  label: string;
  value: number;
  format?: "money" | "number";
  tone?: "default" | "good" | "bad";
};

type TerminalDraft = {
  id: string;
  terminalName: string;
  creditAmount: string;
  debitAmount: string;
  pixAmount: string;
};

type CashTab = "vendas" | "movimentacao" | "fechamento";

const cashTabs: Array<{
  value: CashTab;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { value: "vendas", label: "1. Vender", description: "Produtos e carrinho", icon: Layers3 },
  { value: "movimentacao", label: "2. Entrou / saiu", description: "Dinheiro da gaveta", icon: Banknote },
  { value: "fechamento", label: "3. Fechar", description: "Confere e salva", icon: ClipboardCheck },
];

const emptyAction: ActionResult = { ok: false };
const terminalDefaults = ["Principal", "Cielo", "Stone", "Mercado Pago"];

const paymentOptions: Array<{ value: PaymentMethod; label: string }> = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cartao", label: "Cartao" },
];

function asNumber(value: string | number | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
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

function productCategoryParts(category: string) {
  const parts = category
    .split(/\s+-\s+|\s*(?:\/|>|\\|\||::)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    category: parts[0] || "Sem categoria",
    subcategory: parts.slice(1).join(" / ") || "Geral",
  };
}

function Metric({ label, value, format = "money", tone = "default" }: MetricProps) {
  return (
    <div className="rounded-lg border border-line bg-panel-strong/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-lg font-black leading-tight",
          tone === "good" && "text-green-300",
          tone === "bad" && "text-rose-200",
        )}
      >
        {format === "money" ? money(value) : quantity(value)}
      </p>
    </div>
  );
}

function FormMessage({ state }: { state: ActionResult }) {
  if (!state.message) return null;

  return (
    <p className={cn("mt-3 text-sm", state.ok ? "text-green-300" : "text-rose-200")}>
      {state.message}
    </p>
  );
}

function CategoryRail({
  categories,
  activeCategory,
  onSelect,
}: {
  categories: Array<{ name: string; count: number }>;
  activeCategory: string;
  onSelect: (category: string) => void;
}) {
  const pageSize = 4;
  const pageCount = Math.max(1, Math.ceil(categories.length / pageSize));
  const [page, setPage] = useState(() => {
    const activeIndex = categories.findIndex((item) => item.name === activeCategory);
    return Math.max(0, Math.floor(activeIndex / pageSize));
  });
  const visibleCategories = categories.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        className="shrink-0 px-2"
        onClick={() => setPage((current) => Math.max(0, current - 1))}
        disabled={page === 0}
        aria-label="Categorias anteriores"
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>
      <div
        className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-4"
        aria-label="Categorias de produtos"
      >
        {visibleCategories.map((item) => (
          <button
            key={item.name}
            type="button"
            onClick={() => onSelect(item.name)}
            className={cn(
              "min-h-11 min-w-0 truncate rounded-lg border px-3 text-sm font-bold transition duration-200",
              activeCategory === item.name
                ? "border-accent bg-accent text-white shadow-[0_12px_30px_rgba(47,125,244,0.22)]"
                : "border-line bg-panel-strong/90 text-slate-300 hover:border-accent/35 hover:bg-white/6",
            )}
            title={`${item.name} (${item.count})`}
          >
            {item.name} ({item.count})
          </button>
        ))}
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="shrink-0 px-2"
        onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
        disabled={page >= pageCount - 1}
        aria-label="Proximas categorias"
      >
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
  );
}

function CashSubTabs({
  activeTab,
  onChange,
  cartQuantity,
  salesCount,
}: {
  activeTab: CashTab;
  onChange: (tab: CashTab) => void;
  cartQuantity: number;
  salesCount: number;
}) {
  return (
    <Card className="p-2">
      <div className="grid gap-2 md:grid-cols-3" role="tablist" aria-label="Passos do caixa">
        {cashTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.value;
          const helper =
            tab.value === "vendas"
              ? `${quantity(cartQuantity)} un. no carrinho`
              : tab.value === "fechamento"
                ? `${quantity(salesCount)} venda(s) para salvar`
                : tab.description;

          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.value)}
              className={cn(
                "flex min-h-16 items-center gap-3 rounded-lg border px-3 text-left transition duration-200",
                active
                  ? "border-accent bg-accent text-white shadow-[0_12px_30px_rgba(47,125,244,0.2)]"
                  : "border-line bg-panel-strong text-slate-300 hover:border-accent/35 hover:bg-white/6",
              )}
            >
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
                  active ? "border-white/25 bg-white/10" : "border-line bg-background/45",
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-black leading-tight">{tab.label}</span>
                <span className={cn("mt-1 block text-xs", active ? "text-blue-100" : "text-muted")}>
                  {helper}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function CashRegisterSummary({
  register,
  registerSales,
  cashMovements,
  reportHref,
  canViewReports,
  onSelectTab,
}: {
  register: CashRegister;
  registerSales: RegisterSale[];
  cashMovements: CashMovement[];
  reportHref: string;
  canViewReports: boolean;
  onSelectTab: (tab: CashTab) => void;
}) {
  const completed = registerSales.filter((sale) => sale.status === "completed");
  const cashSales = salesByPayment(registerSales, "dinheiro");
  const pixSales = salesByPayment(registerSales, "pix");
  const cardSales = salesByPayment(registerSales, "cartao");
  const cashIn = movementsByType(cashMovements, "entrada");
  const cashOut = movementsByType(cashMovements, "saida");
  const opening = Number(register.opening_amount);
  const drawerNow = Number(register.expected_amount);
  const cashEntered = cashSales + cashIn;
  const digitalSales = pixSales + cardSales;
  const formulaTotal = expectedCashTotal({ opening, cashSales, cashIn, cashOut });
  const formulaDifference = drawerNow - formulaTotal;

  return (
    <Card className="overflow-hidden border-accent/25 bg-panel p-0">
      <div className="grid xl:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.7fr)_230px]">
        <div className="border-b border-line bg-panel-strong/80 p-4 xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
              <WalletCards className="h-5 w-5" />
            </div>
            <Badge variant="success">Aberto</Badge>
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-accent">
            Caixa atual
          </p>
          <h2 className="mt-1 text-sm font-semibold text-muted">Na gaveta agora</h2>
          <p className="mt-1 text-4xl font-black leading-none text-white">{money(drawerNow)}</p>
          <p className="mt-3 text-sm text-muted">
            So deste caixa, aberto em {dateTime(register.opened_at)}.
          </p>
        </div>

        <div className="p-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-green-400/20 bg-green-400/10 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-green-200">
                Entrou dinheiro
              </p>
              <p className="mt-1 text-xl font-black text-green-200">{money(cashEntered)}</p>
              <p className="mt-1 text-xs text-muted">
                Venda {money(cashSales)} + entrada {money(cashIn)}
              </p>
            </div>
            <div className="rounded-lg border border-rose-400/20 bg-rose-400/10 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-rose-100">
                Saiu dinheiro
              </p>
              <p className="mt-1 text-xl font-black text-rose-100">{money(cashOut)}</p>
              <p className="mt-1 text-xs text-muted">Sangria, troco ou retirada</p>
            </div>
            <div className="rounded-lg border border-line bg-panel-strong p-3">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
                Vendido total
              </p>
              <p className="mt-1 text-xl font-black">{money(totalSales(registerSales))}</p>
              <p className="mt-1 text-xs text-muted">{quantity(completed.length)} venda(s)</p>
            </div>
            <div className="rounded-lg border border-line bg-panel-strong p-3">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
                PIX + cartao
              </p>
              <p className="mt-1 text-xl font-black">{money(digitalSales)}</p>
              <p className="mt-1 text-xs text-muted">Nao entra na gaveta</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-background/45 p-3 text-sm">
            <span className="text-muted">Abertura {money(opening)}</span>
            <span className="text-green-300">+ entrou {money(cashEntered)}</span>
            <span className="text-rose-200">- saiu {money(cashOut)}</span>
            <strong>= gaveta {money(drawerNow)}</strong>
            {Math.abs(formulaDifference) > 0.009 ? (
              <span className="text-amber-200">Conferir {money(formulaDifference)}</span>
            ) : null}
          </div>
        </div>

        <div className="grid content-center gap-2 border-t border-line bg-background/35 p-4 xl:border-l xl:border-t-0">
          <Button type="button" variant="secondary" onClick={() => onSelectTab("movimentacao")}>
            <Banknote className="h-4 w-4" />
            Entrou / saiu
          </Button>
          <Button type="button" variant="success" onClick={() => onSelectTab("fechamento")}>
            <ClipboardCheck className="h-4 w-4" />
            Fechar e salvar
          </Button>
          {canViewReports ? (
            <LinkButton href={reportHref} variant="ghost" className="justify-center">
              <ReceiptText className="h-4 w-4" />
              Historico de hoje
            </LinkButton>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function CashPanel({
  activeTab = "vendas",
  register,
  registerSales,
  cashMovements,
  reportHref,
  canViewReports,
  onRefresh,
}: {
  activeTab?: CashTab;
  register: CashRegister | null;
  registerSales: RegisterSale[];
  cashMovements: CashMovement[];
  reportHref: string;
  canViewReports: boolean;
  onRefresh: () => void;
}) {
  const [openState, openAction, opening] = useActionState(openRegisterAction, emptyAction);
  const [closeState, closeAction, closing] = useActionState(closeRegisterAction, emptyAction);
  const [movementState, movementAction, movingCash] = useActionState(
    cashMovementAction,
    emptyAction,
  );
  const [cashAmount, setCashAmount] = useState("");
  const [pixAmount, setPixAmount] = useState("");
  const [terminalRows, setTerminalRows] = useState<TerminalDraft[]>([
    {
      id: "terminal-1",
      terminalName: "Principal",
      creditAmount: "",
      debitAmount: "",
      pixAmount: "",
    },
  ]);

  useEffect(() => {
    if (openState.ok || closeState.ok || movementState.ok) onRefresh();
  }, [closeState.ok, movementState.ok, onRefresh, openState.ok]);

  if (!register) {
    return (
      <Card className="overflow-hidden border-accent/20 bg-panel p-0">
        <div className="grid lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="border-b border-line bg-panel-strong/80 p-5 lg:border-b-0 lg:border-r">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
              <Banknote className="h-6 w-6" />
            </div>
            <p className="mt-6 text-xs font-bold uppercase tracking-[0.12em] text-accent">
              Operacao pausada
            </p>
            <h2 className="mt-2 text-2xl font-black">Caixa fechado</h2>
            <p className="mt-2 max-w-sm text-sm text-muted">
              O caixa anterior ficou salvo. Abra um novo caixa para comecar limpo.
            </p>
            {canViewReports ? (
              <LinkButton href={reportHref} variant="secondary" className="mt-5">
                <ReceiptText className="h-4 w-4" />
                Historico de hoje
              </LinkButton>
            ) : null}
          </div>

          <form action={openAction} className="grid content-end gap-4 p-5 md:grid-cols-[190px_1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="opening_amount">Dinheiro inicial</Label>
              <Input
                id="opening_amount"
                name="opening_amount"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0.00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Observacao</Label>
              <Input id="notes" name="notes" placeholder="Opcional" />
            </div>
            <Button type="submit" size="lg" className="self-end" disabled={opening}>
              {opening ? "Abrindo..." : "Abrir caixa"}
            </Button>
            <div className="md:col-span-3">
              <FormMessage state={openState} />
            </div>
          </form>
        </div>
      </Card>
    );
  }

  const cashSales = salesByPayment(registerSales, "dinheiro");
  const pixSales = salesByPayment(registerSales, "pix");
  const cardSales = salesByPayment(registerSales, "cartao");
  const creditSales = cardSalesByType(registerSales, "credito");
  const debitSales = cardSalesByType(registerSales, "debito");
  const unknownCardSales = cardSalesWithoutType(registerSales);
  const cashIn = movementsByType(cashMovements, "entrada");
  const cashOut = movementsByType(cashMovements, "saida");
  const cashEntered = cashSales + cashIn;
  const expectedCash = Number(register.expected_amount);
  const expectedByFormula = expectedCashTotal({
    opening: Number(register.opening_amount),
    cashSales,
    cashIn,
    cashOut,
  });
  const cashFormulaDifference = expectedCash - expectedByFormula;
  const terminalTotals = terminalRows.reduce(
    (acc, row) => ({
      credit: acc.credit + asNumber(row.creditAmount),
      debit: acc.debit + asNumber(row.debitAmount),
      pix: acc.pix + asNumber(row.pixAmount),
    }),
    { credit: 0, debit: 0, pix: 0 },
  );
  const countedCash = asNumber(cashAmount);
  const countedCredit = terminalTotals.credit;
  const countedDebit = terminalTotals.debit;
  const countedPix = asNumber(pixAmount) + terminalTotals.pix;
  const machineCardTotal = terminalTotals.credit + terminalTotals.debit;
  const registeredCardTotal = creditSales + debitSales + unknownCardSales;
  const cardDifference = machineCardTotal - registeredCardTotal;
  const pixDifference = countedPix - pixSales;
  const totalExpected = expectedCash + cardSales + pixSales;
  const totalCounted = countedCash + countedCredit + countedDebit + countedPix;
  const totalDifference = totalCounted - totalExpected;

  function updateTerminalRow(id: string, field: keyof TerminalDraft, value: string) {
    setTerminalRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  }

  function addTerminalRow() {
    setTerminalRows((current) => [
      ...current,
      {
        id: `terminal-${Date.now()}`,
        terminalName: terminalDefaults[current.length] ?? "",
        creditAmount: "",
        debitAmount: "",
        pixAmount: "",
      },
    ]);
  }

  return (
    <Card className="overflow-hidden border-accent/15 bg-panel p-0">
      {activeTab === "movimentacao" ? (
        <div className="grid gap-4 border-t border-line bg-background/45 p-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid gap-2 md:grid-cols-3 xl:col-span-2">
            <Metric label="Entrou neste caixa" value={cashEntered} tone="good" />
            <Metric label="Saiu neste caixa" value={cashOut} tone="bad" />
            <Metric label="Na gaveta agora" value={expectedCash} />
          </div>

          <form action={movementAction} className="rounded-lg border border-line bg-panel-strong/70 p-4">
            <input type="hidden" name="cash_register_id" value={register.id} />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-panel text-accent">
                <Banknote className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-black">Entrou / saiu dinheiro</h3>
                <p className="text-sm text-muted">Use quando tirar ou colocar dinheiro na gaveta.</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="movement_type">Tipo</Label>
                <Select id="movement_type" name="movement_type" defaultValue="saida">
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saida</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Valor</Label>
                <Input id="amount" name="amount" type="number" min="0.01" step="0.01" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">Motivo</Label>
                <Input id="reason" name="reason" placeholder="Ex: sangria" required />
              </div>
            </div>
            <Button type="submit" variant="secondary" className="mt-4" disabled={movingCash}>
              {movingCash ? "Registrando..." : "Registrar"}
            </Button>
            <FormMessage state={movementState} />
          </form>

          <div className="rounded-lg border border-line bg-panel-strong/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-black">Ultimas movimentacoes</h3>
                <p className="text-sm text-muted">Entradas e saidas registradas no caixa.</p>
              </div>
              <Badge variant="neutral">{quantity(cashMovements.length)}</Badge>
            </div>

            <div className="mt-4 space-y-2">
              {cashMovements.length ? (
                cashMovements.slice(0, 7).map((movement) => (
                  <div
                    key={movement.id}
                    className="rounded-lg border border-line bg-panel p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Badge variant={movement.movement_type === "entrada" ? "success" : "warning"}>
                          {movement.movement_type === "entrada" ? "Entrada" : "Saida"}
                        </Badge>
                        <p className="mt-2 text-sm font-semibold">{movement.reason}</p>
                        <p className="mt-1 text-xs text-muted">{dateTime(movement.created_at)}</p>
                      </div>
                      <strong
                        className={cn(
                          "text-right",
                          movement.movement_type === "entrada" ? "text-green-300" : "text-amber-200",
                        )}
                      >
                        {movement.movement_type === "entrada" ? "+" : "-"}
                        {money(movement.amount)}
                      </strong>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState>Nenhuma movimentacao registrada.</EmptyState>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "fechamento" ? (
        <div className="border-t border-line bg-background/45 p-5">
          <form action={closeAction} className="rounded-lg border border-line bg-panel-strong/70 p-4">
            <input type="hidden" name="cash_register_id" value={register.id} />
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-panel text-accent">
                  <ClipboardCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-black">Fechar e salvar este caixa</h3>
                  <p className="text-sm text-muted">Depois de fechar, o proximo caixa comeca limpo.</p>
                </div>
              </div>
              <Badge variant={Math.abs(totalDifference) > 0.009 ? "warning" : "success"}>
                Diferenca {money(totalDifference)}
              </Badge>
            </div>

            <input type="hidden" name="credit_amount" value={countedCredit.toFixed(2)} />
            <input type="hidden" name="debit_amount" value={countedDebit.toFixed(2)} />
            <input type="hidden" name="pix_amount" value={countedPix.toFixed(2)} />

            <div className="mb-4 grid gap-2 md:grid-cols-4">
              <Metric label="Na gaveta" value={expectedCash} />
              <Metric label="Entrou dinheiro" value={cashEntered} tone="good" />
              <Metric label="Saiu dinheiro" value={cashOut} tone="bad" />
              <Metric label="Formula" value={expectedByFormula} />
            </div>

            {Math.abs(cashFormulaDifference) > 0.009 ? (
              <p className="mb-4 rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-100">
                O valor salvo difere da formula em {money(cashFormulaDifference)}.
              </p>
            ) : null}

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="cash_amount">Dinheiro fisico</Label>
                <Input
                  id="cash_amount"
                  name="cash_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={String(expectedCash)}
                  value={cashAmount}
                  onChange={(event) => setCashAmount(event.target.value)}
                  required
                />
              </div>
              <div className="rounded-lg border border-line bg-panel p-3">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-muted">
                  Cartao pela maquininha
                </p>
                <p className="mt-1 text-lg font-black">{money(machineCardTotal)}</p>
                <p className="mt-1 text-xs text-muted">
                  Preencha credito/debito nas maquininhas abaixo.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pix_amount_visible">PIX separado/app</Label>
                <Input
                  id="pix_amount_visible"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={String(pixSales)}
                  value={pixAmount}
                  onChange={(event) => setPixAmount(event.target.value)}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Maquininhas</Label>
                  <Button type="button" size="sm" variant="ghost" onClick={addTerminalRow}>
                    <Plus className="h-4 w-4" />
                    Adicionar
                  </Button>
                </div>
                <div className="space-y-2">
                  {terminalRows.map((row) => (
                    <div
                      key={row.id}
                    className="grid gap-2 rounded-lg border border-line bg-panel p-2 md:grid-cols-[1.1fr_1fr_1fr_1fr_auto]"
                    >
                      <Input
                        name="terminal_name"
                        value={row.terminalName}
                        onChange={(event) =>
                          updateTerminalRow(row.id, "terminalName", event.target.value)
                        }
                        placeholder="Maquininha"
                      />
                      <Input
                        name="terminal_credit"
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.creditAmount}
                        onChange={(event) =>
                          updateTerminalRow(row.id, "creditAmount", event.target.value)
                        }
                        placeholder="Credito"
                      />
                      <Input
                        name="terminal_debit"
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.debitAmount}
                        onChange={(event) =>
                          updateTerminalRow(row.id, "debitAmount", event.target.value)
                        }
                        placeholder="Debito"
                      />
                      <Input
                        name="terminal_pix"
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.pixAmount}
                        onChange={(event) =>
                          updateTerminalRow(row.id, "pixAmount", event.target.value)
                        }
                        placeholder="PIX"
                      />
                      <button
                        type="button"
                        aria-label="Remover maquininha"
                        className="flex h-12 w-12 items-center justify-center rounded-lg text-rose-200 transition hover:bg-rose-400/10 disabled:opacity-30"
                        disabled={terminalRows.length === 1}
                        onClick={() =>
                          setTerminalRows((current) => current.filter((item) => item.id !== row.id))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-line bg-panel p-3">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <Calculator className="h-4 w-4 text-accent" />
                  Conferencia
                </div>
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">Esperado</span>
                    <strong>{money(totalExpected)}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">Informado</span>
                    <strong>{money(totalCounted)}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">Diferenca</span>
                    <strong className={cn(Math.abs(totalDifference) > 0.009 && "text-amber-200")}>
                      {money(totalDifference)}
                    </strong>
                  </div>
                  <div className="border-t border-line pt-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted">Cartao maq.</span>
                      <strong>{money(machineCardTotal)}</strong>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-muted">PIX total</span>
                      <strong>
                        {money(countedPix)}
                      </strong>
                    </div>
                    <p
                      className={cn(
                        "mt-2 text-xs text-muted",
                        Math.abs(cardDifference) > 0.009 && "text-amber-200",
                      )}
                    >
                      {money(cardDifference)} contra cartoes registrados.
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-xs text-muted",
                        Math.abs(pixDifference) > 0.009 && "text-amber-200",
                      )}
                    >
                      {money(pixDifference)} contra PIX registrado.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label htmlFor="close_notes">Observacoes</Label>
                <Textarea
                  id="close_notes"
                  name="notes"
                  placeholder="Divergencias, comprovantes, sangrias..."
                />
              </div>
              <Button type="submit" variant="secondary" className="self-end" disabled={closing}>
                {closing ? "Salvando..." : "Fechar e salvar"}
              </Button>
            </div>
            <FormMessage state={closeState} />
          </form>
        </div>
      ) : null}

    </Card>
  );
}

export function PosTerminal({
  userId,
  products,
  openRegister,
  registerSales,
  registerSaleItems,
  cashMovements,
  reportHref,
  canViewReports,
}: {
  userId: string;
  products: Product[];
  openRegister: CashRegister | null;
  registerSales: RegisterSale[];
  registerSaleItems: RegisterSaleItem[];
  cashMovements: CashMovement[];
  reportHref: string;
  canViewReports: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { showToast } = useToast();
  const [liveProducts, setLiveProducts] = useState<Product[]>(products.map(normalizeProduct));
  const [liveRegister, setLiveRegister] = useState<CashRegister | null>(openRegister);
  const [liveSales, setLiveSales] = useState<RegisterSale[]>(registerSales.map(normalizeSale));
  const [liveSaleItems, setLiveSaleItems] = useState<RegisterSaleItem[]>(registerSaleItems);
  const [liveMovements, setLiveMovements] = useState<CashMovement[]>(cashMovements);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [category, setCategory] = useState("Todos");
  const [subcategory, setSubcategory] = useState("Todas");
  const [search, setSearch] = useState("");
  const [cashTab, setCashTab] = useState<CashTab>("vendas");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [cardType, setCardType] = useState<CardType>("credito");
  const [cardMachine, setCardMachine] = useState("Principal");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const liveRegisterIdRef = useRef(openRegister?.id);

  const setCurrentRegister = useCallback((nextRegister: CashRegister | null) => {
    const nextRegisterId = nextRegister?.id;

    if (liveRegisterIdRef.current !== nextRegisterId) {
      liveRegisterIdRef.current = nextRegisterId;
      setCashTab("vendas");
      setCart([]);
    }

    setLiveRegister(nextRegister);
  }, []);

  const fetchProducts = useCallback(async () => {
    const columns = "id,name,category,quantity,cost_price,sale_price,min_stock,max_stock,track_stock,active,updated_at";
    const fallbackColumns = "id,name,category,quantity,cost_price,sale_price,min_stock,active,updated_at";
    const result = await supabase
      .from("products")
      .select(columns)
      .eq("active", true)
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (!result.error) {
      setLiveProducts(((result.data ?? []) as unknown as Product[]).map(normalizeProduct));
      return;
    }

    const fallback = await supabase
      .from("products")
      .select(fallbackColumns)
      .eq("active", true)
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    setLiveProducts(((fallback.data ?? []) as unknown as Product[]).map(normalizeProduct));
  }, [supabase]);

  const fetchOpenRegister = useCallback(async () => {
    const { data } = await supabase
      .from("cash_registers")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "open")
      .maybeSingle<CashRegister>();

    setCurrentRegister((data as unknown as CashRegister | null) ?? null);
  }, [setCurrentRegister, supabase, userId]);

  const fetchRegisterData = useCallback(async (cashRegisterId: string) => {
    const salesResult = await supabase
      .from("sales")
      .select("id,total_amount,payment_method,status,created_at,card_type,card_machine,preparation_status")
      .eq("cash_register_id", cashRegisterId)
      .order("created_at", { ascending: false });

    let sales = ((salesResult.data ?? []) as unknown as RegisterSale[]).map(normalizeSale);

    if (salesResult.error) {
      const fallback = await supabase
        .from("sales")
        .select("id,total_amount,payment_method,status,created_at")
        .eq("cash_register_id", cashRegisterId)
        .order("created_at", { ascending: false });

      sales = ((fallback.data ?? []) as unknown as RegisterSale[]).map(normalizeSale);
    }

    const [itemsResult, movementsResult] = await Promise.all([
      sales.length
        ? supabase
            .from("sale_items")
            .select("id,sale_id,product_name_snapshot,quantity")
            .in("sale_id", sales.map((sale) => sale.id))
        : Promise.resolve({ data: [] }),
      supabase
        .from("cash_movements")
        .select("id,cash_register_id,user_id,movement_type,amount,reason,created_at")
        .eq("cash_register_id", cashRegisterId)
        .order("created_at", { ascending: false }),
    ]);

    setLiveSales(sales);
    setLiveSaleItems((itemsResult.data ?? []) as unknown as RegisterSaleItem[]);
    setLiveMovements((movementsResult.data ?? []) as unknown as CashMovement[]);
  }, [supabase]);

  const liveRegisterId = liveRegister?.id;
  const activeCashTab = liveRegister ? cashTab : "vendas";

  const refreshLiveData = useCallback(() => {
    void fetchOpenRegister();
    void fetchProducts();
    if (liveRegisterId) void fetchRegisterData(liveRegisterId);
  }, [fetchOpenRegister, fetchProducts, fetchRegisterData, liveRegisterId]);

  useEffect(() => {
    const channel = supabase
      .channel(`pos-live-${userId}-${liveRegisterId ?? "closed"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => void fetchProducts(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cash_registers",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void fetchOpenRegister();
          if (liveRegisterId) void fetchRegisterData(liveRegisterId);
        },
      );

    if (liveRegisterId) {
      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "sales",
            filter: `cash_register_id=eq.${liveRegisterId}`,
          },
          () => void fetchRegisterData(liveRegisterId),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "cash_movements",
            filter: `cash_register_id=eq.${liveRegisterId}`,
          },
          () => void fetchRegisterData(liveRegisterId),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "sale_items" },
          () => void fetchRegisterData(liveRegisterId),
        );
    }

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [
    fetchOpenRegister,
    fetchProducts,
    fetchRegisterData,
    liveRegisterId,
    supabase,
    userId,
  ]);

  const salesCountByProduct = useMemo(() => {
    return liveSaleItems.reduce<Record<string, number>>((acc, item) => {
      const name = item.product_name_snapshot.trim();
      if (!name) return acc;
      acc[name] = (acc[name] ?? 0) + Number(item.quantity ?? 0);
      return acc;
    }, {});
  }, [liveSaleItems]);

  const bestSellerNames = useMemo(() => {
    return new Set(
      Object.entries(salesCountByProduct)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 12)
        .map(([name]) => name),
    );
  }, [salesCountByProduct]);

  const categories = useMemo(() => {
    const counts = liveProducts.reduce<Record<string, number>>((acc, product) => {
      const name = productCategoryParts(product.category).category;
      acc[name] = (acc[name] ?? 0) + 1;
      return acc;
    }, {});
    const mainCategories = Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => ({ name, count }));

    return [
      { name: "Todos", count: liveProducts.length },
      ...(bestSellerNames.size ? [{ name: "Mais vendidos", count: bestSellerNames.size }] : []),
      ...mainCategories,
    ];
  }, [bestSellerNames.size, liveProducts]);

  const activeCategory = categories.some((item) => item.name === category) ? category : "Todos";

  const subcategories = useMemo(() => {
    if (activeCategory === "Todos" || activeCategory === "Mais vendidos") return ["Todas"];

    return [
      "Todas",
      ...Array.from(
        new Set(
          liveProducts
            .filter((product) => productCategoryParts(product.category).category === activeCategory)
            .map((product) => productCategoryParts(product.category).subcategory),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    ];
  }, [activeCategory, liveProducts]);

  const activeSubcategory = subcategories.includes(subcategory) ? subcategory : "Todas";

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = liveProducts.filter((product) => {
      const parts = productCategoryParts(product.category);
      const sameCategory =
        activeCategory === "Todos"
        || (activeCategory === "Mais vendidos" && bestSellerNames.has(product.name))
        || product.category === activeCategory
        || parts.category === activeCategory;
      const sameSubcategory =
        activeSubcategory === "Todas" || parts.subcategory === activeSubcategory;
      const matchesSearch = !term
        || product.name.toLowerCase().includes(term)
        || product.category.toLowerCase().includes(term)
        || parts.category.toLowerCase().includes(term)
        || parts.subcategory.toLowerCase().includes(term);
      return sameCategory && sameSubcategory && matchesSearch;
    });

    if (activeCategory !== "Mais vendidos") return filtered;

    return filtered.sort(
      (a, b) => (salesCountByProduct[b.name] ?? 0) - (salesCountByProduct[a.name] ?? 0),
    );
  }, [
    activeCategory,
    activeSubcategory,
    bestSellerNames,
    liveProducts,
    salesCountByProduct,
    search,
  ]);

  const productSections = useMemo(() => {
    return visibleProducts.reduce<Record<string, Product[]>>((acc, product) => {
      const parts = productCategoryParts(product.category);
      const key =
        activeCategory === "Todos"
          ? parts.category
          : activeCategory === "Mais vendidos"
            ? "Mais vendidos"
            : parts.subcategory;
      acc[key] ??= [];
      acc[key].push(product);
      return acc;
    }, {});
  }, [activeCategory, visibleProducts]);

  const productSectionEntries = Object.entries(productSections).sort(([a], [b]) => {
    if (a === "Mais vendidos") return -1;
    if (b === "Mais vendidos") return 1;
    return a.localeCompare(b);
  });

  const total = cart.reduce(
    (sum, item) => sum + Number(item.product.sale_price) * item.quantity,
    0,
  );
  const cartQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  const completedSalesCount = liveSales.filter((sale) => sale.status === "completed").length;

  function addProduct(product: Product) {
    const tracksStock = productTracksStock(product);

    if (!liveRegister || (tracksStock && product.quantity <= 0)) return;
    setMessage(null);
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      const currentQty = existing?.quantity ?? 0;
      if (tracksStock && currentQty + 1 > Number(product.quantity)) return current;

      if (existing) {
        return current.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }

      return [...current, { product, quantity: 1 }];
    });
  }

  function decrement(productId: string) {
    setCart((current) =>
      current
        .map((item) =>
          item.product.id === productId ? { ...item, quantity: item.quantity - 1 } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function finalizeSale() {
    if (!liveRegister) {
      setMessage("Abra o caixa antes de vender.");
      showToast({
        title: "Caixa fechado",
        message: "Abra o caixa antes de iniciar a venda.",
        tone: "danger",
      });
      return;
    }

    startTransition(async () => {
      const result = await finalizeSaleAction({
        cashRegisterId: liveRegister.id,
        paymentMethod,
        cardType: paymentMethod === "cartao" ? cardType : null,
        cardMachine: paymentMethod === "cartao" ? cardMachine : null,
        items: cart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
        })),
      });

      setMessage(result.message ?? null);
      showToast({
        title: result.ok ? "Venda finalizada" : "Venda nao concluida",
        message: result.message,
        tone: result.ok ? "success" : "danger",
      });

      if (result.ok) {
        setCart([]);
        void fetchProducts();
        void fetchRegisterData(liveRegister.id);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      {liveRegister ? (
        <>
          <CashRegisterSummary
            register={liveRegister}
            registerSales={liveSales}
            cashMovements={liveMovements}
            reportHref={reportHref}
            canViewReports={canViewReports}
            onSelectTab={setCashTab}
          />
          <CashSubTabs
            activeTab={activeCashTab}
            onChange={setCashTab}
            cartQuantity={cartQuantity}
            salesCount={completedSalesCount}
          />
        </>
      ) : null}

      {!liveRegister || activeCashTab !== "vendas" ? (
        <CashPanel
          activeTab={activeCashTab}
          register={liveRegister}
          registerSales={liveSales}
          cashMovements={liveMovements}
          reportHref={reportHref}
          canViewReports={canViewReports}
          onRefresh={refreshLiveData}
        />
      ) : null}

      {activeCashTab === "vendas" ? (
        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_430px]">
        <section className="min-w-0 space-y-3">
          {!liveRegister ? (
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
              <p className="font-black">Caixa fechado</p>
              <p className="mt-1 text-sm">
                Abra o caixa acima para liberar os produtos e iniciar as vendas.
              </p>
            </div>
          ) : null}
          <div className="sticky top-[68px] z-10 rounded-lg border border-line bg-background/95 p-3 shadow-[0_14px_36px_rgba(0,0,0,0.24)] backdrop-blur-xl lg:top-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-panel text-accent">
                  <Layers3 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black">Produtos</h2>
                  <p className="text-sm text-muted">
                    {visibleProducts.length} exibido(s) de {liveProducts.length}
                  </p>
                </div>
              </div>
              <Badge variant="info">{activeCategory}</Badge>
            </div>

            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar produto"
                className="pl-10"
              />
            </div>

            <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
              <CategoryRail
                key={activeCategory}
                categories={categories}
                activeCategory={activeCategory}
                onSelect={(item) => {
                  setCategory(item);
                  setSubcategory("Todas");
                }}
              />
              <Select
                aria-label="Todas as categorias"
                value={activeCategory}
                onChange={(event) => {
                  setCategory(event.target.value);
                  setSubcategory("Todas");
                }}
              >
                {categories.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name} ({item.count})
                  </option>
                ))}
              </Select>
            </div>

            {subcategories.length > 1 ? (
              <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
                {subcategories.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setSubcategory(item)}
                    className={cn(
                      "min-h-9 shrink-0 rounded-lg border px-3 text-sm font-semibold transition",
                      activeSubcategory === item
                        ? "border-green-400/40 bg-green-400/15 text-green-200"
                        : "border-line bg-panel-strong/90 text-slate-300 hover:bg-white/6",
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {productSectionEntries.length ? (
            <div className="space-y-4">
              {productSectionEntries.map(([section, rows]) => (
                <section key={section} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-black">{section}</h3>
                    <Badge variant="neutral">{rows.length} item(ns)</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
                    {rows.map((product) => {
                      const parts = productCategoryParts(product.category);
                      const tracksStock = productTracksStock(product);
                      const disabled = !liveRegister || (tracksStock && Number(product.quantity) <= 0);
                      const detailLabel =
                        parts.subcategory !== "Geral" ? parts.subcategory : parts.category;

                      return (
                        <button
                          key={product.id}
                          disabled={disabled}
                          onClick={() => addProduct(product)}
                          className={cn(
                            "group flex min-h-[136px] flex-col justify-between rounded-lg border p-3 text-left transition duration-200 active:scale-[0.98]",
                            disabled
                              ? "border-line bg-panel/60 opacity-45"
                              : "border-line bg-panel hover:border-accent/45 hover:bg-panel-strong hover:shadow-[0_14px_34px_rgba(0,0,0,0.18)]",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-base font-black leading-tight">
                                {product.name}
                              </p>
                              <p className="mt-2 text-xs font-semibold text-muted">
                                {parts.category}
                              </p>
                            </div>
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-background/55 text-accent transition group-hover:border-accent/40 group-hover:bg-accent/10">
                              <Plus className="h-4 w-4" />
                            </span>
                          </div>
                          <div className="mt-4 flex items-end justify-between gap-2">
                            <p className="text-2xl font-black leading-none text-accent">
                              {money(product.sale_price)}
                            </p>
                            <p className="rounded-md border border-line bg-background/45 px-2 py-1 text-xs text-muted">
                              {detailLabel}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <EmptyState>Nenhum produto encontrado.</EmptyState>
          )}
        </section>

        <aside className="2xl:sticky 2xl:top-4 2xl:self-start">
          <Card className="overflow-hidden border-accent/25 bg-panel p-0">
            <div className="border-b border-line bg-panel-strong/75 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-accent/25 bg-accent/10 text-accent">
                    <ReceiptText className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black">Venda atual</h2>
                    <p className="text-sm text-muted">
                      {quantity(cartQuantity)} un. em {cart.length} item(ns)
                    </p>
                  </div>
                </div>
                <p className="text-right text-3xl font-black leading-none text-accent">
                  {money(total)}
                </p>
              </div>
            </div>

            <div className="max-h-[48vh] overflow-y-auto p-4">
              {cart.length === 0 ? (
                <EmptyState>Toque nos produtos para vender.</EmptyState>
              ) : (
                <div className="space-y-2">
                  <AnimatePresence initial={false}>
                    {cart.map((item) => (
                      <motion.div
                        key={item.product.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 24 }}
                        className="rounded-lg border border-line bg-panel-strong p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="line-clamp-2 font-bold leading-tight">
                              {item.product.name}
                            </p>
                            <p className="mt-1 text-sm text-muted">
                              {money(item.product.sale_price)}
                            </p>
                          </div>
                          <button
                            aria-label="Remover item"
                            onClick={() =>
                              setCart((current) =>
                                current.filter((cartItem) => cartItem.product.id !== item.product.id),
                              )
                            }
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-200 transition hover:bg-red-400/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="flex items-center rounded-lg border border-line bg-panel">
                            <button
                              aria-label="Diminuir"
                              onClick={() => decrement(item.product.id)}
                              className="flex h-11 w-12 items-center justify-center transition hover:bg-white/5"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="min-w-11 text-center font-bold">
                              {quantity(item.quantity)}
                            </span>
                            <button
                              aria-label="Aumentar"
                              onClick={() => addProduct(item.product)}
                              className="flex h-11 w-12 items-center justify-center transition hover:bg-white/5"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                          <p className="text-right font-black">
                            {money(item.quantity * Number(item.product.sale_price))}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            <div className="border-t border-line p-4">
              <Label>Pagamento</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {paymentOptions.map((option) => {
                  const active = paymentMethod === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPaymentMethod(option.value)}
                      className={cn(
                        "min-h-[54px] rounded-lg border text-sm font-bold transition",
                        active
                          ? "border-accent bg-accent text-white"
                          : "border-line bg-panel-strong text-slate-300 hover:bg-white/6",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {paymentMethod === "cartao" ? (
              <div className="mx-4 rounded-lg border border-line bg-panel-strong p-3">
                <div className="grid grid-cols-2 gap-2">
                  {(["credito", "debito"] as CardType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setCardType(type)}
                      className={cn(
                        "flex min-h-11 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition",
                        cardType === type
                          ? "border-green-400/40 bg-green-400/15 text-green-200"
                          : "border-line bg-panel text-slate-300 hover:bg-white/6",
                      )}
                    >
                      <CreditCard className="h-4 w-4" />
                      {type === "credito" ? "Credito" : "Debito"}
                    </button>
                  ))}
                </div>
                <div className="mt-3 space-y-2">
                  <Label htmlFor="card_machine">Maquininha</Label>
                  <Select
                    id="card_machine"
                    value={cardMachine}
                    onChange={(event) => setCardMachine(event.target.value)}
                  >
                    {terminalDefaults.map((terminal) => (
                      <option key={terminal} value={terminal}>
                        {terminal}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            ) : null}

            <Button
              type="button"
              size="xl"
              disabled={!liveRegister || cart.length === 0 || isPending}
              onClick={finalizeSale}
              className="mx-4 my-4 w-[calc(100%-2rem)]"
            >
              {isPending ? (
                <>
                  <Clock3 className="h-5 w-5" />
                  Finalizando...
                </>
              ) : (
                <>
                  <PackageCheck className="h-5 w-5" />
                  Finalizar venda
                </>
              )}
            </Button>

            {message ? (
              <p className="mx-4 mb-4 rounded-lg border border-line bg-panel-strong p-3 text-sm">
                {message}
              </p>
            ) : null}
          </Card>
        </aside>
      </div>
      ) : null}
    </div>
  );
}
