/** All money is stored as integer minor units (cents/pence) to avoid float errors. */

export type Currency = "USD" | "GBP" | "EUR";

export function toMinor(amount: number): number {
  return Math.round(amount * 100);
}

export function toMajorString(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function formatMoney(minor: number, currency: string = "USD"): string {
  return new Intl.NumberFormat(currency === "GBP" ? "en-GB" : "en-US", {
    style: "currency",
    currency,
  }).format(minor / 100);
}

export function appCurrency(): Currency {
  const c = (process.env.CURRENCY ?? "USD").toUpperCase();
  return c === "GBP" || c === "EUR" ? c : "USD";
}
