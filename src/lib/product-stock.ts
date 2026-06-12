import type { Product } from "@/lib/types";

export const PREPARED_PRODUCT_FALLBACK_QUANTITY = 999999;

const preparedKeywords = [
  "lanche",
  "lanches",
  "batata",
  "batatas",
  "comida",
  "comidas",
  "porcao",
  "porcoes",
  "prato",
  "pratos",
  "marmita",
  "hamburg",
  "burger",
  "cachorro",
  "hot dog",
  "pastel",
  "pizza",
  "salgado",
  "salgados",
  "combo",
  "acai",
];

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isBeverageCategory(category: string | null | undefined) {
  return normalize(category).includes("bebida");
}

export function isPreparedCategory(category: string | null | undefined) {
  if (isBeverageCategory(category)) return false;

  const normalized = normalize(category);
  return preparedKeywords.some((keyword) => normalized.includes(keyword));
}

export function defaultTrackStockForCategory(category: string | null | undefined) {
  return isBeverageCategory(category);
}

export function productTracksStock(product: Pick<Product, "category"> & { track_stock?: boolean | null }) {
  if (typeof product.track_stock === "boolean") return product.track_stock;
  return defaultTrackStockForCategory(product.category);
}

export function productStockModeLabel(product: Pick<Product, "category"> & { track_stock?: boolean | null }) {
  return productTracksStock(product) ? "Com estoque" : "Preparado";
}
