import type { MarketIndex, Sector, NewsItem } from "@/types"

// ─── Seed / Mock Generators (realistic baseline) ─────────────────────────────
// Real API calls are wired in /api/market. These provide fallback structure.

export const COUNTRIES = [
  { code: "US", name: "미국", flag: "🇺🇸", indices: ["^GSPC", "^NDX"] },
  { code: "CN", name: "중국", flag: "🇨🇳", indices: ["000001.SS"] },
  { code: "JP", name: "일본", flag: "🇯🇵", indices: ["^N225"] },
  { code: "IN", name: "인도", flag: "🇮🇳", indices: ["^BSESN"] },
  { code: "RU", name: "러시아", flag: "🇷🇺", indices: ["IMOEX.ME"] },
  { code: "GB", name: "영국", flag: "🇬🇧", indices: ["^FTSE"] },
  { code: "DE", name: "독일", flag: "🇩🇪", indices: ["^GDAXI"] },
  { code: "BR", name: "브라질", flag: "🇧🇷", indices: ["^BVSP"] },
] as const

/**
 * William O'Neil RS Rating calculation
 *
 * The O'Neil RS Rating compares a stock's price performance over the past
 * 12 months to all other stocks in the universe, scored 1–99.
 *
 * Simplified formula (used when full universe isn't available):
 *  - 12-month return weighted 40%
 *  - Recent 3-month return weighted 20%
 *  - Recent 1-month return weighted 20%
 *  - Recent 2-week return weighted 20%
 *
 * The result is then percentile-ranked against the universe.
 */
export function calculateRSRating(
  priceHistory: number[],
  universe: number[][]  // each element is a price history array for another stock
): number {
  const score = calculateRSScore(priceHistory)
  const universeScores = universe.map(calculateRSScore).sort((a, b) => a - b)
  const rank = universeScores.filter(s => s <= score).length
  return Math.round((rank / universeScores.length) * 99) + 1
}

export function calculateRSScore(prices: number[]): number {
  if (prices.length < 2) return 0
  const n = prices.length
  const current = prices[n - 1]

  const getReturn = (daysBack: number): number => {
    const idx = Math.max(0, n - 1 - daysBack)
    return (current - prices[idx]) / prices[idx]
  }

  const r12m = getReturn(252)
  const r3m  = getReturn(63)
  const r1m  = getReturn(21)
  const r2w  = getReturn(10)

  return r12m * 0.4 + r3m * 0.2 + r1m * 0.2 + r2w * 0.2
}

/**
 * Relative Strength vs Index (%)
 * = (stock return - index return) over a period
 */
export function calculateRelativeStrength(
  stockReturn: number,
  indexReturn: number
): number {
  return stockReturn - indexReturn
}

// ─── Sparkline generator ──────────────────────────────────────────────────────
export function generateSparkline(seed: number, length = 30, volatility = 0.015): number[] {
  const result: number[] = [100]
  let rng = seed
  for (let i = 1; i < length; i++) {
    rng = (rng * 1664525 + 1013904223) & 0xffffffff
    const change = ((rng / 0xffffffff) - 0.5) * 2 * volatility
    result.push(result[i - 1] * (1 + change))
  }
  return result
}
