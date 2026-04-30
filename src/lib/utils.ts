import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

type DisplayCurrency = "USD" | "KRW"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat("ko-KR", options).format(value)
}

export function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function convertPriceForDisplay(
  value: number,
  currency: DisplayCurrency,
  exchangeRate: number,
  sourceCurrency: DisplayCurrency = "USD"
): number {
  if (sourceCurrency === currency) return value
  if (sourceCurrency === "USD" && currency === "KRW") return value * exchangeRate
  return value / exchangeRate
}

export function formatDisplayCurrency(
  value: number,
  currency: DisplayCurrency,
  exchangeRate: number,
  sourceCurrency: DisplayCurrency = "USD"
): string {
  const converted = convertPriceForDisplay(value, currency, exchangeRate, sourceCurrency)

  const formatted = new Intl.NumberFormat(currency === "KRW" ? "ko-KR" : "en-US", {
    minimumFractionDigits: currency === "KRW" ? 0 : 2,
    maximumFractionDigits: currency === "KRW" ? 0 : 2,
  }).format(converted)

  return currency === "KRW" ? `${formatted}원` : `$${formatted}`
}

export function formatCompactDisplayCurrency(
  value: number,
  currency: DisplayCurrency,
  exchangeRate: number,
  sourceCurrency: DisplayCurrency = "USD"
): string {
  const converted = convertPriceForDisplay(value, currency, exchangeRate, sourceCurrency)

  const formatted = new Intl.NumberFormat(currency === "KRW" ? "ko-KR" : "en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(converted)

  return currency === "KRW" ? `${formatted}원` : `$${formatted}`
}

export function formatPercent(value: number, digits = 2): string {
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(digits)}%`
}

export function formatLargeNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}T`
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toFixed(2)
}

export function getChangeColor(value: number): string {
  if (value > 0) return "text-positive"
  if (value < 0) return "text-negative"
  return "text-neutral"
}

export function getChangeBgColor(value: number): string {
  if (value > 0) return "bg-positive/15 text-positive"
  if (value < 0) return "bg-negative/15 text-negative"
  return "bg-neutral/15 text-neutral"
}
