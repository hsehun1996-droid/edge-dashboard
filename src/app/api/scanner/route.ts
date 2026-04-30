/**
 * GET /api/scanner
 * Reads cached scanner results from SQLite.
 */

import { NextRequest, NextResponse } from "next/server"
import { getScannerDB, getSyncStatus } from "@/lib/db/scanner-db"
import { fetchKRStocks } from "@/lib/stock-universe/kr"
import type { ScannerResult } from "@/types"

export const dynamic = "force-dynamic"

const KR_NAME_REFRESH_TTL = 15 * 60 * 1000
const scannerNameState = globalThis as typeof globalThis & {
  _scannerKrNameRefreshAt?: number
  _scannerKrNameRefreshPromise?: Promise<void>
}

interface CacheRow {
  ticker: string
  name: string | null
  exchange: string | null
  country: string | null
  scanned_at: string
  price: number
  change_pct: number
  volume: number
  avg_volume: number
  market_cap: number
  rs_rating: number
  ma50: number
  ma150: number
  ma200: number
  high52w: number
  low52w: number
  pass_count: number
  passed: number
  above150ma: number
  above200ma: number
  ma150_above_ma200: number
  ma200_trending: number
  ma50_above_ma150: number
  ma50_above_ma200: number
  price_above_ma50: number
  near52w_high: number
  above52w_low: number
  high_rs_rating: number
  rs85_rating: number
  near52w_high_15: number
  price_min_ok: number
  liquidity_ok: number
  turnover_ok: number
  volume_support: number
  enhanced_pass_count: number
  enhanced_passed: number
  quality_score: number
  price_history: string
}

function toResult(r: CacheRow): ScannerResult {
  const country = (r.country ?? "US") as "US" | "KR"

  return {
    ticker: r.ticker,
    name: r.name ?? r.ticker,
    exchange: r.exchange ?? "",
    country,
    nativeCurrency: country === "KR" ? "KRW" : "USD",
    price: r.price,
    changePercent: r.change_pct,
    volume: r.volume,
    avgVolume: r.avg_volume,
    marketCap: r.market_cap,
    rsRating: r.rs_rating,
    ma50: r.ma50,
    ma150: r.ma150,
    ma200: r.ma200,
    high52w: r.high52w,
    low52w: r.low52w,
    passCount: r.pass_count,
    passed: r.passed === 1,
    above150MA: r.above150ma === 1,
    above200MA: r.above200ma === 1,
    ma150AboveMa200: r.ma150_above_ma200 === 1,
    ma200Trending: r.ma200_trending === 1,
    ma50AboveMa150: r.ma50_above_ma150 === 1,
    ma50AboveMa200: r.ma50_above_ma200 === 1,
    priceAboveMa50: r.price_above_ma50 === 1,
    near52WeekHigh: r.near52w_high === 1,
    above52WeekLow: r.above52w_low === 1,
    highRsRating: r.high_rs_rating === 1,
    rs85Rating: r.rs85_rating === 1,
    near52WeekHigh15: r.near52w_high_15 === 1,
    priceMinOk: r.price_min_ok === 1,
    liquidityOk: r.liquidity_ok === 1,
    turnoverOk: r.turnover_ok === 1,
    volumeSupport: r.volume_support === 1,
    enhancedPassCount: r.enhanced_pass_count,
    enhancedPassed: r.enhanced_passed === 1,
    qualityScore: r.quality_score,
    priceHistory: (() => {
      try {
        return JSON.parse(r.price_history ?? "[]")
      } catch {
        return []
      }
    })(),
  }
}

function shouldRefreshKoreanNames(country: string | null) {
  return country == null || country === "KR"
}

async function refreshKoreanNames() {
  const now = Date.now()
  if (
    scannerNameState._scannerKrNameRefreshAt &&
    now - scannerNameState._scannerKrNameRefreshAt < KR_NAME_REFRESH_TTL
  ) {
    return
  }

  if (!scannerNameState._scannerKrNameRefreshPromise) {
    scannerNameState._scannerKrNameRefreshPromise = (async () => {
      const krStocks = await fetchKRStocks()
      if (krStocks.length === 0) return

      const db = getScannerDB()
      const updateStocks = db.prepare(
        "UPDATE stocks SET name = ?, exchange = ?, updated_at = datetime('now') WHERE ticker = ? AND country = 'KR'"
      )
      const updateScanCache = db.prepare(
        "UPDATE scan_cache SET name = ?, exchange = ? WHERE ticker = ? AND country = 'KR'"
      )

      const tx = db.transaction(() => {
        for (const stock of krStocks) {
          updateStocks.run(stock.name, stock.exchange, stock.ticker)
          updateScanCache.run(stock.name, stock.exchange, stock.ticker)
        }
      })

      tx()
      scannerNameState._scannerKrNameRefreshAt = Date.now()
    })().finally(() => {
      scannerNameState._scannerKrNameRefreshPromise = undefined
    })
  }

  await scannerNameState._scannerKrNameRefreshPromise
}

export async function GET(req: NextRequest) {
  const timestamp = new Date().toISOString()

  try {
    const db = getScannerDB()
    const status = getSyncStatus()

    const { cnt } = db.prepare("SELECT COUNT(*) AS cnt FROM scan_cache").get() as { cnt: number }
    if (cnt === 0) {
      return NextResponse.json({
        needsSync: true,
        syncStatus: status,
        timestamp,
      })
    }

    const url = new URL(req.url)
    const country = url.searchParams.get("country")
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "2000", 10), 10_000)
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10)

    if (shouldRefreshKoreanNames(country)) {
      try {
        await refreshKoreanNames()
      } catch (error) {
        console.error("[scanner] failed to refresh KR stock names:", error)
      }
    }

    const where = country ? "WHERE country = ?" : ""
    const args = country ? [country, limit, offset] : [limit, offset]

    const rows = db.prepare(
      `SELECT * FROM scan_cache ${where} ORDER BY enhanced_passed DESC, quality_score DESC, rs_rating DESC LIMIT ? OFFSET ?`
    ).all(...args) as CacheRow[]

    const all = rows.map(toResult)
    const passed = all.filter((r) => r.enhancedPassed)

    return NextResponse.json({
      data: { passed, all },
      syncStatus: status,
      total: cnt,
      timestamp,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg, timestamp }, { status: 500 })
  }
}
