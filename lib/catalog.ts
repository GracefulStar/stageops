import fixture from "../backend/stageops/data/catalog.json" with { type: "json" };

export type CategoryId = "sound" | "signal" | "backline";
export type Product = {
  id: string;
  category: CategoryId;
  name: string;
  kind: string;
  detail: string;
};
export type SeedProduct = Product & { total: number; releaseDay: number; freeUnits: number };
export type Category = { id: CategoryId; title: string; short: string; description: string; image: string; total: number };
export const categories = fixture.categories as Category[];
export const products = fixture.products as SeedProduct[];
export type RentalRange = { start: string; end: string };
export type CartLine = {
  productId: string;
  quantity: number;
  range?: RentalRange;
};
export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}
export function shiftDay(value: string, days: number): string {
  const date = parseDate(value);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}
export function rentalWindow(now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const date = parseDate(today);
  return {
    today,
    minDate: isoDate(new Date(date.getFullYear(), date.getMonth() + 1, 1)),
    timeZone: "Asia/Tashkent",
  };
}
export function shortDate(value: string) {
  return parseDate(value)
    .toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
    .replace(".", "");
}
export function rangeLabel(range?: RentalRange) {
  return range
    ? `${shortDate(range.start)} — ${shortDate(range.end)}`
    : "Выберите даты";
}
