const SAO_PAULO_OFFSET = "-03:00";

function partsFor(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value;

  return {
    year: get("year") ?? "1970",
    month: get("month") ?? "01",
    day: get("day") ?? "01",
  };
}

export function todayRange() {
  const { year, month, day } = partsFor(new Date());

  return {
    start: `${year}-${month}-${day}T00:00:00${SAO_PAULO_OFFSET}`,
    end: `${year}-${month}-${day}T23:59:59.999${SAO_PAULO_OFFSET}`,
    label: `${day}/${month}/${year}`,
  };
}

export function monthRange() {
  const { year, month } = partsFor(new Date());
  const nextMonthDate = new Date(Number(year), Number(month), 1);
  const next = partsFor(nextMonthDate);

  return {
    start: `${year}-${month}-01T00:00:00${SAO_PAULO_OFFSET}`,
    end: `${next.year}-${next.month}-01T00:00:00${SAO_PAULO_OFFSET}`,
    label: `${month}/${year}`,
  };
}

export function rangeFromSearch(start?: string, end?: string) {
  const today = todayRange();

  return {
    start: start ? `${start}T00:00:00${SAO_PAULO_OFFSET}` : today.start,
    end: end ? `${end}T23:59:59.999${SAO_PAULO_OFFSET}` : today.end,
  };
}
