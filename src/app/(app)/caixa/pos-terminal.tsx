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
  ArrowDownToLine,
  ArrowUpFromLine,
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
  cashFlowSummary,
  expectedCashTotal,
  mergeSalePaymentDetails,
  movementsByType,
  salesByPayment,
  totalSales,
  type SalePaymentAudit,
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

type TerminalDraft = {
  id: string;
  terminalName: string;
  creditAmount: string;
  debitAmount: string;
  pixAmount: string;
};

type CashMovementAuditRow = {
  id: string;
  user_id: string | null;
  metadata: {
    cash_register_id?: string;
    movement_type?: string;
    amount?: number | string;
    reason?: string;
  } | null;
  created_at: string;
};

type CashTab = "vendas" | "movimentacao" | "fechamento";

const cashTabs: Array<{
  value: CashTab;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { value: "vendas", label: "1. Vender", description: "Produtos e carrinho", icon: Layers3 },
  {
    value: "movimentacao",
    label: "2. Movimentar gaveta",
    description: "Entrada ou retirada manual",
    icon: Banknote,
  },
  { value: "fechamento", label: "3. Fechar", description: "Confere e salva", icon: ClipboardCheck },
];

const emptyAction: ActionResult = { ok: false };
const terminalDefaults = ["Principal", "Cielo", "Stone", "Mercado Pago"];

const paymentOptions: Array<{ value: PaymentMethod; label: string }> = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cartao", label: "Cartao" },
];

const movementReasons = {
  entrada: ["Reforco de troco", "Devolucao recebida", "Outro recebimento"],
  saida: ["Pagamento do motoboy", "Compra de insumos", "Sangria", "Retirada"],
} as const;

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
  const soldTotal = totalSales(registerSales);
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
            Gaveta fisica
          </p>
          <h2 className="mt-1 text-sm font-semibold text-muted">Dinheiro disponivel agora</h2>
          <p className="mt-1 text-4xl font-black leading-none text-white">{money(drawerNow)}</p>
          <p className="mt-3 text-sm text-muted">
            Este valor e somente o dinheiro deste caixa, aberto em {dateTime(register.opened_at)}.
          </p>
        </div>

        <div className="p-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-accent/25 bg-accent/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-accent">
                    Movimento da gaveta
                  </p>
                  <p className="mt-1 text-sm text-muted">Somente dinheiro fisico</p>
                </div>
                <Badge variant="neutral">Gaveta</Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <p className="text-muted">Abertura</p>
                  <strong>{money(opening)}</strong>
                </div>
                <div>
                  <p className="text-muted">Vendas em dinheiro</p>
                  <strong className="text-green-300">+ {money(cashSales)}</strong>
                </div>
                <div>
                  <p className="text-muted">Outras entradas em dinheiro</p>
                  <strong className="text-green-300">+ {money(cashIn)}</strong>
                </div>
                <div>
                  <p className="text-muted">Pagamentos e saidas</p>
                  <strong className="text-rose-200">- {money(cashOut)}</strong>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-accent/20 pt-3">
                <span className="text-sm font-bold">Saldo esperado</span>
                <strong className="text-xl text-white">{money(drawerNow)}</strong>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-panel-strong p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-300">
                    Vendas deste caixa
                  </p>
                  <p className="mt-1 text-2xl font-black">{money(soldTotal)}</p>
                </div>
                <Badge variant="neutral">{quantity(completed.length)} venda(s)</Badge>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-line bg-background/40 p-2">
                  <p className="text-xs text-muted">Dinheiro</p>
                  <strong className="mt-1 block text-sm">{money(cashSales)}</strong>
                  <span className="mt-1 block text-[0.68rem] text-green-300">Entra na gaveta</span>
                </div>
                <div className="rounded-lg border border-line bg-background/40 p-2">
                  <p className="text-xs text-muted">PIX</p>
                  <strong className="mt-1 block text-sm">{money(pixSales)}</strong>
                  <span className="mt-1 block text-[0.68rem] text-slate-400">Fora da gaveta</span>
                </div>
                <div className="rounded-lg border border-line bg-background/40 p-2">
                  <p className="text-xs text-muted">Cartao</p>
                  <strong className="mt-1 block text-sm">{money(cardSales)}</strong>
                  <span className="mt-1 block text-[0.68rem] text-slate-400">Fora da gaveta</span>
                </div>
              </div>
              <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
                PIX e cartao contam nas vendas, mas nao alteram o dinheiro fisico.
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-background/45 p-3 text-sm">
            <strong>Conta da gaveta:</strong>
            <span className="text-muted">{money(opening)} abertura</span>
            <span className="text-green-300">+ {money(cashSales)} vendas em dinheiro</span>
            <span className="text-green-300">+ {money(cashIn)} outras entradas</span>
            <span className="text-rose-200">- {money(cashOut)} pagamentos/saidas</span>
            <strong>= {money(drawerNow)}</strong>
            {Math.abs(formulaDifference) > 0.009 ? (
              <span className="text-amber-200">Conferir {money(formulaDifference)}</span>
            ) : null}
          </div>
        </div>

        <div className="grid content-center gap-2 border-t border-line bg-background/35 p-4 xl:border-l xl:border-t-0">
          <Button type="button" variant="secondary" onClick={() => onSelectTab("movimentacao")}>
            <Banknote className="h-4 w-4" />
            Movimentar gaveta
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
  const [movementType, setMovementType] = useState<"entrada" | "saida">("saida");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
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
  const expectedCash = Number(register.expected_amount);
  const cashFlow = cashFlowSummary({
    opening: Number(register.opening_amount),
    cashSales,
    cashIn,
    cashOut,
  });
  const movementValue = asNumber(movementAmount);
  const projectedCash =
    expectedCash + (movementType === "entrada" ? movementValue : -movementValue);
  const movementIsInvalid =
    movementValue <= 0 || (movementType === "saida" && projectedCash < 0);
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
  const cashDifference = countedCash - expectedCash;
  const hasCashCount = cashAmount.trim() !== "";
  const hasCardCount =
    registeredCardTotal <= 0.009 ||
    terminalRows.some(
      (row) => row.creditAmount.trim() !== "" || row.debitAmount.trim() !== "",
    );
  const hasPixCount =
    pixSales <= 0.009 ||
    pixAmount.trim() !== "" ||
    terminalRows.some((row) => row.pixAmount.trim() !== "");
  const allClosingValuesEntered = hasCashCount && hasCardCount && hasPixCount;
  const totalDifference = cashDifference + cardDifference + pixDifference;
  const cashEnteredToday = cashFlow.totalCashIn;

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
          <div className="grid gap-3 xl:col-span-2 xl:grid-cols-[1.25fr_1fr]">
            <div className="rounded-xl border border-accent/25 bg-accent/5 p-5">
              <p className="text-xs font-black uppercase tracking-[0.1em] text-accent">
                Dinheiro fisico da gaveta
              </p>
              <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm text-muted">Saldo disponivel agora</p>
                  <p className="mt-1 text-4xl font-black text-white">{money(expectedCash)}</p>
                </div>
                <p className="max-w-xs text-sm text-slate-300">
                  Entrada e retirada manual nao mudam o valor das vendas.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-green-400/20 bg-green-400/10 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-green-200">
                  Outras entradas
                </p>
                <p className="mt-2 text-2xl font-black text-green-200">{money(cashIn)}</p>
                <p className="mt-1 text-xs text-muted">Dinheiro colocado manualmente</p>
              </div>
              <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-rose-100">
                  Pagamentos e saidas
                </p>
                <p className="mt-2 text-2xl font-black text-rose-100">{money(cashOut)}</p>
                <p className="mt-1 text-xs text-muted">Motoboy, compras, sangria ou retirada</p>
              </div>
            </div>
          </div>

          <form action={movementAction} className="rounded-xl border border-line bg-panel-strong/70 p-5">
            <input type="hidden" name="cash_register_id" value={register.id} />
            <input type="hidden" name="movement_type" value={movementType} />

            <div>
              <p className="text-xs font-black uppercase tracking-[0.1em] text-muted">
                1. O que aconteceu?
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  aria-pressed={movementType === "entrada"}
                  onClick={() => setMovementType("entrada")}
                  className={cn(
                    "flex min-h-24 items-center gap-4 rounded-xl border p-4 text-left transition",
                    movementType === "entrada"
                      ? "border-green-400 bg-green-400/15 shadow-[0_12px_30px_rgba(74,222,128,0.1)]"
                      : "border-line bg-panel hover:border-green-400/40",
                  )}
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-green-400/15 text-green-300">
                    <ArrowDownToLine className="h-6 w-6" />
                  </span>
                  <span>
                    <strong className="block text-base text-green-200">Colocar dinheiro</strong>
                    <span className="mt-1 block text-xs text-muted">
                      Reforco de troco ou outra entrada
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  aria-pressed={movementType === "saida"}
                  onClick={() => setMovementType("saida")}
                  className={cn(
                    "flex min-h-24 items-center gap-4 rounded-xl border p-4 text-left transition",
                    movementType === "saida"
                      ? "border-rose-400 bg-rose-400/15 shadow-[0_12px_30px_rgba(251,113,133,0.1)]"
                      : "border-line bg-panel hover:border-rose-400/40",
                  )}
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-400/15 text-rose-200">
                    <ArrowUpFromLine className="h-6 w-6" />
                  </span>
                  <span>
                    <strong className="block text-base text-rose-100">Retirar dinheiro</strong>
                    <span className="mt-1 block text-xs text-muted">
                      Motoboy, compra, sangria ou retirada
                    </span>
                  </span>
                </button>
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs font-black uppercase tracking-[0.1em] text-muted">
                2. Informe os dados
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="amount">Valor em dinheiro</Label>
                  <Input
                    id="amount"
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="R$ 0,00"
                    value={movementAmount}
                    onChange={(event) => setMovementAmount(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">Motivo da movimentacao</Label>
                  <Input
                    id="reason"
                    name="reason"
                    placeholder={
                      movementType === "entrada"
                        ? "Ex: reforco de troco"
                        : "Ex: pagamento do motoboy"
                    }
                    value={movementReason}
                    onChange={(event) => setMovementReason(event.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-xs font-semibold text-muted">Motivos rapidos</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {movementReasons[movementType].map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setMovementReason(reason)}
                      className={cn(
                        "min-h-9 rounded-lg border px-3 text-xs font-semibold transition",
                        movementReason === reason
                          ? movementType === "entrada"
                            ? "border-green-400 bg-green-400/15 text-green-200"
                            : "border-rose-400 bg-rose-400/15 text-rose-100"
                          : "border-line bg-panel text-muted hover:border-accent/40 hover:text-white",
                      )}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div
              className={cn(
                "mt-5 rounded-xl border p-4",
                movementType === "entrada"
                  ? "border-green-400/25 bg-green-400/8"
                  : "border-rose-400/25 bg-rose-400/8",
              )}
            >
              <p className="text-xs font-black uppercase tracking-[0.1em] text-muted">
                3. Confira o resultado
              </p>
              <div className="mt-3 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 text-center">
                <div>
                  <p className="text-xs text-muted">Saldo atual</p>
                  <strong className="mt-1 block">{money(expectedCash)}</strong>
                </div>
                <span className="text-lg text-muted">
                  {movementType === "entrada" ? "+" : "-"}
                </span>
                <div>
                  <p className="text-xs text-muted">
                    {movementType === "entrada" ? "Entrada" : "Retirada"}
                  </p>
                  <strong
                    className={cn(
                      "mt-1 block",
                      movementType === "entrada" ? "text-green-300" : "text-rose-200",
                    )}
                  >
                    {money(movementValue)}
                  </strong>
                </div>
                <span className="text-lg text-muted">=</span>
                <div>
                  <p className="text-xs text-muted">Novo saldo</p>
                  <strong
                    className={cn(
                      "mt-1 block text-lg",
                      projectedCash < 0 ? "text-rose-200" : "text-white",
                    )}
                  >
                    {money(projectedCash)}
                  </strong>
                </div>
              </div>
              {projectedCash < 0 ? (
                <p className="mt-3 text-center text-sm font-semibold text-rose-200">
                  A retirada e maior que o saldo disponivel na gaveta.
                </p>
              ) : null}
            </div>

            <Button
              type="submit"
              variant={movementType === "entrada" ? "success" : "danger"}
              size="lg"
              className="mt-4 w-full"
              disabled={movingCash || movementIsInvalid || !movementReason.trim()}
            >
              {movementType === "entrada" ? (
                <ArrowDownToLine className="h-5 w-5" />
              ) : (
                <ArrowUpFromLine className="h-5 w-5" />
              )}
              {movingCash
                ? "Registrando..."
                : movementType === "entrada"
                  ? `Confirmar entrada de ${money(movementValue)}`
                  : `Confirmar retirada de ${money(movementValue)}`}
            </Button>
            <FormMessage state={movementState} />
          </form>

          <div className="rounded-lg border border-line bg-panel-strong/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-black">Ultimas movimentacoes</h3>
                <p className="text-sm text-muted">Historico manual deste caixa aberto.</p>
              </div>
              <Badge variant="neutral">{quantity(cashMovements.length)}</Badge>
            </div>

            <div className="mt-4 space-y-2">
              {cashMovements.length ? (
                cashMovements.slice(0, 7).map((movement) => (
                  <div
                    key={movement.id}
                    className={cn(
                      "rounded-xl border p-3",
                      movement.movement_type === "entrada"
                        ? "border-green-400/20 bg-green-400/5"
                        : "border-rose-400/20 bg-rose-400/5",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Badge variant={movement.movement_type === "entrada" ? "success" : "warning"}>
                          {movement.movement_type === "entrada"
                            ? "Entrada na gaveta"
                            : "Saida da gaveta"}
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
              {allClosingValuesEntered ? (
                <Badge variant={Math.abs(totalDifference) > 0.009 ? "warning" : "success"}>
                  Diferenca geral {money(totalDifference)}
                </Badge>
              ) : (
                <Badge variant="neutral">Aguardando conferencia</Badge>
              )}
            </div>

            <input type="hidden" name="credit_amount" value={countedCredit.toFixed(2)} />
            <input type="hidden" name="debit_amount" value={countedDebit.toFixed(2)} />
            <input type="hidden" name="pix_amount" value={countedPix.toFixed(2)} />

            <div className="mb-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-xl border border-accent/25 bg-accent/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.1em] text-accent">
                      Como a gaveta chegou neste valor
                    </p>
                    <p className="mt-1 text-sm text-muted">Somente dinheiro fisico</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted">Deve ter na gaveta</p>
                    <p className="mt-1 text-2xl font-black text-white">{money(expectedCash)}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 rounded-lg border border-line bg-background/40 p-3 sm:grid-cols-2 xl:grid-cols-5">
                  <div>
                    <p className="text-xs text-muted">Saldo inicial</p>
                    <strong className="mt-1 block">{money(Number(register.opening_amount))}</strong>
                    <span className="mt-1 block text-[0.68rem] text-slate-400">
                      Ja estava no caixa
                    </span>
                  </div>
                  <div className="rounded-lg bg-green-400/5 p-2">
                    <p className="text-xs text-muted">+ Vendas em dinheiro</p>
                    <strong className="mt-1 block text-green-300">{money(cashFlow.cashSales)}</strong>
                    <span className="mt-1 block text-[0.68rem] text-slate-400">
                      Recebido dos clientes
                    </span>
                  </div>
                  <div className="rounded-lg bg-green-400/5 p-2">
                    <p className="text-xs text-muted">+ Outras entradas</p>
                    <strong className="mt-1 block text-green-300">
                      {money(cashFlow.otherCashIn)}
                    </strong>
                    <span className="mt-1 block text-[0.68rem] text-slate-400">
                      Dinheiro colocado
                    </span>
                  </div>
                  <div className="rounded-lg bg-rose-400/5 p-2">
                    <p className="text-xs text-muted">- Pagamentos e saidas</p>
                    <strong className="mt-1 block text-rose-200">{money(cashFlow.cashOut)}</strong>
                    <span className="mt-1 block text-[0.68rem] text-slate-400">
                      Motoboy, compras e retiradas
                    </span>
                  </div>
                  <div className="rounded-lg border border-accent/20 bg-accent/5 p-2">
                    <p className="text-xs text-muted">= Total na gaveta</p>
                    <strong className="mt-1 block text-lg text-white">{money(expectedCash)}</strong>
                    <span className="mt-1 block text-[0.68rem] text-slate-400">
                      Dinheiro esperado agora
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-lg border border-green-400/15 bg-green-400/5 p-2">
                    <p className="text-xs text-muted">Total que entrou hoje</p>
                    <strong className="mt-1 block text-green-300">
                      + {money(cashEnteredToday)}
                    </strong>
                  </div>
                  <div className="rounded-lg border border-green-400/15 bg-green-400/5 p-2">
                    <p className="text-xs text-muted">Dessas, vendas em dinheiro</p>
                    <strong className="mt-1 block text-green-300">{money(cashSales)}</strong>
                  </div>
                  <div className="rounded-lg border border-rose-400/15 bg-rose-400/5 p-2">
                    <p className="text-xs text-muted">Total que saiu hoje</p>
                    <strong className="mt-1 block text-rose-200">- {money(cashOut)}</strong>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-line bg-panel p-4">
                <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-300">
                  Vendas realizadas hoje
                </p>
                <p className="mt-1 text-3xl font-black">{money(totalSales(registerSales))}</p>
                <p className="mt-1 text-xs text-muted">
                  O saldo inicial da gaveta nao faz parte das vendas.
                </p>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">Dinheiro</span>
                    <strong>{money(cashSales)}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">PIX</span>
                    <strong>{money(pixSales)}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">Cartao</span>
                    <strong>{money(cardSales)}</strong>
                  </div>
                </div>
              </div>
            </div>

            {Math.abs(cashFormulaDifference) > 0.009 ? (
              <p className="mb-4 rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-100">
                O valor salvo difere da formula em {money(cashFormulaDifference)}.
              </p>
            ) : null}

            <div className="mb-3">
              <p className="text-xs font-black uppercase tracking-[0.1em] text-accent">
                Conferencia do operador
              </p>
              <p className="mt-1 text-sm text-muted">
                Conte ou consulte cada valor. A diferenca aparece somente depois de informar.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-line bg-panel p-3">
                <Label htmlFor="cash_amount">Quanto contou em dinheiro na gaveta?</Label>
                <Input
                  id="cash_amount"
                  name="cash_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={String(expectedCash)}
                  value={cashAmount}
                  onChange={(event) => setCashAmount(event.target.value)}
                  className="mt-2"
                  required
                />
                <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted">Esperado</span>
                  <strong>{money(expectedCash)}</strong>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted">Diferenca</span>
                  {hasCashCount ? (
                    <strong
                      className={cn(
                        Math.abs(cashDifference) > 0.009 ? "text-amber-200" : "text-green-300",
                      )}
                    >
                      {money(cashDifference)}
                    </strong>
                  ) : (
                    <span className="text-xs text-muted">Informe o valor</span>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-line bg-panel p-3">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-muted">
                  Vendas no cartao
                </p>
                <p className="mt-1 text-lg font-black">{money(cardSales)} esperado</p>
                <p className="mt-1 text-xs text-muted">
                  Informe credito e debito nas maquininhas abaixo.
                </p>
                <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted">Informado</span>
                  <strong>{hasCardCount ? money(machineCardTotal) : "--"}</strong>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted">Diferenca</span>
                  <strong
                    className={cn(
                      hasCardCount &&
                        (Math.abs(cardDifference) > 0.009 ? "text-amber-200" : "text-green-300"),
                    )}
                  >
                    {hasCardCount ? money(cardDifference) : "--"}
                  </strong>
                </div>
              </div>
              <div className="rounded-xl border border-line bg-panel p-3">
                <Label htmlFor="pix_amount_visible">Total recebido em PIX</Label>
                <Input
                  id="pix_amount_visible"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={String(pixSales)}
                  value={pixAmount}
                  onChange={(event) => setPixAmount(event.target.value)}
                  className="mt-2"
                />
                <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted">Esperado</span>
                  <strong>{money(pixSales)}</strong>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted">Diferenca</span>
                  <strong
                    className={cn(
                      hasPixCount &&
                        (Math.abs(pixDifference) > 0.009 ? "text-amber-200" : "text-green-300"),
                    )}
                  >
                    {hasPixCount ? money(pixDifference) : "--"}
                  </strong>
                </div>
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
                  Resultado do fechamento
                </div>
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">Gaveta esperada</span>
                    <strong>{money(expectedCash)}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">Vendas do dia</span>
                    <strong>{money(totalSales(registerSales))}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">Conferencia geral</span>
                    {allClosingValuesEntered ? (
                      <strong
                        className={cn(
                          Math.abs(totalDifference) > 0.009 ? "text-amber-200" : "text-green-300",
                        )}
                      >
                        {money(totalDifference)}
                      </strong>
                    ) : (
                      <span className="text-xs text-muted">Preencha dinheiro, cartao e PIX</span>
                    )}
                  </div>
                  <div className="border-t border-line pt-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted">Saldo inicial</span>
                      <strong>{money(Number(register.opening_amount))}</strong>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-muted">Entrou em dinheiro hoje</span>
                      <strong className="text-green-300">+ {money(cashEnteredToday)}</strong>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-muted">Saiu em dinheiro hoje</span>
                      <strong className="text-rose-200">- {money(cashOut)}</strong>
                    </div>
                    <p className="mt-3 text-xs text-muted">
                      O dinheiro inicial permanece na gaveta, mas nao entra no total vendido.
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
              <Button
                type="submit"
                variant="secondary"
                className="self-end"
                disabled={closing || !allClosingValuesEntered}
              >
                {closing ? "Salvando..." : "Fechar e salvar"}
              </Button>
            </div>
            {!allClosingValuesEntered ? (
              <p className="mt-3 text-sm text-amber-200">
                Informe a contagem da gaveta e confira os meios de pagamento usados hoje para
                liberar o fechamento.
              </p>
            ) : null}
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

    const [itemsResult, movementsResult, paymentAuditResult] = await Promise.all([
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
      sales.length
        ? supabase
            .from("audit_logs")
            .select("entity_id,metadata")
            .eq("action", "sale.payment_details")
            .in("entity_id", sales.map((sale) => sale.id))
        : Promise.resolve({ data: [] }),
    ]);

    let movements = (movementsResult.data ?? []) as unknown as CashMovement[];

    if (movementsResult.error) {
      const auditResult = await supabase
        .from("audit_logs")
        .select("id,user_id,metadata,created_at")
        .like("action", "cash_movement.%")
        .eq("metadata->>cash_register_id", cashRegisterId)
        .order("created_at", { ascending: false });

      movements = ((auditResult.data ?? []) as unknown as CashMovementAuditRow[])
        .map((row) => ({
          id: row.id,
          cash_register_id: row.metadata?.cash_register_id ?? cashRegisterId,
          user_id: row.user_id ?? "",
          movement_type: row.metadata?.movement_type === "saida" ? "saida" : "entrada",
          amount: Number(row.metadata?.amount ?? 0),
          reason: row.metadata?.reason ?? "Movimentacao de caixa",
          created_at: row.created_at,
        }));
    }

    setLiveSales(mergeSalePaymentDetails(
      sales,
      (paymentAuditResult.data ?? []) as unknown as SalePaymentAudit[],
    ));
    setLiveSaleItems((itemsResult.data ?? []) as unknown as RegisterSaleItem[]);
    setLiveMovements(movements);
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
