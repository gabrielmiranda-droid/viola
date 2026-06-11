"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { quantity } from "@/lib/format";
import { defaultTrackStockForCategory, productTracksStock } from "@/lib/product-stock";
import type { ActionResult, Product } from "@/lib/types";
import {
  adjustStockAction,
  applyPreparedProductsModeAction,
  createProductAction,
} from "./actions";

const initialState: ActionResult = { ok: false };

export function ProductCreateForm() {
  const [state, action, pending] = useActionState(createProductAction, initialState);
  const { showToast } = useToast();
  const [category, setCategory] = useState("");
  const [trackStock, setTrackStock] = useState(true);

  useEffect(() => {
    if (!state.message) return;
    showToast({
      title: state.ok ? "Produto salvo" : "Produto nao salvo",
      message: state.message,
      tone: state.ok ? "success" : "danger",
    });
  }, [showToast, state.message, state.ok]);

  function handleCategoryChange(value: string) {
    setCategory(value);
    setTrackStock(defaultTrackStockForCategory(value));
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-black">Novo produto</h2>
      <form action={action} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" name="name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">Categoria</Label>
          <Input
            id="category"
            name="category"
            placeholder="Lanches, Bebidas..."
            value={category}
            onChange={(event) => handleCategoryChange(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="track_stock">Controle</Label>
          <Select
            id="track_stock"
            name="track_stock"
            value={trackStock ? "true" : "false"}
            onChange={(event) => setTrackStock(event.target.value === "true")}
          >
            <option value="false">Preparado - sem estoque</option>
            <option value="true">Item com estoque</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cost_price">Custo</Label>
          <Input id="cost_price" name="cost_price" type="number" min="0" step="0.01" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sale_price">Preco de venda</Label>
          <Input id="sale_price" name="sale_price" type="number" min="0" step="0.01" required />
        </div>
        {trackStock ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantidade inicial</Label>
              <Input id="quantity" name="quantity" type="number" min="0" step="0.001" defaultValue="0" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="min_stock">Estoque minimo</Label>
              <Input id="min_stock" name="min_stock" type="number" min="0" step="0.001" defaultValue="0" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_stock">Estoque maximo</Label>
              <Input id="max_stock" name="max_stock" type="number" min="0" step="0.001" defaultValue="0" required />
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-line bg-panel-strong p-3 text-sm text-muted md:col-span-2 xl:col-span-3">
            <input type="hidden" name="quantity" value="0" />
            <input type="hidden" name="min_stock" value="0" />
            <input type="hidden" name="max_stock" value="0" />
            Lanche, batata e comida pronta vendem sem quantidade inicial, minimo ou maximo.
          </div>
        )}
        <div className="flex items-end md:col-span-2 xl:col-span-3">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Salvando..." : "Cadastrar produto"}
          </Button>
        </div>
      </form>
      {state.message ? (
        <p className={cn("mt-3 text-sm", state.ok ? "text-green-300" : "text-rose-200")}>
          {state.message}
        </p>
      ) : null}
    </Card>
  );
}

export function StockAdjustForm({ products }: { products: Product[] }) {
  const [state, action, pending] = useActionState(adjustStockAction, initialState);
  const { showToast } = useToast();
  const stockProducts = useMemo(() => products.filter(productTracksStock), [products]);

  useEffect(() => {
    if (!state.message) return;
    showToast({
      title: state.ok ? "Estoque atualizado" : "Estoque nao atualizado",
      message: state.message,
      tone: state.ok ? "success" : "danger",
    });
  }, [showToast, state.message, state.ok]);

  return (
    <Card>
      <h2 className="mb-4 text-lg font-black">Movimentar estoque</h2>
      {stockProducts.length ? (
        <form action={action} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2 xl:col-span-2">
          <Label htmlFor="product_id">Produto</Label>
          <Select id="product_id" name="product_id" required>
            <option value="">Selecione</option>
            {stockProducts.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} - atual {quantity(product.quantity)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="movement_type">Tipo</Label>
          <Select id="movement_type" name="movement_type" defaultValue="entrada">
            <option value="entrada">Entrada</option>
            <option value="saida">Saida manual</option>
            <option value="ajuste">Ajuste</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="quantity_delta">Quantidade (+/-)</Label>
          <Input id="quantity_delta" name="quantity_delta" type="number" step="0.001" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="unit_cost">Custo unitario</Label>
          <Input id="unit_cost" name="unit_cost" type="number" min="0" step="0.01" />
        </div>
        <div className="space-y-2 md:col-span-2 xl:col-span-3">
          <Label htmlFor="reason">Motivo</Label>
          <Textarea id="reason" name="reason" required />
        </div>
        <div className="flex items-end">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Lancando..." : "Lancar"}
          </Button>
        </div>
        </form>
      ) : (
        <EmptyState>Nenhum produto com controle de estoque.</EmptyState>
      )}
      {state.message ? (
        <p className={cn("mt-3 text-sm", state.ok ? "text-green-300" : "text-rose-200")}>
          {state.message}
        </p>
      ) : null}
    </Card>
  );
}

export function PreparedProductsModeForm() {
  const [state, action, pending] = useActionState(
    applyPreparedProductsModeAction,
    initialState,
  );
  const { showToast } = useToast();

  useEffect(() => {
    if (!state.message) return;
    showToast({
      title: state.ok ? "Produtos ajustados" : "Ajuste nao aplicado",
      message: state.message,
      tone: state.ok ? "success" : "danger",
    });
  }, [showToast, state.message, state.ok]);

  return (
    <form action={action} className="rounded-lg border border-line bg-panel p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold">Aplicar regra do cardapio</h3>
          <p className="text-sm text-muted">
            Deixa somente bebidas com estoque; os demais produtos ficam preparados.
          </p>
        </div>
        <Button type="submit" variant="success" disabled={pending}>
          {pending ? "Ajustando..." : "Aplicar regra"}
        </Button>
      </div>
      {state.message ? (
        <p className={cn("mt-3 text-sm", state.ok ? "text-green-300" : "text-rose-200")}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
