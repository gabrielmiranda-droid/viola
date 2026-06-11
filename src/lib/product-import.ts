export type ImportedProduct = {
  name: string;
  category: string;
  sale_price: number;
};

export type ParsedProductImport = {
  products: ImportedProduct[];
  errors: string[];
};

function startsWithEmoji(value: string) {
  return /^[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(value);
}

function isUppercaseCategory(value: string) {
  const letters = value.match(/\p{L}/gu) ?? [];
  return letters.length >= 3
    && value === value.toLocaleUpperCase("pt-BR")
    && value !== value.toLocaleLowerCase("pt-BR");
}

function cleanCategory(value: string) {
  return value
    .replace(
      /^[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u200D\s]+/u,
      "",
    )
    .trim();
}

function cleanProductName(value: string) {
  return value
    .replace(/^\s*\d+\s*[-\u2013\u2014]\s*/, "")
    .trim();
}

function isLegendLine(value: string) {
  return /^p\([^)]+\)\s*[-\u2013\u2014]\s*\S+/i.test(value);
}

function parsePrice(value: string) {
  const normalized = value
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const price = Number(normalized);

  return Number.isFinite(price) && price >= 0 ? price : null;
}

function parseStandalonePrices(value: string) {
  if (!/^R\$/i.test(value.trim())) return null;

  const parts = value.split("/").map((part) => parsePrice(part));
  return parts.every((price): price is number => price !== null) ? parts : null;
}

function parseProductLine(value: string) {
  const separator = value.lastIndexOf("|");
  if (separator < 0) {
    return { name: cleanProductName(value), salePrice: 0, error: "" };
  }

  const name = cleanProductName(value.slice(0, separator));
  const rawPrice = value.slice(separator + 1).trim();
  const salePrice = parsePrice(rawPrice);

  return {
    name,
    salePrice: salePrice ?? 0,
    error: salePrice !== null
      ? ""
      : `preco invalido (${rawPrice || "vazio"}).`,
  };
}

export function productImportKey(product: ImportedProduct) {
  return `${normalizeImportValue(product.category)}::${normalizeImportValue(product.name)}`;
}

function normalizeImportValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export function parseProductImport(value: string): ParsedProductImport {
  const products: ImportedProduct[] = [];
  const errors: string[] = [];
  let category = "";
  let pendingProduct: { name: string; line: number } | null = null;

  function flushPendingProduct() {
    if (!pendingProduct) return;
    products.push({
      name: pendingProduct.name,
      category,
      sale_price: 0,
    });
    pendingProduct = null;
  }

  value.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    if (isLegendLine(line)) return;

    if (startsWithEmoji(line) || isUppercaseCategory(line)) {
      flushPendingProduct();
      const nextCategory = cleanCategory(line);
      if (nextCategory) {
        category = nextCategory;
      } else {
        errors.push(`Linha ${index + 1}: categoria vazia.`);
      }
      return;
    }

    const standalonePrices = parseStandalonePrices(line);
    if (standalonePrices) {
      if (!pendingProduct) {
        errors.push(`Linha ${index + 1}: preco sem produto.`);
        return;
      }

      if (standalonePrices.length === 1) {
        products.push({
          name: pendingProduct.name,
          category,
          sale_price: standalonePrices[0],
        });
      } else if (standalonePrices.length === 2) {
        products.push(
          {
            name: `${pendingProduct.name} P(H)`,
            category: "Lanches Tradicionais - P(H)",
            sale_price: standalonePrices[0],
          },
          {
            name: `${pendingProduct.name} P(MF)`,
            category: "Lanches Tradicionais - P(MF)",
            sale_price: standalonePrices[1],
          },
        );
      } else {
        errors.push(`Linha ${index + 1}: informe um ou dois precos por produto.`);
      }

      pendingProduct = null;
      return;
    }

    const { name, salePrice, error } = parseProductLine(line);
    if (error) {
      errors.push(`Linha ${index + 1}: ${error}`);
      return;
    }

    if (!category) {
      errors.push(`Linha ${index + 1}: produto sem categoria (${name}).`);
      return;
    }

    if (name.length < 2) {
      errors.push(`Linha ${index + 1}: nome de produto invalido.`);
      return;
    }

    if (line.includes("|")) {
      flushPendingProduct();
      products.push({ name, category, sale_price: salePrice });
      return;
    }

    flushPendingProduct();
    pendingProduct = { name, line: index + 1 };
  });

  flushPendingProduct();
  return { products, errors };
}
