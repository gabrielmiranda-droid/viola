"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { dateTime, money, quantity } from "@/lib/format";
import { productStockModeLabel, productTracksStock } from "@/lib/product-stock";
import type { Product } from "@/lib/types";
import { updateProductAction } from "./actions";
import { ProductImportDialog } from "./product-import-dialog";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";
type StockFilter =
  | "todos"
  | "baixo"
  | "zerado"
  | "preparados"
  | "inativos"
  | "sem_minimo"
  | "sem_maximo";

const stockFilters: Array<{ value: StockFilter; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "baixo", label: "Baixo" },
  { value: "zerado", label: "Zerado" },
  { value: "preparados", label: "Preparados" },
  { value: "inativos", label: "Inativos" },
  { value: "sem_minimo", label: "Sem min." },
  { value: "sem_maximo", label: "Sem max." },
];

type CategoryItem = {
  name: string;
  count: number;
};

function CategoryRail({
  categories,
  activeCategory,
  onSelect,
}: {
  categories: CategoryItem[];
  activeCategory: string;
  onSelect: (category: string) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const dragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    scrollLeft: 0,
  });
  const suppressClickRef = useRef(false);

  useEffect(() => {
    buttonRefs.current.get(activeCategory)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeCategory]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const rail = railRef.current;
    if (!rail) return;

    rail.setPointerCapture(event.pointerId);
    dragRef.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      scrollLeft: rail.scrollLeft,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const rail = railRef.current;
    if (!rail || !dragRef.current.active) return;

    const delta = event.clientX - dragRef.current.startX;
    if (Math.abs(delta) > 4) dragRef.current.moved = true;
    rail.scrollLeft = dragRef.current.scrollLeft - delta;
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const rail = railRef.current;
    if (!dragRef.current.active) return;

    suppressClickRef.current = dragRef.current.moved;
    dragRef.current.active = false;
    if (rail?.hasPointerCapture(event.pointerId)) {
      rail.releasePointerCapture(event.pointerId);
    }
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }

  return (
    <div
      ref={railRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="no-scrollbar flex flex-nowrap gap-2 overflow-x-auto whitespace-nowrap scroll-smooth pb-2 select-none md:cursor-grab md:active:cursor-grabbing"
      aria-label="Categorias de produtos"
    >
      {categories.map((item) => (
        <button
          key={item.name}
          ref={(node) => {
            if (node) buttonRefs.current.set(item.name, node);
            else buttonRefs.current.delete(item.name);
          }}
          type="button"
          onClick={() => {
            if (!suppressClickRef.current) onSelect(item.name);
          }}
          className={cn(
            "min-h-10 shrink-0 rounded-lg border px-3 text-sm font-semibold transition",
            activeCategory === item.name
              ? "border-accent bg-accent text-white shadow-[0_10px_24px_rgba(47,125,244,0.2)]"
              : "border-line bg-panel-strong text-slate-300 hover:border-accent/35 hover:bg-white/6",
          )}
        >
          {item.name} ({item.count})
        </button>
      ))}
    </div>
  );
}

function maxStock(product: Product) {
  if (!productTracksStock(product)) return 0;
  return Number(product.max_stock ?? 0);
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

function maxStockLabel(product: Product) {
  const max = maxStock(product);
  return max > 0 ? quantity(max) : "Sem max.";
}

function stockStatus(product: Product): { label: string; variant: BadgeTone } {
  if (!product.active) return { label: "Inativo", variant: "neutral" };
  if (!productTracksStock(product)) return { label: "Preparado", variant: "info" };

  const current = Number(product.quantity ?? 0);
  const min = Number(product.min_stock ?? 0);
  const max = maxStock(product);

  if (current <= 0) return { label: "Zerado", variant: "danger" };
  if (current <= min) return { label: "Baixo", variant: "warning" };
  if (max > 0 && current > max) return { label: "Acima max.", variant: "info" };
  return { label: "OK", variant: "success" };
}

function matchesFilter(product: Product, filter: StockFilter) {
  if (filter === "todos") return true;
  if (filter === "baixo") {
    return product.active && productTracksStock(product) && Number(product.quantity) <= Number(product.min_stock);
  }
  if (filter === "zerado") {
    return product.active && productTracksStock(product) && Number(product.quantity) <= 0;
  }
  if (filter === "preparados") return product.active && !productTracksStock(product);
  if (filter === "inativos") return !product.active;
  if (filter === "sem_minimo") {
    return product.active && productTracksStock(product) && Number(product.min_stock) <= 0;
  }
  if (filter === "sem_maximo") {
    return product.active && productTracksStock(product) && maxStock(product) <= 0;
  }

  return true;
}

function ProductEditForm({ product }: { product: Product }) {
  const status = stockStatus(product);
  const tracksStock = productTracksStock(product);
  const [state, action, pending] = useActionState(updateProductAction, { ok: false });
  const { showToast } = useToast();

  useEffect(() => {
    if (!state.message) return;
    showToast({
      title: state.ok ? "Produto atualizado" : "Produto nao atualizado",
      message: state.message,
      tone: state.ok ? "success" : "danger",
    });
  }, [showToast, state.message, state.ok]);

  return (
    <form action={action} className="rounded-lg border border-line bg-panel p-3">
      <input type="hidden" name="product_id" value={product.id} />
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-black">{product.name}</p>
          <p className="text-xs text-muted">Atualizado em {dateTime(product.updated_at)}</p>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <div className="space-y-2 xl:col-span-2">
          <Label>Nome</Label>
          <Input name="name" defaultValue={product.name} required />
        </div>
        <div className="space-y-2">
          <Label>Categoria</Label>
          <Input name="category" defaultValue={product.category} required />
        </div>
        <div className="space-y-2">
          <Label>Controle</Label>
          <Select name="track_stock" defaultValue={tracksStock ? "true" : "false"}>
            <option value="false">Preparado</option>
            <option value="true">Com estoque</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Custo</Label>
          <Input name="cost_price" type="number" step="0.01" defaultValue={product.cost_price} required />
        </div>
        <div className="space-y-2">
          <Label>Venda</Label>
          <Input name="sale_price" type="number" step="0.01" defaultValue={product.sale_price} required />
        </div>

        {tracksStock ? (
          <>
            <div className="space-y-2">
              <Label>Qtd atual</Label>
              <Input name="quantity" type="number" step="0.001" defaultValue={product.quantity} required />
            </div>
            <div className="space-y-2">
              <Label>Minimo</Label>
              <Input name="min_stock" type="number" step="0.001" defaultValue={product.min_stock} required />
            </div>
            <div className="space-y-2">
              <Label>Maximo</Label>
              <Input name="max_stock" type="number" step="0.001" defaultValue={product.max_stock ?? 0} required />
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-line bg-panel-strong px-3 py-3 text-sm text-muted md:col-span-2 xl:col-span-3">
            <input type="hidden" name="quantity" value="0" />
            <input type="hidden" name="min_stock" value="0" />
            <input type="hidden" name="max_stock" value="0" />
            Produto preparado sem controle de estoque.
          </div>
        )}

        <label className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm">
          <input name="active" type="checkbox" defaultChecked={product.active} />
          Ativo
        </label>
        <div className="flex items-end">
          <Button type="submit" variant="secondary" className="w-full" disabled={pending}>
            {pending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span>
          {tracksStock
            ? `Atual ${quantity(product.quantity)} | Min ${quantity(product.min_stock)} | Max ${maxStockLabel(product)}`
            : productStockModeLabel(product)}
        </span>
        <span>Custo parado {tracksStock ? money(Number(product.quantity) * Number(product.cost_price)) : money(0)}</span>
      </div>
    </form>
  );
}

export function InventoryProducts({
  products,
  hasInventoryColumns,
}: {
  products: Product[];
  hasInventoryColumns: boolean;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todas");
  const [subcategory, setSubcategory] = useState("Todas");
  const [filter, setFilter] = useState<StockFilter>("todos");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const categories = useMemo(() => {
    const counts = products.reduce<Record<string, number>>((acc, product) => {
      const name = productCategoryParts(product.category).category;
      acc[name] = (acc[name] ?? 0) + 1;
      return acc;
    }, {});

    return [
      { name: "Todas", count: products.length },
      ...Object.entries(counts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, count]) => ({ name, count })),
    ];
  }, [products]);
  const overflowCategories = categories.slice(9);

  const subcategories = useMemo(() => {
    if (category === "Todas") return ["Todas"];

    return [
      "Todas",
      ...Array.from(
        new Set(
          products
            .filter((product) => productCategoryParts(product.category).category === category)
            .map((product) => productCategoryParts(product.category).subcategory),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    ];
  }, [category, products]);

  const activeSubcategory = subcategories.includes(subcategory) ? subcategory : "Todas";

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return products.filter((product) => {
      const parts = productCategoryParts(product.category);
      const inCategory = category === "Todas" || parts.category === category;
      const inSubcategory = activeSubcategory === "Todas" || parts.subcategory === activeSubcategory;
      const inFilter = matchesFilter(product, filter);
      const inSearch = !term
        || product.name.toLowerCase().includes(term)
        || product.category.toLowerCase().includes(term)
        || parts.category.toLowerCase().includes(term)
        || parts.subcategory.toLowerCase().includes(term);

      return inCategory && inSubcategory && inFilter && inSearch;
    });
  }, [activeSubcategory, category, filter, products, search]);

  const groupedProducts = useMemo(() => {
    return filteredProducts.reduce<Record<string, Record<string, Product[]>>>((acc, product) => {
      const parts = productCategoryParts(product.category);
      acc[parts.category] ??= {};
      acc[parts.category][parts.subcategory] ??= [];
      acc[parts.category][parts.subcategory].push(product);
      return acc;
    }, {});
  }, [filteredProducts]);

  const groupEntries = Object.entries(groupedProducts).sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      <Card className="mt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-black">Produtos por categoria</h2>
            <p className="text-sm text-muted">Busca, filtros e grupos recolhiveis para reposicao rapida.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ProductImportDialog products={products} />
            {!hasInventoryColumns ? (
              <Badge variant="warning">Aplicar migracao de estoque</Badge>
            ) : null}
            <Badge>{filteredProducts.length} produto(s)</Badge>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_200px_200px_200px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar produto ou categoria"
              className="pl-10"
            />
          </div>
          <Select
            value={category}
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
          <Select value={activeSubcategory} onChange={(event) => setSubcategory(event.target.value)}>
            {subcategories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
          <Select value={filter} onChange={(event) => setFilter(event.target.value as StockFilter)}>
            {stockFilters.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <CategoryRail
              categories={categories}
              activeCategory={category}
              onSelect={(item) => {
                setCategory(item);
                setSubcategory("Todas");
              }}
            />
          </div>
          {overflowCategories.length ? (
            <div className="w-full shrink-0 sm:w-48">
              <Select
                aria-label="Mais Categorias"
                value={overflowCategories.some((item) => item.name === category) ? category : ""}
                onChange={(event) => {
                  if (!event.target.value) return;
                  setCategory(event.target.value);
                  setSubcategory("Todas");
                }}
              >
                <option value="">Mais Categorias</option>
                {overflowCategories.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name} ({item.count})
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>

        {subcategories.length > 1 ? (
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
            {subcategories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setSubcategory(item)}
                className={cn(
                  "min-h-9 shrink-0 rounded-lg border px-3 text-sm font-semibold transition",
                  activeSubcategory === item
                    ? "border-green-400/40 bg-green-400/15 text-green-200"
                    : "border-line bg-panel-strong text-slate-300 hover:bg-white/6",
                )}
              >
                {item}
              </button>
            ))}
          </div>
        ) : null}
      </Card>

      <div className="mt-4 space-y-3">
        {groupEntries.length ? (
          groupEntries.map(([group, subgroups]) => {
            const rows = Object.values(subgroups).flat();
            const isCollapsed = collapsed[group] ?? false;
            const lowCount = rows.filter((product) => stockStatus(product).variant === "warning").length;
            const zeroCount = rows.filter((product) => stockStatus(product).variant === "danger").length;
            const subgroupEntries = Object.entries(subgroups).sort(([a], [b]) => a.localeCompare(b));

            return (
              <section key={group} className="rounded-lg border border-line bg-panel-strong/70">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((current) => ({ ...current, [group]: !isCollapsed }))
                  }
                  className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    {isCollapsed ? (
                      <ChevronRight className="h-5 w-5 shrink-0 text-muted" />
                    ) : (
                      <ChevronDown className="h-5 w-5 shrink-0 text-muted" />
                    )}
                    <span className="truncate font-black">{group}</span>
                  </span>
                  <span className="flex shrink-0 flex-wrap justify-end gap-2">
                    {zeroCount ? <Badge variant="danger">{zeroCount} zerado(s)</Badge> : null}
                    {lowCount ? <Badge variant="warning">{lowCount} baixo(s)</Badge> : null}
                    <Badge>{rows.length} item(ns)</Badge>
                  </span>
                </button>

                {!isCollapsed ? (
                  <div className="grid gap-3 border-t border-line bg-[#0d0f13] p-3">
                    {subgroupEntries.map(([subgroup, productsInSubgroup]) => (
                      <div key={`${group}-${subgroup}`} className="space-y-2">
                        <div className="flex items-center justify-between gap-3 px-1">
                          <h3 className="text-sm font-black text-slate-200">{subgroup}</h3>
                          <Badge variant="neutral">{productsInSubgroup.length} item(ns)</Badge>
                        </div>
                        <div className="grid gap-3">
                          {productsInSubgroup.map((product) => (
                            <ProductEditForm key={product.id} product={product} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })
        ) : (
          <Card>
            <EmptyState>Nenhum produto encontrado com os filtros atuais.</EmptyState>
          </Card>
        )}
      </div>
    </>
  );
}
