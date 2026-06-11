import { describe, expect, it } from "vitest";
import { parseProductImport, productImportKey } from "./product-import";

describe("parseProductImport", () => {
  it("identifica categorias, remove codigos e preserva nomes curtos", () => {
    const result = parseProductImport(
      "\u{1F32D} Cachorro Quente\n001 - Cachorro Quente\n002 - X Tudo\n\nBEBIDAS\nH2O",
    );

    expect(result.errors).toEqual([]);
    expect(result.products).toEqual([
      { category: "Cachorro Quente", name: "Cachorro Quente" },
      { category: "Cachorro Quente", name: "X Tudo" },
      { category: "BEBIDAS", name: "H2O" },
    ]);
  });

  it("normaliza acentos, caixa e espacos na chave de duplicidade", () => {
    expect(productImportKey({ category: " Açaí ", name: "Extra  Nutella" }))
      .toBe(productImportKey({ category: "acai", name: "extra nutella" }));
  });
});
