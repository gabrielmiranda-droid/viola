"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  defaultTrackStockForCategory,
  isBeverageCategory,
  PREPARED_PRODUCT_FALLBACK_QUANTITY,
} from "@/lib/product-stock";
import { productImportKey } from "@/lib/product-import";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, Product } from "@/lib/types";

const productSchema = z.object({
  name: z.string().min(2, "Nome obrigatorio."),
  category: z.string().min(2, "Categoria obrigatoria."),
  quantity: z.coerce.number().min(0),
  cost_price: z.coerce.number().min(0),
  sale_price: z.coerce.number().min(0),
  min_stock: z.coerce.number().min(0),
  max_stock: z.coerce.number().min(0),
  track_stock: z.boolean(),
  active: z.boolean().default(true),
});

const stockSchema = z.object({
  product_id: z.string().uuid(),
  movement_type: z.enum(["entrada", "saida", "ajuste"]),
  quantity_delta: z.coerce.number(),
  unit_cost: z.coerce.number().min(0).optional(),
  reason: z.string().min(3, "Informe o motivo."),
});

const productImportSchema = z.array(
  z.object({
    name: z.string().trim().min(2).max(200),
    category: z.string().trim().min(2).max(200),
    sale_price: z.coerce.number().min(0).max(999999.99).default(0),
  }),
).min(1, "Nenhum produto para importar.").max(1000, "O limite e 1000 produtos por importacao.");

type ProductImportResult = {
  identified: number;
  imported: number;
  existing: number;
  repeated: number;
  archived: number;
  failed: number;
  errors: string[];
};

type ProductWritePayload = {
  quantity: number;
  min_stock: number;
  max_stock?: number;
  track_stock?: boolean;
  [key: string]: string | number | boolean | undefined;
};

function isMissingMaxStockColumn(error: { message?: string; code?: string } | null) {
  return Boolean(
    error
      && (error.message?.toLowerCase().includes("max_stock")
        || error.code === "PGRST204"),
  );
}

function isMissingTrackStockColumn(error: { message?: string; code?: string } | null) {
  return Boolean(
    error
      && (error.message?.toLowerCase().includes("track_stock")
        || error.code === "PGRST204"),
  );
}

function withoutMaxStock<T extends { max_stock?: number }>(payload: T) {
  const safePayload = { ...payload };
  delete safePayload.max_stock;
  return safePayload;
}

function withoutTrackStock<T extends { track_stock?: boolean }>(payload: T) {
  const safePayload = { ...payload };
  delete safePayload.track_stock;
  return safePayload;
}

function stockPayload<T extends {
  quantity: number;
  min_stock: number;
  max_stock: number;
  track_stock: boolean;
}>(payload: T) {
  if (payload.track_stock) return payload;

  return {
    ...payload,
    quantity: 0,
    min_stock: 0,
    max_stock: 0,
  };
}

function legacyPreparedPayload<T extends {
  quantity: number;
  min_stock: number;
  max_stock?: number;
  track_stock?: boolean;
}>(payload: T, trackStock = payload.track_stock) {
  if (trackStock !== false) return payload;

  const safePayload = {
    ...payload,
    quantity: PREPARED_PRODUCT_FALLBACK_QUANTITY,
    min_stock: 0,
  };

  if ("max_stock" in safePayload) {
    safePayload.max_stock = 0;
  }

  return safePayload;
}

function parseTrackStock(formData: FormData) {
  const value = String(formData.get("track_stock") ?? "");
  if (value === "true") return true;
  if (value === "false") return false;
  return defaultTrackStockForCategory(String(formData.get("category") ?? ""));
}

async function updateProductWithFallback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productId: string,
  payload: ProductWritePayload,
  trackStock: boolean,
) {
  let safePayload = payload;
  let lastError: { message: string; code?: string } | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await supabase
      .from("products")
      .update(safePayload)
      .eq("id", productId);

    lastError = result.error;

    if (!lastError) return null;

    if (isMissingMaxStockColumn(lastError) && "max_stock" in safePayload) {
      safePayload = withoutMaxStock(safePayload);
      continue;
    }

    if (isMissingTrackStockColumn(lastError) && "track_stock" in safePayload) {
      safePayload = legacyPreparedPayload(
        withoutTrackStock(safePayload),
        trackStock,
      );
      continue;
    }

    return lastError;
  }

  return lastError;
}


export async function createProductAction(
  _state: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const profile = await requireAdmin();
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
    quantity: formData.get("quantity"),
    cost_price: formData.get("cost_price"),
    sale_price: formData.get("sale_price"),
    min_stock: formData.get("min_stock"),
    max_stock: formData.get("max_stock"),
    track_stock: parseTrackStock(formData),
    active: true,
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Produto invalido." };
  }

  const supabase = await createClient();
  const payload = {
    ...stockPayload(parsed.data),
    created_by: profile.id,
    updated_by: profile.id,
  };
  let safePayload = {
    ...parsed.data,
    created_by: profile.id,
    updated_by: profile.id,
  };

  let maxStockSaved = true;
  let trackStockSaved = true;
  let data: { id: string } | null = null;
  let error: { message: string; code?: string } | null = null;

  safePayload = payload;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await supabase
      .from("products")
      .insert(safePayload)
      .select("id")
      .single<{ id: string }>();

    data = result.data;
    error = result.error;

    if (!error) break;

    if (isMissingMaxStockColumn(error) && "max_stock" in safePayload) {
      maxStockSaved = false;
      safePayload = withoutMaxStock(safePayload);
      continue;
    }

    if (isMissingTrackStockColumn(error) && "track_stock" in safePayload) {
      trackStockSaved = false;
      safePayload = legacyPreparedPayload(
        withoutTrackStock(safePayload),
        parsed.data.track_stock,
      );
      continue;
    }

    break;
  }

  if (error) {
    return { ok: false, message: error.message };
  }

  if (!data) {
    return { ok: false, message: "Nao foi possivel confirmar o cadastro." };
  }

  await supabase.from("audit_logs").insert({
    user_id: profile.id,
    action: "product.create",
    entity: "products",
    entity_id: data.id,
    metadata: parsed.data,
  });

  revalidatePath("/estoque");
  revalidatePath("/caixa");
  return {
    ok: true,
    message: maxStockSaved && trackStockSaved
      ? "Produto cadastrado."
      : "Produto cadastrado. Aplique a migracao para gravar o modo de estoque no banco.",
  };
}

export async function importProductsAction(
  input: unknown,
  replaceExisting = false,
): Promise<ActionResult<ProductImportResult>> {
  const profile = await requireAdmin();
  const parsed = productImportSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Lista de produtos invalida.",
      data: {
        identified: 0,
        imported: 0,
        existing: 0,
        repeated: 0,
        archived: 0,
        failed: 0,
        errors: parsed.error.issues.map((issue) => issue.message),
      },
    };
  }

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("products")
    .select("id,name,category,sale_price,active");

  if (existingError) {
    return {
      ok: false,
      message: existingError.message,
      data: {
        identified: parsed.data.length,
        imported: 0,
        existing: 0,
        repeated: 0,
        archived: 0,
        failed: parsed.data.length,
        errors: [existingError.message],
      },
    };
  }

  const existingByKey = new Map(
    (existing ?? []).map((product) => [productImportKey(product), product]),
  );
  const importKeys = new Set<string>();
  let existingCount = 0;
  let repeatedCount = 0;
  const productsToInsert = parsed.data.filter((product) => {
    const key = productImportKey(product);
    if (importKeys.has(key)) {
      repeatedCount += 1;
      return false;
    }
    importKeys.add(key);
    if (existingByKey.has(key)) {
      existingCount += 1;
      return false;
    }
    return true;
  });

  if (!productsToInsert.length && !replaceExisting) {
    return {
      ok: true,
      message: "Nenhum produto novo para importar.",
      data: {
        identified: parsed.data.length,
        imported: 0,
        existing: existingCount,
        repeated: repeatedCount,
        archived: 0,
        failed: 0,
        errors: [],
      },
    };
  }

  const payload = productsToInsert.map((product) => ({
    ...product,
    quantity: 0,
    cost_price: 0,
    min_stock: 0,
    track_stock: isBeverageCategory(product.category),
    active: !replaceExisting,
    created_by: profile.id,
    updated_by: profile.id,
  }));
  const errors: string[] = [];
  let imported = 0;
  const insertedIds: string[] = [];
  const batchSize = 100;

  for (let index = 0; index < payload.length; index += batchSize) {
    const batch = payload.slice(index, index + batchSize);
    const batchNumber = Math.floor(index / batchSize) + 1;
    let result = await supabase
      .from("products")
      .insert(batch)
      .select("id");

    if (isMissingTrackStockColumn(result.error)) {
      const legacyBatch = batch.map((product) =>
        legacyPreparedPayload(
          withoutTrackStock(product),
          product.track_stock,
        )
      );
      result = await supabase
        .from("products")
        .insert(legacyBatch)
        .select("id");
    }

    if (result.error) {
      errors.push(`Lote ${batchNumber}: ${result.error.message}`);
      continue;
    }

    imported += result.data?.length ?? batch.length;
    insertedIds.push(...(result.data ?? []).map((product) => product.id));
  }

  if (replaceExisting && errors.length > 0) {
    await supabase.from("audit_logs").insert({
      user_id: profile.id,
      action: "product.catalog_replace_failed",
      entity: "products",
      metadata: {
        identified: parsed.data.length,
        staged: imported,
        retained: existingCount,
        repeated: repeatedCount,
        errors,
      },
    });

    return {
      ok: false,
      message: "A nova lista teve erros. O cardapio atual foi mantido.",
      data: {
        identified: parsed.data.length,
        imported: 0,
        existing: existingCount,
        repeated: repeatedCount,
        archived: 0,
        failed: productsToInsert.length - imported,
        errors,
      },
    };
  }

  if (replaceExisting && errors.length === 0) {
    const previousActiveIds = (existing ?? [])
      .filter((product) => product.active)
      .map((product) => product.id);
    const retainedProducts = parsed.data.filter((product) =>
      existingByKey.has(productImportKey(product))
    );
    const retainedIds = retainedProducts
      .map((product) => existingByKey.get(productImportKey(product))?.id)
      .filter((id): id is string => Boolean(id));
    const nextActiveIds = [...retainedIds, ...insertedIds];
    const archived = previousActiveIds.filter((id) => !nextActiveIds.includes(id)).length;

    const { error: archiveError } = await supabase
      .from("products")
      .update({ active: false, updated_by: profile.id })
      .eq("active", true);

    if (archiveError) {
      errors.push(`Nao foi possivel arquivar o cardapio atual: ${archiveError.message}`);
    } else {
      for (const product of retainedProducts) {
        const existingProduct = existingByKey.get(productImportKey(product));
        if (!existingProduct) continue;

        const updatePayload = {
          sale_price: product.sale_price,
          track_stock: isBeverageCategory(product.category),
          updated_by: profile.id,
        };
        let updateResult = await supabase
          .from("products")
          .update(updatePayload)
          .eq("id", existingProduct.id);

        if (isMissingTrackStockColumn(updateResult.error)) {
          updateResult = await supabase
            .from("products")
            .update(withoutTrackStock(updatePayload))
            .eq("id", existingProduct.id);
        }

        if (updateResult.error) {
          errors.push(`Nao foi possivel atualizar o preco de ${product.name}: ${updateResult.error.message}`);
          break;
        }
      }

      for (let index = 0; index < nextActiveIds.length; index += batchSize) {
        if (errors.length) break;
        const ids = nextActiveIds.slice(index, index + batchSize);
        const { error: activateError } = await supabase
          .from("products")
          .update({ active: true, updated_by: profile.id })
          .in("id", ids);

        if (activateError) {
          errors.push(`Nao foi possivel ativar o novo cardapio: ${activateError.message}`);
          break;
        }
      }
    }

    if (errors.length) {
      for (const product of retainedProducts) {
        const existingProduct = existingByKey.get(productImportKey(product));
        if (!existingProduct) continue;

        await supabase
          .from("products")
          .update({
            sale_price: existingProduct.sale_price,
            updated_by: profile.id,
          })
          .eq("id", existingProduct.id);
      }

      await supabase
        .from("products")
        .update({ active: false, updated_by: profile.id })
        .in("id", nextActiveIds);

      for (let index = 0; index < previousActiveIds.length; index += batchSize) {
        await supabase
          .from("products")
          .update({ active: true, updated_by: profile.id })
          .in("id", previousActiveIds.slice(index, index + batchSize));
      }
    } else {
      await supabase.from("audit_logs").insert({
        user_id: profile.id,
        action: "product.catalog_replace",
        entity: "products",
        metadata: {
          identified: parsed.data.length,
          imported,
          retained: retainedIds.length,
          archived,
          repeated: repeatedCount,
        },
      });

      revalidatePath("/estoque");
      revalidatePath("/caixa");
      revalidatePath("/admin");

      return {
        ok: true,
        message: "Cardapio substituido com sucesso.",
        data: {
          identified: parsed.data.length,
          imported,
          existing: retainedIds.length,
          repeated: repeatedCount,
          archived,
          failed: 0,
          errors: [],
        },
      };
    }
  }

  await supabase.from("audit_logs").insert({
    user_id: profile.id,
    action: "product.bulk_import",
    entity: "products",
    metadata: {
      identified: parsed.data.length,
      imported,
      existing: existingCount,
      repeated: repeatedCount,
      archived: 0,
      failed: productsToInsert.length - imported,
      errors,
    },
  });

  revalidatePath("/estoque");
  revalidatePath("/caixa");
  revalidatePath("/admin");

  return {
    ok: errors.length === 0,
    message: errors.length
      ? "Importacao concluida com erros em alguns lotes."
      : "Importacao concluida.",
    data: {
      identified: parsed.data.length,
      imported,
      existing: existingCount,
      repeated: repeatedCount,
      archived: 0,
      failed: productsToInsert.length - imported,
      errors,
    },
  };
}

export async function updateProductAction(
  _state: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const profile = await requireAdmin();
  const productId = String(formData.get("product_id") ?? "");
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
    quantity: formData.get("quantity"),
    cost_price: formData.get("cost_price"),
    sale_price: formData.get("sale_price"),
    min_stock: formData.get("min_stock"),
    max_stock: formData.get("max_stock"),
    track_stock: parseTrackStock(formData),
    active: formData.get("active") === "on",
  });

  if (!productId || !parsed.success) {
    return {
      ok: false,
      message: parsed.success
        ? "Produto nao encontrado."
        : parsed.error.issues[0]?.message ?? "Produto invalido.",
    };
  }

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("products")
    .select("cost_price,sale_price,quantity,min_stock")
    .eq("id", productId)
    .single<{ cost_price: number; sale_price: number; quantity: number; min_stock: number }>();

  const error = await updateProductWithFallback(
    supabase,
    productId,
    {
      ...stockPayload(parsed.data),
      updated_by: profile.id,
    },
    parsed.data.track_stock,
  );

  if (error) {
    return { ok: false, message: error.message };
  }

  await supabase.from("audit_logs").insert({
    user_id: profile.id,
    action: "product.update",
    entity: "products",
    entity_id: productId,
    metadata: {
      before,
      after: parsed.data,
    },
  });

  revalidatePath("/estoque");
  revalidatePath("/caixa");
  revalidatePath("/admin");
  return { ok: true, message: "Produto atualizado." };
}

export async function clearCatalogAction(): Promise<ActionResult<{ cleared: number }>> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { data: activeProducts, error: loadError } = await supabase
    .from("products")
    .select("id")
    .eq("active", true);

  if (loadError) {
    return { ok: false, message: loadError.message };
  }

  const cleared = activeProducts?.length ?? 0;
  if (!cleared) {
    return {
      ok: true,
      message: "O cardapio ja esta vazio.",
      data: { cleared: 0 },
    };
  }

  const { error } = await supabase
    .from("products")
    .update({ active: false, updated_by: profile.id })
    .eq("active", true);

  if (error) {
    return { ok: false, message: error.message };
  }

  await supabase.from("audit_logs").insert({
    user_id: profile.id,
    action: "product.catalog_clear",
    entity: "products",
    metadata: { cleared },
  });

  revalidatePath("/estoque");
  revalidatePath("/caixa");
  revalidatePath("/admin");

  return {
    ok: true,
    message: `${cleared} produto(s) removido(s) do cardapio ativo.`,
    data: { cleared },
  };
}

export async function applyPreparedProductsModeAction(
  _state: ActionResult,
): Promise<ActionResult> {
  void _state;
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id,name,category,quantity,cost_price,sale_price,min_stock,track_stock,active,updated_at")
    .eq("active", true);

  if (error) {
    return { ok: false, message: error.message };
  }

  const activeProducts = (data ?? []) as unknown as Product[];

  if (!activeProducts.length) {
    return { ok: true, message: "Nenhum produto ativo encontrado." };
  }

  for (const product of activeProducts) {
    const trackStock = isBeverageCategory(product.category);
    const payload = {
      quantity: trackStock ? Number(product.quantity) : 0,
      min_stock: trackStock ? Number(product.min_stock) : 0,
      max_stock: trackStock ? Number(product.max_stock ?? 0) : 0,
      track_stock: trackStock,
      updated_by: profile.id,
    };

    const updateError = await updateProductWithFallback(
      supabase,
      product.id,
      payload,
      trackStock,
    );

    if (updateError) {
      return { ok: false, message: updateError.message };
    }

    await supabase.from("audit_logs").insert({
      user_id: profile.id,
      action: "product.update",
      entity: "products",
      entity_id: product.id,
      metadata: {
        before: {
          quantity: product.quantity,
          min_stock: product.min_stock,
          max_stock: product.max_stock ?? 0,
          track_stock: product.track_stock ?? null,
        },
        after: {
          quantity: payload.quantity,
          min_stock: payload.min_stock,
          max_stock: payload.max_stock,
          track_stock: payload.track_stock,
        },
      },
    });
  }

  revalidatePath("/estoque");
  revalidatePath("/caixa");
  revalidatePath("/admin");

  return {
    ok: true,
    message: `${activeProducts.length} produto(s) ajustado(s). Somente bebidas controlam estoque.`,
  };
}

export async function adjustStockAction(
  _state: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = stockSchema.safeParse({
    product_id: formData.get("product_id"),
    movement_type: formData.get("movement_type"),
    quantity_delta: formData.get("quantity_delta"),
    unit_cost: formData.get("unit_cost") || undefined,
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Movimento invalido." };
  }

  if (parsed.data.quantity_delta === 0) {
    return { ok: false, message: "A quantidade nao pode ser zero." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_stock", {
    p_product_id: parsed.data.product_id,
    p_quantity_delta: parsed.data.quantity_delta,
    p_movement_type: parsed.data.movement_type,
    p_reason: parsed.data.reason,
    p_unit_cost: parsed.data.unit_cost ?? null,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/estoque");
  revalidatePath("/caixa");
  revalidatePath("/admin");
  return { ok: true, message: "Estoque atualizado." };
}
