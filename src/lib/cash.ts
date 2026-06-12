type SaleLike = {
  id?: string;
  total_amount: number;
  payment_method: string;
  status?: string;
  card_type?: string | null;
  card_machine?: string | null;
};

export type SalePaymentAudit = {
  entity_id: string | null;
  metadata: {
    card_type?: string | null;
    card_machine?: string | null;
  } | null;
};

export function mergeSalePaymentDetails<T extends SaleLike>(
  sales: T[],
  audits: SalePaymentAudit[],
) {
  const detailsBySale = new Map(
    audits
      .filter((audit) => audit.entity_id)
      .map((audit) => [audit.entity_id, audit.metadata]),
  );

  return sales.map((sale) => {
    const details = sale.id ? detailsBySale.get(sale.id) : null;
    if (!details) return sale;

    return {
      ...sale,
      card_type: sale.card_type ?? details.card_type ?? null,
      card_machine: sale.card_machine ?? details.card_machine ?? null,
    };
  });
}

type CashMovementLike = {
  movement_type: "entrada" | "saida" | string;
  amount: number;
};

type CashRegisterLike = {
  expected_amount: number;
  closing_amount?: number | null;
  cash_difference?: number | null;
};

export function sumMoney(values: Array<number | null | undefined>): number {
  return values.reduce<number>((total, value) => total + Number(value ?? 0), 0);
}

export function completedSales<T extends SaleLike>(sales: T[]) {
  return sales.filter((sale) => !sale.status || sale.status === "completed");
}

export function salesByPayment(sales: SaleLike[], paymentMethod: string) {
  return sumMoney(
    completedSales(sales)
      .filter((sale) => sale.payment_method === paymentMethod)
      .map((sale) => sale.total_amount),
  );
}

export function totalSales(sales: SaleLike[]) {
  return sumMoney(completedSales(sales).map((sale) => sale.total_amount));
}

export function averageTicket(sales: SaleLike[]) {
  const completed = completedSales(sales);
  return completed.length ? totalSales(completed) / completed.length : 0;
}

export function cardSalesByType(sales: SaleLike[], cardType: "credito" | "debito") {
  return sumMoney(
    completedSales(sales)
      .filter((sale) => sale.payment_method === "cartao" && sale.card_type === cardType)
      .map((sale) => sale.total_amount),
  );
}

export function cardSalesWithoutType(sales: SaleLike[]) {
  return sumMoney(
    completedSales(sales)
      .filter((sale) => sale.payment_method === "cartao" && !sale.card_type)
      .map((sale) => sale.total_amount),
  );
}

export function groupSalesByMachine(sales: SaleLike[]) {
  return Object.values(
    completedSales(sales).reduce<
      Record<string, {
        terminal: string;
        credit: number;
        debit: number;
        pix: number;
        cardUnknown: number;
        total: number;
      }>
    >((acc, sale) => {
      if (sale.payment_method !== "cartao" && sale.payment_method !== "pix") return acc;

      const terminal = sale.card_machine?.trim() || "Sem maquininha";
      acc[terminal] ??= {
        terminal,
        credit: 0,
        debit: 0,
        pix: 0,
        cardUnknown: 0,
        total: 0,
      };

      const amount = Number(sale.total_amount ?? 0);
      acc[terminal].total += amount;

      if (sale.payment_method === "pix") {
        acc[terminal].pix += amount;
      } else if (sale.card_type === "credito") {
        acc[terminal].credit += amount;
      } else if (sale.card_type === "debito") {
        acc[terminal].debit += amount;
      } else {
        acc[terminal].cardUnknown += amount;
      }

      return acc;
    }, {}),
  ).sort((a, b) => b.total - a.total);
}

export function movementsByType(
  movements: CashMovementLike[],
  movementType: "entrada" | "saida",
) {
  return sumMoney(
    movements
      .filter((movement) => movement.movement_type === movementType)
      .map((movement) => movement.amount),
  );
}

export function expectedCashTotal({
  opening,
  cashSales,
  cashIn,
  cashOut,
}: {
  opening: number;
  cashSales: number;
  cashIn: number;
  cashOut: number;
}) {
  return opening + cashSales + cashIn - cashOut;
}

export function cashRegisterDifference(register: CashRegisterLike) {
  if (register.cash_difference !== null && register.cash_difference !== undefined) {
    return Number(register.cash_difference);
  }

  if (register.closing_amount === null || register.closing_amount === undefined) {
    return 0;
  }

  return Number(register.closing_amount) - Number(register.expected_amount ?? 0);
}
