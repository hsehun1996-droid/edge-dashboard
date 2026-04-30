import type { ScannerResult } from "@/types"

/**
 * Mark Minervini's Trend Template — 8 criteria
 * (Source: "Trade Like a Stock Market Wizard")
 *
 * 1. Price > 150-day MA AND price > 200-day MA
 * 2. 150-day MA > 200-day MA
 * 3. 200-day MA trending up for at least 1 month (about 21 trading days)
 * 4. 50-day MA > 150-day MA AND 50-day MA > 200-day MA
 * 5. Current price > 50-day MA
 * 6. Current price is at least 30% above 52-week low
 * 7. Current price is within 25% of 52-week high
 * 8. RS Rating >= 70 (William O'Neil RS Rating)
 */
export interface TrendTemplateInput {
  prices: number[]           // sorted oldest → newest daily closes
  rsRating: number           // 1-99 RS Rating
}

export interface TrendTemplateResult {
  above150MA: boolean
  above200MA: boolean
  ma150AboveMa200: boolean
  ma200Trending: boolean
  ma50AboveMa150: boolean
  ma50AboveMa200: boolean
  priceAboveMa50: boolean
  near52WeekHigh: boolean
  above52WeekLow: boolean
  highRsRating: boolean

  ma50: number
  ma150: number
  ma200: number
  high52w: number
  low52w: number

  passCount: number
  passed: boolean
}

function sma(prices: number[], period: number): number {
  if (prices.length < period) return 0
  const slice = prices.slice(prices.length - period)
  return slice.reduce((a, b) => a + b, 0) / period
}

export function applyTrendTemplate(input: TrendTemplateInput): TrendTemplateResult {
  const { prices, rsRating } = input
  const n = prices.length
  const current = prices[n - 1]

  const ma50  = sma(prices, 50)
  const ma150 = sma(prices, 150)
  const ma200 = sma(prices, 200)
  const ma200_21daysAgo = sma(prices.slice(0, n - 21), 200)

  const high52w = Math.max(...prices.slice(Math.max(0, n - 252)))
  const low52w  = Math.min(...prices.slice(Math.max(0, n - 252)))

  const above150MA      = current > ma150
  const above200MA      = current > ma200
  const ma150AboveMa200 = ma150 > ma200
  const ma200Trending   = ma200 > ma200_21daysAgo          // rising over last month
  const ma50AboveMa150  = ma50 > ma150
  const ma50AboveMa200  = ma50 > ma200
  const priceAboveMa50  = current > ma50
  const near52WeekHigh  = current >= high52w * 0.75        // within 25% of 52w high
  const above52WeekLow  = current >= low52w * 1.30         // 30%+ above 52w low
  const highRsRating    = rsRating >= 70

  const criteria = [
    above150MA,
    above200MA,
    ma150AboveMa200,
    ma200Trending,
    ma50AboveMa150,
    ma50AboveMa200,
    priceAboveMa50,
    near52WeekHigh,
    above52WeekLow,
    highRsRating,
  ]

  const passCount = criteria.filter(Boolean).length

  return {
    above150MA,
    above200MA,
    ma150AboveMa200,
    ma200Trending,
    ma50AboveMa150,
    ma50AboveMa200,
    priceAboveMa50,
    near52WeekHigh,
    above52WeekLow,
    highRsRating,
    ma50,
    ma150,
    ma200,
    high52w,
    low52w,
    passCount,
    passed: passCount >= 8,   // all criteria must pass
  }
}
