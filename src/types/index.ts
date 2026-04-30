// ─── Market Types ───────────────────────────────────────────────────────────

export interface MarketIndex {
  country: string
  countryCode: string
  flag: string
  name: string
  ticker: string
  price: number
  change: number
  changePercent: number
  volume: number
  marketCap?: number
  lastUpdated: string
  sparkline?: number[]
}

export interface Sector {
  name: string
  nameEn: string
  ticker: string        // sector ETF ticker
  country: string       // "US" | "KR" | "JP" | "CN"
  returnPct: number
  volume: number        // USD volume
  rs: number            // Relative Strength vs index
  rsRating: number      // 1-99 RS Rating (O'Neil style)
  marketCap: number
  topStock: {           // 섹터 대장주
    ticker: string
    name: string
    changePercent: number
  }
  topStocks?: Array<{   // 섹터 대표 종목 5개
    ticker: string
    name: string
    changePercent: number
    price: number
  }>
  etf: {                // 대표 ETF
    ticker: string
    name: string
    changePercent: number
  }
}

export interface NewsItem {
  id: string
  country: string
  title: string
  summary: string
  source: string
  url: string
  publishedAt: string
  sentiment?: "positive" | "negative" | "neutral"
}

// ─── Trade Data Types ────────────────────────────────────────────────────────

export interface TradeRecord {
  hsCode: string
  productName: string
  country: string
  year: number
  month: number
  exportAmount: number      // USD
  importAmount: number      // USD
  exportQty: number
  importQty: number
  unit: string
  balance: number           // 무역수지 (exportAmount - importAmount)
  exportYoY: number         // % YoY change
  importYoY: number
  exportMoM: number         // % MoM change
  importMoM: number
  avgExportPrice: number    // USD/unit
  avgImportPrice: number
  avgExportPriceYoY: number // % YoY change in export unit price
  avgImportPriceYoY: number
}

export interface TradeSearchParams {
  query: string
  hsCode?: string
  country?: string
  year?: number
  month?: number
}

export interface TradeSuggestion {
  queryValue: string
  hsCode?: string
  productName: string
  subtitle?: string
  matchType: "hsCode" | "productName" | "company"
}

// ─── Portfolio Types ─────────────────────────────────────────────────────────

export interface PortfolioItem {
  id: string
  userId: string
  ticker: string
  name: string
  exchange: string
  currency: string
  type: "BUY" | "SELL"
  quantity: number
  avgCost: number           // buy price (BUY lot) or sell price (SELL lot)
  totalInvested: number     // qty * avgCost
  realizedGain?: number | null
  buyDate?: string | null
  notes?: string | null
  createdAt: string
  updatedAt: string
}

// Aggregated ticker-level holding (derived from multiple lots)
export interface HoldingItem {
  ticker: string
  name: string
  exchange: string
  currency: string
  quantity: number
  avgCost: number
  totalInvested: number
  realizedGain: number
  currentPrice?: number
  currentChangePercent?: number
  currentValue?: number
  unrealizedGain?: number
  unrealizedGainPercent?: number
  weight?: number
  todayGain?: number
}

export interface PortfolioSummary {
  totalValue: number
  totalInvested: number
  totalGainLoss: number
  totalGainLossPercent: number
  items: PortfolioItem[]
}

// ─── Alpha Scanner Types ──────────────────────────────────────────────────────

export type ScannerCountry = "US" | "KR"
export type ScannerScope = ScannerCountry | "ALL"

export interface ScannerResult {
  ticker: string
  name: string
  exchange: string
  country: ScannerCountry   // market country
  nativeCurrency: "USD" | "KRW"
  price: number
  changePercent: number
  volume: number
  avgVolume: number
  marketCap: number
  rsRating: number          // 1-99 William O'Neil RS Rating

  // Minervini Trend Template criteria
  above150MA: boolean       // price > 150-day MA
  above200MA: boolean       // price > 200-day MA
  ma150AboveMa200: boolean  // 150MA > 200MA
  ma200Trending: boolean    // 200MA trending up for 1+ month
  ma50AboveMa150: boolean   // 50MA > 150MA
  ma50AboveMa200: boolean   // 50MA > 200MA
  priceAboveMa50: boolean   // price > 50-day MA
  near52WeekHigh: boolean   // within 25% of 52-week high
  above52WeekLow: boolean   // 30%+ above 52-week low
  highRsRating: boolean     // RS Rating >= 70
  rs85Rating: boolean       // RS Rating >= 85
  near52WeekHigh15: boolean // within 15% of 52-week high
  priceMinOk: boolean       // minimum price filter
  liquidityOk: boolean      // minimum average volume filter
  turnoverOk: boolean       // minimum average traded value filter
  volumeSupport: boolean    // current volume not far below average

  // Values
  ma50: number
  ma150: number
  ma200: number
  high52w: number
  low52w: number
  qualityScore: number

  passCount: number         // how many criteria passed (max 10)
  passed: boolean           // 8+ criteria passed
  enhancedPassCount: number // stricter overlay conditions passed (max 7)
  enhancedPassed: boolean   // enhanced screen passed

  // Chart data
  priceHistory?: { date: string; price: number }[]
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  error?: string
  timestamp: string
}
