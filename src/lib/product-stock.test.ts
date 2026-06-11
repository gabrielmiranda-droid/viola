import { describe, expect, it } from "vitest";
import {
  defaultTrackStockForCategory,
  isBeverageCategory,
  productTracksStock,
} from "./product-stock";

describe("product stock mode", () => {
  it("classifica produtos preparados sem estoque", () => {
    expect(defaultTrackStockForCategory("Hambúrgueres")).toBe(false);
    expect(defaultTrackStockForCategory("Batatas")).toBe(false);
    expect(defaultTrackStockForCategory("Bebidas")).toBe(true);
    expect(defaultTrackStockForCategory("Cardapio Acai")).toBe(false);
    expect(defaultTrackStockForCategory("Categoria nova")).toBe(false);
    expect(isBeverageCategory("Cardapio Bebidas")).toBe(true);
  });

  it("respeita a configuracao explicita do produto", () => {
    expect(productTracksStock({ category: "Hambúrgueres", track_stock: true })).toBe(true);
    expect(productTracksStock({ category: "Bebidas", track_stock: false })).toBe(false);
  });
});
