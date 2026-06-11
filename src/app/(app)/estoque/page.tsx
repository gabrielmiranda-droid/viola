import { Badge } from "@/components/ui/badge";
import { Card, Panel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { requireAdmin } from "@/lib/auth";
import { dateTime, money, quantity } from "@/lib/format";
import { productTracksStock } from "@/lib/product-stock";
import { createClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/types";
import { InventoryProducts } from "./inventory-products";
import { PreparedProductsModeForm, ProductCreateForm, StockAdjustForm } from "./inventory-forms";

type MovementRow = {
  id: string;
  movement_type: string;
  quantity: number;
  quantity_before: number;
  quantity_after: number;
  reason: string | null;
  created_at: string;
  products?: { name: string | null } | null;
  users?: { name: string | null; email: string | null } | null;
};

type ProductAuditRow = {
  entity_id: string | null;
  metadata: unknown;
};

type ProductAuditSettings = {
  max_stock?: number;
  track_stock?: boolean;
};

function stockValue(products: Product[], key: "cost_price" | "sale_price") {
  return products.reduce(
    (total, product) => total + Number(product.quantity ?? 0) * Number(product[key] ?? 0),
    0,
  );
}

function maxStock(product: Product) {
  if (!productTracksStock(product)) return 0;
  return Number(product.max_stock ?? 0);
}

function isMissingInventoryColumn(error: { message?: string; code?: string } | null) {
  return Boolean(
    error
      && (error.message?.toLowerCase().includes("max_stock")
        || error.message?.toLowerCase().includes("track_stock")
        || error.code === "PGRST204"),
  );
}

function readAuditSettings(metadata: unknown): ProductAuditSettings {
  if (!metadata || typeof metadata !== "object") return {};

  const record = metadata as Record<string, unknown>;
  const after = record.after;
  const source = after && typeof after === "object"
    ? after as Record<string, unknown>
    : record;
  const settings: ProductAuditSettings = {};
  const maxStockValue = Number(source.max_stock);

  if (Number.isFinite(maxStockValue) && maxStockValue >= 0) {
    settings.max_stock = maxStockValue;
  }

  if (typeof source.track_stock === "boolean") {
    settings.track_stock = source.track_stock;
  }

  return settings;
}

async function loadAuditProductSettings(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase
    .from("audit_logs")
    .select("entity_id,metadata")
    .eq("entity", "products")
    .in("action", ["product.create", "product.update"])
    .order("created_at", { ascending: false });

  const settingsByProduct = new Map<string, ProductAuditSettings>();

  for (const log of (data ?? []) as unknown as ProductAuditRow[]) {
    if (!log.entity_id || settingsByProduct.has(log.entity_id)) continue;
    const settings = readAuditSettings(log.metadata);
    if (Object.keys(settings).length) settingsByProduct.set(log.entity_id, settings);
  }

  return settingsByProduct;
}

async function loadProducts(supabase: Awaited<ReturnType<typeof createClient>>) {
  const columns = "id,name,category,quantity,cost_price,sale_price,min_stock,max_stock,track_stock,active,updated_at";
  const fallbackColumns = "id,name,category,quantity,cost_price,sale_price,min_stock,active,updated_at";

  const result = await supabase
    .from("products")
    .select(columns)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (isMissingInventoryColumn(result.error)) {
    const [fallback, auditSettings] = await Promise.all([
      supabase
        .from("products")
        .select(fallbackColumns)
        .order("category", { ascending: true })
        .order("name", { ascending: true }),
      loadAuditProductSettings(supabase),
    ]);

    return {
      hasInventoryColumns: false,
      products: ((fallback.data ?? []) as unknown as Product[]).map((product) => ({
        ...product,
        max_stock: auditSettings.get(product.id)?.max_stock ?? 0,
        track_stock: auditSettings.get(product.id)?.track_stock,
      })),
    };
  }

  return {
    hasInventoryColumns: true,
    products: (result.data ?? []) as unknown as Product[],
  };
}

function Metric({
  label,
  value,
  format = "number",
  tone = "default",
}: {
  label: string;
  value: number;
  format?: "money" | "number";
  tone?: "default" | "bad";
}) {
  return (
    <div className="rounded-lg border border-line bg-panel-strong p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={tone === "bad" ? "mt-1 font-black text-red-200" : "mt-1 font-black"}>
        {format === "money" ? money(value) : quantity(value)}
      </p>
    </div>
  );
}

export default async function InventoryPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ products, hasInventoryColumns }, { data: movements }] = await Promise.all([
    loadProducts(supabase),
    supabase
      .from("stock_movements")
      .select("id,movement_type,quantity,quantity_before,quantity_after,reason,created_at,products(name),users(name,email)")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const productRows = products;
  const movementRows = (movements ?? []) as unknown as MovementRow[];
  const activeProducts = productRows.filter((product) => product.active);
  const stockProducts = activeProducts.filter(productTracksStock);
  const preparedProducts = activeProducts.filter((product) => !productTracksStock(product));
  const lowStock = stockProducts.filter(
    (product) => Number(product.quantity) <= Number(product.min_stock),
  );
  const outOfStock = stockProducts.filter((product) => Number(product.quantity) <= 0);
  const withoutMinimum = stockProducts.filter((product) => Number(product.min_stock) <= 0);
  const withoutMaximum = stockProducts.filter((product) => maxStock(product) <= 0);
  const costTotal = stockValue(stockProducts, "cost_price");
  const saleTotal = stockValue(stockProducts, "sale_price");

  return (
    <Panel>
      <SectionHeader
        eyebrow="Estoque"
        title="Estoque"
        description="Produtos preparados ficam fora do controle de minimo e maximo."
      />

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-black">Resumo</h2>
            <p className="text-sm text-muted">Produtos, alertas e valor parado em estoque.</p>
          </div>
          <Badge variant={lowStock.length ? "warning" : "success"}>
            {lowStock.length ? "Repor estoque" : "Estoque ok"}
          </Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="Produtos ativos" value={activeProducts.length} />
          <Metric label="Preparados" value={preparedProducts.length} />
          <Metric label="Baixo estoque" value={lowStock.length} tone={lowStock.length ? "bad" : "default"} />
          <Metric label="Zerados" value={outOfStock.length} tone={outOfStock.length ? "bad" : "default"} />
          <Metric label="Sem minimo" value={withoutMinimum.length} tone={withoutMinimum.length ? "bad" : "default"} />
          <Metric label="Sem maximo" value={withoutMaximum.length} tone={withoutMaximum.length ? "bad" : "default"} />
          <Metric label="Valor em custo" value={costTotal} format="money" />
        </div>
        <p className="mt-3 text-sm text-muted">
          Potencial de venda: <strong className="text-foreground">{money(saleTotal)}</strong>
        </p>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <ProductCreateForm />
        <StockAdjustForm products={productRows} />
      </div>

      <div className="mt-4">
        <PreparedProductsModeForm />
      </div>

      <InventoryProducts products={productRows} hasInventoryColumns={hasInventoryColumns} />

      <Card className="mt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-black">Movimentos recentes</h2>
          <Badge>{movementRows.length} registro(s)</Badge>
        </div>

        {movementRows.length ? (
          <div className="space-y-2">
            {movementRows.map((movement) => (
              <div key={movement.id} className="grid gap-2 rounded-lg border border-line bg-panel-strong p-3 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-semibold">{movement.products?.name || "Produto"}</p>
                  <p className="text-sm text-muted">
                    {movement.movement_type} | {quantity(movement.quantity_before)} para {quantity(movement.quantity_after)}
                    {movement.reason ? ` | ${movement.reason}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {movement.users?.name || movement.users?.email || "Sistema"} - {dateTime(movement.created_at)}
                  </p>
                </div>
                <strong>{quantity(movement.quantity)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>Nenhuma movimentacao registrada.</EmptyState>
        )}
      </Card>
    </Panel>
  );
}
