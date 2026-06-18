export type UserRole = "admin" | "caixa";
export type PaymentMethod = "pix" | "dinheiro" | "cartao" | "cartao_alimentacao" | "cartao_refeicao";
export type OrderType = "retirada" | "local" | "entrega";
export type CardType = "credito" | "debito";
export type SaleStatus = "completed" | "cancelled";
export type PreparationStatus = "aguardando" | "preparando" | "pronto" | "entregue";
export type CashRegisterStatus = "open" | "closed";
export type StockMovementType = "entrada" | "saida" | "ajuste" | "cancelamento";
export type CashMovementType = "entrada" | "saida";

export type Profile = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: "active" | "inactive";
};

export type Product = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  cost_price: number;
  sale_price: number;
  min_stock: number;
  max_stock?: number | null;
  track_stock?: boolean | null;
  active: boolean;
  updated_at: string;
};

export type CashRegister = {
  id: string;
  user_id: string;
  opened_at: string;
  closed_at: string | null;
  opening_amount: number;
  closing_amount: number | null;
  closing_cash_amount?: number | null;
  closing_credit_amount?: number | null;
  closing_debit_amount?: number | null;
  closing_pix_amount?: number | null;
  closing_total_amount?: number | null;
  closing_card_difference?: number | null;
  closing_pix_difference?: number | null;
  closing_total_difference?: number | null;
  expected_amount: number;
  cash_difference: number;
  sales_amount: number;
  status: CashRegisterStatus;
  notes: string | null;
};

export type CashMovement = {
  id: string;
  cash_register_id: string;
  user_id: string;
  movement_type: CashMovementType;
  amount: number;
  reason: string;
  created_at: string;
};

export type SaleItemInput = {
  productId: string;
  quantity: number;
  modifiers?: string[];
  notes?: string | null;
};

export type RegisterSale = {
  id: string;
  total_amount: number;
  payment_method: string;
  status: string;
  created_at?: string;
  card_type?: CardType | null;
  card_machine?: string | null;
  preparation_status?: PreparationStatus | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  delivery_address?: string | null;
  delivery_neighborhood?: string | null;
  delivery_reference?: string | null;
  order_notes?: string | null;
  order_type?: OrderType | null;
  delivery_fee?: number | null;
  delivery_driver?: string | null;
};

export type RegisterSaleItem = {
  id?: string;
  sale_id: string;
  product_name_snapshot: string;
  quantity: number;
  modifiers?: string[] | null;
  item_notes?: string | null;
};

export type TerminalClosing = {
  id?: string;
  cash_register_id?: string;
  terminal_name: string;
  credit_amount: number;
  debit_amount: number;
  pix_amount: number;
  created_at?: string;
};

export type ActionResult<T = undefined> = {
  ok: boolean;
  message?: string;
  data?: T;
};
