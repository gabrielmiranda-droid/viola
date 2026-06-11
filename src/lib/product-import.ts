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

function parseProductLine(value: string) {
  const separator = value.lastIndexOf("|");
  if (separator < 0) {
    return { name: cleanProductName(value), salePrice: 0, error: "" };
  }

  const name = cleanProductName(value.slice(0, separator));
  const rawPrice = value.slice(separator + 1).trim();
  const priceText = rawPrice
    .replace(/^R\$\s*/i, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const salePrice = Number(priceText);

  return {
    name,
    salePrice,
    error: Number.isFinite(salePrice) && salePrice >= 0
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

  value.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    if (isLegendLine(line)) return;

    if (startsWithEmoji(line) || isUppercaseCategory(line)) {
      const nextCategory = cleanCategory(line);
      if (nextCategory) {
        category = nextCategory;
      } else {
        errors.push(`Linha ${index + 1}: categoria vazia.`);
      }
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

    products.push({ name, category, sale_price: salePrice });
  });

  return { products, errors };
}
