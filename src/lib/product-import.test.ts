import { describe, expect, it } from "vitest";
import { parseProductImport, productImportKey } from "./product-import";

describe("parseProductImport", () => {
  it("identifica categorias, remove codigos e preserva nomes curtos", () => {
    const result = parseProductImport(
      "\u{1F32D} Cachorro Quente\n001 - Cachorro Quente\n002 - X Tudo\n\nBEBIDAS\nH2O",
    );

    expect(result.errors).toEqual([]);
    expect(result.products).toEqual([
      { category: "Cachorro Quente", name: "Cachorro Quente", sale_price: 0 },
      { category: "Cachorro Quente", name: "X Tudo", sale_price: 0 },
      { category: "BEBIDAS", name: "H2O", sale_price: 0 },
    ]);
  });

  it("le precos em reais e ignora linhas de legenda", () => {
    const result = parseProductImport(
      "\u{1F354} Artesanais\nKids Cowboy | 15\nBandido | R$ 32,50\n\np(h) - pao de hamburguer",
    );

    expect(result.errors).toEqual([]);
    expect(result.products).toEqual([
      { category: "Artesanais", name: "Kids Cowboy", sale_price: 15 },
      { category: "Artesanais", name: "Bandido", sale_price: 32.5 },
    ]);
  });

  it("le produto e preco em linhas separadas", () => {
    const result = parseProductImport(
      "\u{1F354} Lanches Artesanais\nKids Cowboy\nR$15,00\nBandido\nR$32,00",
    );

    expect(result.errors).toEqual([]);
    expect(result.products).toEqual([
      { category: "Lanches Artesanais", name: "Kids Cowboy", sale_price: 15 },
      { category: "Lanches Artesanais", name: "Bandido", sale_price: 32 },
    ]);
  });

  it("expande dois precos em produtos P(H) e P(MF)", () => {
    const result = parseProductImport(
      "\u{1F32D} Cardapio Nelore's - P(H) / P(MF)\nCachorro Quente\nR$15 / R$23",
    );

    expect(result.errors).toEqual([]);
    expect(result.products).toEqual([
      {
        category: "Lanches Tradicionais - P(H)",
        name: "Cachorro Quente P(H)",
        sale_price: 15,
      },
      {
        category: "Lanches Tradicionais - P(MF)",
        name: "Cachorro Quente P(MF)",
        sale_price: 23,
      },
    ]);
  });

  it("informa preco invalido", () => {
    const result = parseProductImport("\u{1F354} Artesanais\nKids Cowboy | quinze");

    expect(result.products).toEqual([]);
    expect(result.errors).toEqual(["Linha 2: preco invalido (quinze)."]);
  });

  it("normaliza acentos, caixa e espacos na chave de duplicidade", () => {
    expect(productImportKey({
      category: " Acai ",
      name: "Extra  Nutella",
      sale_price: 10,
    })).toBe(productImportKey({
      category: "acai",
      name: "extra nutella",
      sale_price: 20,
    }));
  });
});
