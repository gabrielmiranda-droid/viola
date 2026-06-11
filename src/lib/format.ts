export const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export const number = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 3,
});

export function money(value: number | null | undefined) {
  return brl.format(Number(value ?? 0));
}

export function quantity(value: number | null | undefined) {
  return number.format(Number(value ?? 0));
}

export function dateTime(value: string | Date | null | undefined) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export function dateOnly(value: string | Date | null | undefined) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export function paymentLabel(method: string) {
  const labels: Record<string, string> = {
    pix: "PIX",
    dinheiro: "Dinheiro",
    cartao: "Cartao",
  };

  return labels[method] ?? method;
}
