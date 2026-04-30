/**
 * Scanner Sync Engine
 *
 * Full sync  : 전종목 1년 시세 수집 -> DB 저장 -> Minervini 스캔
 * Incremental: 최신 5일치만 업데이트 후 재스캔
 */

import { getScannerDB, updateSyncStatus } from "@/lib/db/scanner-db"
import { fetchUSStocks } from "@/lib/stock-universe/us"
import { fetchKRStocks } from "@/lib/stock-universe/kr"
import type { ScannerCountry, ScannerScope } from "@/types"

const _g = globalThis as unknown as { _scannerSyncing?: boolean }
export const isSyncing = () => _g._scannerSyncing ?? false
const setRunning = (v: boolean) => { _g._scannerSyncing = v }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

async function yahooChart(
  ticker: string,
  range: "1y" | "5d"
): Promise<{
  dates: string[]
  closes: number[]
  volumes: number[]
  price: number
  changePct: number
  volume: number
  avgVolume: number
  marketCap: number
  name: string
  exchange: string
} | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${range}`

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(20_000),
    })

    if (res.status === 429) return null
    if (!res.ok) return null

    const json = await res.json()
    const result = json.chart?.result?.[0]
    if (!result) return null

    const meta: Record<string, unknown> = result.meta ?? {}
    const timestamps: number[] = result.timestamp ?? []
    const quoteData = result.indicators?.quote?.[0] ?? {}
    const rawCloses: Array<number | null> = quoteData.close ?? []
    const rawVols: Array<number | null> = quoteData.volume ?? []

    const dates: string[] = []
    const closes: number[] = []
    const volumes: number[] = []

    for (let i = 0; i < timestamps.length; i++) {
      if (rawCloses[i] != null && rawCloses[i]! > 0) {
        dates.push(new Date(timestamps[i] * 1000).toISOString().split("T")[0])
        closes.push(rawCloses[i]!)
        volumes.push(rawVols[i] ?? 0)
      }
    }

    return {
      dates,
      closes,
      volumes,
      price: (meta.regularMarketPrice as number) ?? closes[closes.length - 1] ?? 0,
      changePct: (meta.regularMarketChangePercent as number) ?? 0,
      volume: (meta.regularMarketVolume as number) ?? 0,
      avgVolume: (meta.averageDailyVolume3Month as number) ?? 0,
      marketCap: (meta.marketCap as number) ?? 0,
      name: (meta.longName as string) ?? ticker,
      exchange: (meta.fullExchangeName as string) ?? "",
    }
  } catch {
    return null
  }
}

function getScopeLabel(scope: ScannerScope): string {
  return scope === "ALL" ? "전체" : scope === "US" ? "미국" : "한국"
}

function getCountriesForScope(scope: ScannerScope): ScannerCountry[] {
  return scope === "ALL" ? ["US", "KR"] : [scope]
}

async function syncUniverse(scope: ScannerScope): Promise<Array<{ ticker: string; country: ScannerCountry }>> {
  updateSyncStatus({
    status: "running",
    phase: "universe",
    message: `${getScopeLabel(scope)} 종목 목록 수집 중...`,
  })

  const usPromise = scope !== "KR" ? fetchUSStocks() : Promise.resolve([])
  const krPromise = scope !== "US" ? fetchKRStocks() : Promise.resolve([])
  const [us, kr] = await Promise.allSettled([usPromise, krPromise])

  const usStocks = us.status === "fulfilled" ? us.value : []
  const krStocks = kr.status === "fulfilled" ? kr.value : []

  if (scope !== "KR" && us.status === "rejected") console.error("[sync] US universe failed:", us.reason)
  if (scope !== "US" && kr.status === "rejected") console.error("[sync] KR universe failed:", kr.reason)

  const all = [...usStocks, ...krStocks]

  const db = getScannerDB()
  const insert = db.prepare(`
    INSERT OR REPLACE INTO stocks(ticker, name, exchange, country, active, updated_at)
    VALUES (?, ?, ?, ?, 1, datetime('now'))
  `)

  const tx = db.transaction(() => {
    for (const stock of all) {
      insert.run(stock.ticker, stock.name, stock.exchange, stock.country)
    }
  })

  tx()

  return all.map((stock) => ({ ticker: stock.ticker, country: stock.country as ScannerCountry }))
}

async function syncPrices(
  stocks: Array<{ ticker: string; country: ScannerCountry }>,
  range: "1y" | "5d"
): Promise<void> {
  const db = getScannerDB()
  const total = stocks.length
  let success = 0
  let failed = 0

  const recentCutoff = range === "5d"
    ? new Date(Date.now() - 3 * 86_400_000).toISOString().split("T")[0]
    : new Date(Date.now() - 7 * 86_400_000).toISOString().split("T")[0]

  type HasRow = { ticker: string }
  const hasRecent = new Set<string>(
    (db.prepare(
      `SELECT DISTINCT ticker FROM daily_prices WHERE date >= ? AND ticker IN (${stocks.map(() => "?").join(",")})`
    ).all(recentCutoff, ...stocks.map((stock) => stock.ticker)) as HasRow[]).map((row) => row.ticker)
  )

  const toFetch = range === "5d"
    ? stocks.filter((stock) => !hasRecent.has(stock.ticker))
    : stocks

  updateSyncStatus({
    phase: "prices",
    total,
    success: 0,
    failed: 0,
    message: `시세 수집 중... (${toFetch.length.toLocaleString()}개 대상)`,
  })

  const insertPrice = db.prepare(
    "INSERT OR REPLACE INTO daily_prices(ticker, date, close, volume) VALUES (?, ?, ?, ?)"
  )
  const updateMeta = db.prepare(
    "UPDATE stocks SET name = ?, exchange = ?, updated_at = datetime('now') WHERE ticker = ? AND (name = '' OR name = ticker)"
  )

  const saveBatch = db.transaction(
    (rows: Array<{ ticker: string; date: string; close: number; volume: number; name: string; exchange: string }>) => {
      for (const row of rows) {
        insertPrice.run(row.ticker, row.date, row.close, row.volume)
        updateMeta.run(row.name, row.exchange, row.ticker)
      }
    }
  )

  const BATCH = 8
  let rateLimitPause = false

  for (let i = 0; i < toFetch.length; i += BATCH) {
    if (rateLimitPause) {
      await sleep(30_000)
      rateLimitPause = false
    }

    const batch = toFetch.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(async ({ ticker }) => {
        const data = await yahooChart(ticker, range)
        if (!data || data.closes.length < (range === "1y" ? 50 : 1)) {
          throw new Error("insufficient data")
        }
        return { ticker, data }
      })
    )

    const toSave: Array<{
      ticker: string
      date: string
      close: number
      volume: number
      name: string
      exchange: string
    }> = []

    for (const result of results) {
      if (result.status === "fulfilled") {
        const { ticker, data } = result.value
        success++

        for (let j = 0; j < data.dates.length; j++) {
          toSave.push({
            ticker,
            date: data.dates[j],
            close: data.closes[j],
            volume: data.volumes[j],
            name: data.name,
            exchange: data.exchange,
          })
        }
      } else {
        failed++
        const msg = String(result.reason)
        if (msg.includes("429")) rateLimitPause = true
      }
    }

    if (toSave.length) saveBatch(toSave)

    if ((i / BATCH) % 10 === 0) {
      updateSyncStatus({
        success,
        failed,
        message: `시세 수집 중... ${success + failed}/${total}`,
      })
    }

    if (i + BATCH < toFetch.length) {
      await sleep(200 + Math.random() * 200)
    }
  }

  success += hasRecent.size
  updateSyncStatus({ success, failed })
}

interface AggRow {
  ticker: string
  ma50: number | null
  ma150: number | null
  ma200: number | null
  ma200_21d: number | null
  high52w: number | null
  low52w: number | null
  price: number | null
  p10: number | null
  p21: number | null
  p63: number | null
  p252: number | null
  day_count: number
  volume: number | null
  avg_vol30: number | null
}

interface PriceHistRow {
  ticker: string
  date: string
  close: number
}

interface StockMeta {
  ticker: string
  name: string
  exchange: string
  market_cap: number | null
  change_pct: number | null
}

interface ScannerThresholds {
  minPrice: number
  minAvgVolume: number
  minTurnover: number
}

function getThresholds(country: ScannerCountry): ScannerThresholds {
  return country === "US"
    ? { minPrice: 10, minAvgVolume: 200_000, minTurnover: 25_000_000 }
    : { minPrice: 5_000, minAvgVolume: 100_000, minTurnover: 10_000_000_000 }
}

async function scanCountry(country: ScannerCountry): Promise<void> {
  const db = getScannerDB()

  const aggRows = db.prepare(`
    WITH ranked AS (
      SELECT dp.ticker, dp.close, dp.volume,
             ROW_NUMBER() OVER (PARTITION BY dp.ticker ORDER BY dp.date DESC) AS rn
      FROM daily_prices dp
      JOIN stocks s ON s.ticker = dp.ticker
      WHERE s.country = ? AND s.active = 1
    )
    SELECT
      ticker,
      AVG(CASE WHEN rn <= 50   THEN close END)            AS ma50,
      AVG(CASE WHEN rn <= 150  THEN close END)            AS ma150,
      AVG(CASE WHEN rn <= 200  THEN close END)            AS ma200,
      AVG(CASE WHEN rn BETWEEN 22 AND 221 THEN close END) AS ma200_21d,
      MAX(CASE WHEN rn <= 252  THEN close END)            AS high52w,
      MIN(CASE WHEN rn <= 252  THEN close END)            AS low52w,
      MAX(CASE WHEN rn = 1     THEN close END)            AS price,
      MAX(CASE WHEN rn = 11    THEN close END)            AS p10,
      MAX(CASE WHEN rn = 22    THEN close END)            AS p21,
      MAX(CASE WHEN rn = 64    THEN close END)            AS p63,
      MAX(CASE WHEN rn = 253   THEN close END)            AS p252,
      AVG(CASE WHEN rn <= 2    THEN close END)            AS avg_close2,
      SUM(CASE WHEN rn = 1     THEN volume END)           AS volume,
      AVG(CASE WHEN rn <= 30   THEN volume END)           AS avg_vol30,
      COUNT(*)                                            AS day_count
    FROM ranked
    WHERE rn <= 253
    GROUP BY ticker
    HAVING day_count >= 200
  `).all(country) as AggRow[]

  if (aggRows.length === 0) return

  const scores = aggRows.map((row) => {
    const price = row.price ?? 0
    const ret = (base: number | null) => (base && base > 0 ? price / base - 1 : 0)
    const score =
      ret(row.p252) * 0.4 +
      ret(row.p63) * 0.2 +
      ret(row.p21) * 0.2 +
      ret(row.p10) * 0.2

    return { ticker: row.ticker, score }
  })

  const sorted = [...scores].sort((a, b) => a.score - b.score)
  const n = sorted.length
  const rsOf = (ticker: string): number => {
    const sc = scores.find((score) => score.ticker === ticker)?.score ?? 0
    const rank = sorted.filter((score) => score.score <= sc).length
    return Math.min(99, Math.max(1, Math.round((rank / n) * 99) + 1))
  }

  const histRows = db.prepare(`
    WITH ranked AS (
      SELECT dp.ticker, dp.date, dp.close,
             ROW_NUMBER() OVER (PARTITION BY dp.ticker ORDER BY dp.date DESC) AS rn
      FROM daily_prices dp
      JOIN stocks s ON s.ticker = dp.ticker
      WHERE s.country = ? AND s.active = 1
    )
    SELECT ticker, date, close FROM ranked WHERE rn <= 60
    ORDER BY ticker, date ASC
  `).all(country) as PriceHistRow[]

  const histMap = new Map<string, Array<{ date: string; price: number }>>()
  for (const row of histRows) {
    const arr = histMap.get(row.ticker) ?? []
    arr.push({ date: row.date, price: row.close })
    histMap.set(row.ticker, arr)
  }

  const metas = db.prepare(
    "SELECT ticker, name, exchange FROM stocks WHERE country = ? AND active = 1"
  ).all(country) as StockMeta[]
  const metaMap = new Map(metas.map((meta) => [meta.ticker, meta]))
  const thresholds = getThresholds(country)

  const insertScan = db.prepare(`
    INSERT OR REPLACE INTO scan_cache (
      ticker, name, exchange, country, scanned_at,
      price, change_pct, volume, avg_volume, market_cap,
      rs_rating, ma50, ma150, ma200, high52w, low52w,
      pass_count, passed,
      above150ma, above200ma, ma150_above_ma200, ma200_trending,
      ma50_above_ma150, ma50_above_ma200, price_above_ma50,
      near52w_high, above52w_low, high_rs_rating,
      rs85_rating, near52w_high_15, price_min_ok, liquidity_ok,
      turnover_ok, volume_support, enhanced_pass_count, enhanced_passed, quality_score,
      price_history
    ) VALUES (
      ?, ?, ?, ?, datetime('now'),
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?
    )
  `)

  const saveTx = db.transaction(() => {
    for (const row of aggRows) {
      const price = row.price ?? 0
      const ma50 = row.ma50 ?? 0
      const ma150 = row.ma150 ?? 0
      const ma200 = row.ma200 ?? 0
      const ma200_21 = row.ma200_21d ?? 0
      const high52w = row.high52w ?? 0
      const low52w = row.low52w ?? 0
      const rsRating = rsOf(row.ticker)
      const volume = row.volume ?? 0
      const avgVol = Math.round(row.avg_vol30 ?? 0)
      const avgTurnover = price * avgVol

      const hist = histMap.get(row.ticker) ?? []
      const changePct = hist.length >= 2
        ? ((hist[hist.length - 1].price / hist[hist.length - 2].price) - 1) * 100
        : 0

      const above150ma = ma150 > 0 && price > ma150
      const above200ma = ma200 > 0 && price > ma200
      const ma150AboveMa200 = ma200 > 0 && ma150 > ma200
      const ma200Trending = ma200_21 > 0 && ma200 > ma200_21
      const ma50AboveMa150 = ma150 > 0 && ma50 > ma150
      const ma50AboveMa200 = ma200 > 0 && ma50 > ma200
      const priceAboveMa50 = ma50 > 0 && price > ma50
      const near52wHigh = high52w > 0 && price >= high52w * 0.75
      const near52wHigh15 = high52w > 0 && price >= high52w * 0.85
      const above52wLow = low52w > 0 && price >= low52w * 1.30
      const highRsRating = rsRating >= 70
      const rs85Rating = rsRating >= 85
      const priceMinOk = price >= thresholds.minPrice
      const liquidityOk = avgVol >= thresholds.minAvgVolume
      const turnoverOk = avgTurnover >= thresholds.minTurnover
      const volumeSupport = avgVol > 0 && volume >= avgVol * 0.8

      const criteria = [
        above150ma,
        above200ma,
        ma150AboveMa200,
        ma200Trending,
        ma50AboveMa150,
        ma50AboveMa200,
        priceAboveMa50,
        near52wHigh,
        above52wLow,
        highRsRating,
      ]
      const passCount = criteria.filter(Boolean).length
      const passed = passCount >= 8

      const enhancedCriteria = [
        passed,
        rs85Rating,
        near52wHigh15,
        priceMinOk,
        liquidityOk,
        turnoverOk,
        volumeSupport,
      ]
      const enhancedPassCount = enhancedCriteria.filter(Boolean).length
      const enhancedPassed = enhancedPassCount >= 6

      const qualityScore =
        passCount * 6 +
        (enhancedPassed ? 18 : 0) +
        (rsRating >= 90 ? 12 : rs85Rating ? 8 : highRsRating ? 4 : 0) +
        (near52wHigh15 ? 8 : near52wHigh ? 4 : 0) +
        (priceMinOk ? 6 : 0) +
        (liquidityOk ? 8 : 0) +
        (turnoverOk ? 10 : 0) +
        (volumeSupport ? 6 : 0)

      const meta = metaMap.get(row.ticker)

      insertScan.run(
        row.ticker, meta?.name ?? row.ticker, meta?.exchange ?? country, country,
        price, changePct, volume, avgVol, 0,
        rsRating, ma50, ma150, ma200, high52w, low52w,
        passCount, passed ? 1 : 0,
        above150ma ? 1 : 0,
        above200ma ? 1 : 0,
        ma150AboveMa200 ? 1 : 0,
        ma200Trending ? 1 : 0,
        ma50AboveMa150 ? 1 : 0,
        ma50AboveMa200 ? 1 : 0,
        priceAboveMa50 ? 1 : 0,
        near52wHigh ? 1 : 0,
        above52wLow ? 1 : 0,
        highRsRating ? 1 : 0,
        rs85Rating ? 1 : 0,
        near52wHigh15 ? 1 : 0,
        priceMinOk ? 1 : 0,
        liquidityOk ? 1 : 0,
        turnoverOk ? 1 : 0,
        volumeSupport ? 1 : 0,
        enhancedPassCount,
        enhancedPassed ? 1 : 0,
        qualityScore,
        JSON.stringify(hist)
      )
    }
  })

  saveTx()
}

function countScanCache(scope: ScannerScope): number {
  const db = getScannerDB()
  const countries = getCountriesForScope(scope)

  if (scope === "ALL") {
    return (db.prepare("SELECT COUNT(*) AS cnt FROM scan_cache").get() as { cnt: number }).cnt
  }

  const placeholders = countries.map(() => "?").join(",")
  return (
    db.prepare(`SELECT COUNT(*) AS cnt FROM scan_cache WHERE country IN (${placeholders})`)
      .get(...countries) as { cnt: number }
  ).cnt
}

export async function runFullSync(scope: ScannerScope = "ALL"): Promise<void> {
  if (isSyncing()) return
  setRunning(true)

  const db = getScannerDB()
  db.prepare(`
    UPDATE sync_status
    SET status='running',
        sync_type='full',
        scope=?,
        phase='universe',
        total=0,
        success=0,
        failed=0,
        started_at=datetime('now'),
        updated_at=datetime('now'),
        message=?
    WHERE id=1
  `).run(scope, `${getScopeLabel(scope)} 전체 동기화 시작 중...`)

  try {
    const stocks = await syncUniverse(scope)
    await syncPrices(stocks, "1y")

    updateSyncStatus({
      phase: "scan",
      message: `${getScopeLabel(scope)} Minervini 스캔 계산 중...`,
    })

    for (const country of getCountriesForScope(scope)) {
      await scanCountry(country)
    }

    const count = countScanCache(scope)
    updateSyncStatus({
      status: "completed",
      phase: "done",
      scan_count: count,
      last_scan_at: new Date().toISOString(),
      message: `${getScopeLabel(scope)} 전체 동기화 완료 · ${count.toLocaleString()}개 종목`,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류"
    updateSyncStatus({ status: "failed", message: msg })
    console.error("[sync] full sync failed:", e)
  } finally {
    setRunning(false)
  }
}

export async function runIncrementalSync(scope: ScannerScope = "ALL"): Promise<void> {
  if (isSyncing()) return
  setRunning(true)

  const db = getScannerDB()
  db.prepare(`
    UPDATE sync_status
    SET status='running',
        sync_type='incremental',
        scope=?,
        phase='prices',
        total=0,
        success=0,
        failed=0,
        started_at=datetime('now'),
        updated_at=datetime('now'),
        message=?
    WHERE id=1
  `).run(scope, `${getScopeLabel(scope)} 증분 업데이트 시작 중...`)

  try {
    type StockRow = { ticker: string; country: ScannerCountry }
    const stocks = (
      scope === "ALL"
        ? db.prepare("SELECT ticker, country FROM stocks WHERE active = 1").all()
        : db.prepare("SELECT ticker, country FROM stocks WHERE active = 1 AND country = ?").all(scope)
    ) as StockRow[]

    if (stocks.length === 0) {
      setRunning(false)
      await runFullSync(scope)
      return
    }

    updateSyncStatus({
      phase: "prices",
      total: stocks.length,
      message: `${getScopeLabel(scope)} 증분 업데이트 중...`,
    })
    await syncPrices(stocks, "5d")

    updateSyncStatus({
      phase: "scan",
      message: `${getScopeLabel(scope)} 재스캔 중...`,
    })

    for (const country of getCountriesForScope(scope)) {
      await scanCountry(country)
    }

    const count = countScanCache(scope)
    updateSyncStatus({
      status: "completed",
      phase: "done",
      scan_count: count,
      last_scan_at: new Date().toISOString(),
      message: `${getScopeLabel(scope)} 증분 업데이트 완료 · ${count.toLocaleString()}개 종목`,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류"
    updateSyncStatus({ status: "failed", message: msg })
    console.error("[sync] incremental sync failed:", e)
  } finally {
    setRunning(false)
  }
}
