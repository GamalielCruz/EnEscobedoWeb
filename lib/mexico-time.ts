const MEXICO_OFFSET = "-06:00";

export function getMexicoDateKey(input: Date | string = new Date()) {
  const date = typeof input === "string" ? new Date(input) : input;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

export function getMexicoDayRange(dateKey = getMexicoDateKey()) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const start = `${dateKey}T00:00:00${MEXICO_OFFSET}`;
  const next = new Date(Date.UTC(year, month - 1, day + 1, 6, 0, 0));
  const nextYear = next.getUTCFullYear();
  const nextMonth = String(next.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(next.getUTCDate()).padStart(2, "0");
  const end = `${nextYear}-${nextMonth}-${nextDay}T00:00:00${MEXICO_OFFSET}`;
  return { dateKey, start, end };
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(value || 0);
}
