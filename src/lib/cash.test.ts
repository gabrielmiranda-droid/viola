import { describe, expect, it } from "vitest";
import {
  cashRegisterDifference,
  expectedCashTotal,
  mergeSalePaymentDetails,
  salesByPayment,
} from "./cash";

describe("cash rules", () => {
  it("ignora vendas canceladas nos totais por pagamento", () => {
    expect(salesByPayment([
      { total_amount: 20, payment_method: "dinheiro", status: "completed" },
      { total_amount: 50, payment_method: "dinheiro", status: "cancelled" },
    ], "dinheiro")).toBe(20);
  });

  it("calcula o dinheiro esperado", () => {
    expect(expectedCashTotal({
      opening: 100,
      cashSales: 80,
      cashIn: 20,
      cashOut: 30,
    })).toBe(170);
  });

  it("prioriza a diferenca persistida no fechamento", () => {
    expect(cashRegisterDifference({
      expected_amount: 100,
      closing_amount: 90,
      cash_difference: -8,
    })).toBe(-8);
  });

  it("recupera detalhes de cartao salvos na auditoria", () => {
    expect(mergeSalePaymentDetails(
      [{ id: "sale-1", total_amount: 40, payment_method: "cartao" }],
      [{
        entity_id: "sale-1",
        metadata: { card_type: "credito", card_machine: "Principal" },
      }],
    )).toEqual([{
      id: "sale-1",
      total_amount: 40,
      payment_method: "cartao",
      card_type: "credito",
      card_machine: "Principal",
    }]);
  });
});
