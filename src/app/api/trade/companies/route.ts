import { NextResponse } from "next/server"
import { getCompanyHsCatalog, getCompanyNormalizedHsCodes } from "@/lib/company-hs-catalog"
import { fetchKisDomesticQuote } from "@/lib/kis"

interface KrxStock {
  ticker: string
  name: string
  exchange: "KOSPI" | "KOSDAQ"
}

interface CompanySummary {
  companyName: string
  ticker?: string
  exchange?: "KOSPI" | "KOSDAQ"
  marketCap: number
  itemCount: number
}

const CACHE_TTL = 24 * 60 * 60 * 1000
const CACHE_TTL_SHORT = 5 * 60 * 1000
const KR_ETF_RE = /^(KODEX|TIGER|ARIRANG|KBSTAR|HANARO|ACE|RISE|SOL|TIMEFOLIO|KOSEF|PLUS|MASTER|SMART)\s/i

let krxCache: { data: KrxStock[]; ts: number } | null = null
let companyCache: { data: CompanySummary[]; ts: number } | null = null
let inflightCompanyLoad: Promise<CompanySummary[]> | null = null

function normalizeCompanyName(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/\(주\)|주식회사|co\.?,?\s*ltd\.?|corp\.?|corporation|inc\.?/g, "")
    .replace(/[\s\-_/()[\].,&]+/g, "")
    .trim()
}

async function fetchAllKrxStocks(): Promise<KrxStock[]> {
  if (krxCache && Date.now() - krxCache.ts < CACHE_TTL) {
    return krxCache.data
  }

  try {
    const body = new URLSearchParams({
      bld: "dbms/comm/finder/finder_stkisu",
      mktsel: "ALL",
      searchText: "",
      pagePath: "/contents/MDC/MDIJ/mdij01/MDIJ010301",
    })

    const res = await fetch("https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd", {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Referer: "https://data.krx.co.kr/",
        Accept: "application/json, text/javascript, */*",
      },
      body: body.toString(),
      cache: "no-store",
    })

    if (!res.ok) return krxCache?.data ?? []

    const json = await res.json()
    const block1: Array<Record<string, unknown>> = Array.isArray(json.block1) ? json.block1 : []

    const stocks = block1
      .map((item) => {
        const code = typeof item.short_code === "string" ? item.short_code : ""
        const name = typeof item.codeName === "string" ? item.codeName : ""
        if (!code || !name || !/^\d{6}$/.test(code) || KR_ETF_RE.test(name)) return null

        const exchange = item.marketCode === "KSQ" ? "KOSDAQ" : "KOSPI"
        return {
          ticker: `${code}.${exchange === "KOSDAQ" ? "KQ" : "KS"}`,
          name,
          exchange,
        } satisfies KrxStock
      })
      .filter((stock): stock is KrxStock => stock !== null)

    krxCache = { data: stocks, ts: Date.now() }
    return stocks
  } catch {
    return krxCache?.data ?? []
  }
}

function findMatchingStock(companyName: string, stocks: KrxStock[]) {
  const normalizedCompany = normalizeCompanyName(companyName)
  if (!normalizedCompany) return undefined

  const exact = stocks.find((stock) => normalizeCompanyName(stock.name) === normalizedCompany)
  if (exact) return exact

  return stocks.find((stock) => {
    const normalizedStock = normalizeCompanyName(stock.name)
    return normalizedStock.includes(normalizedCompany) || normalizedCompany.includes(normalizedStock)
  })
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex
      nextIndex += 1
      results[current] = await mapper(items[current], current)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}

async function loadCompanySummaries() {
  if (companyCache && Date.now() - companyCache.ts < CACHE_TTL) {
    return companyCache.data
  }

  if (inflightCompanyLoad) {
    return inflightCompanyLoad
  }

  inflightCompanyLoad = (async () => {
    const catalog = getCompanyHsCatalog()
    const stocks = await fetchAllKrxStocks()

    const summaries = await mapWithConcurrency(catalog, 3, async (entry) => {
      const matched = findMatchingStock(entry.companyName, stocks)
      let marketCap = 0

      if (matched) {
        const code = matched.ticker.split(".")[0]
        const quote = await fetchKisDomesticQuote(code)
        marketCap = quote?.marketCap ?? 0
      }

      return {
        companyName: entry.companyName,
        ticker: matched?.ticker,
        exchange: matched?.exchange,
        marketCap,
        itemCount: getCompanyNormalizedHsCodes(entry.companyName).length,
      } satisfies CompanySummary
    })

    summaries.sort((a, b) => b.marketCap - a.marketCap || a.companyName.localeCompare(b.companyName))

    const liveCount = summaries.filter((s) => s.marketCap > 0).length
    if (liveCount > 0) {
      // 시총 데이터가 절반 미만이면 짧은 TTL로 캐싱 (재시도 유도)
      const ttl = liveCount >= summaries.length / 2 ? CACHE_TTL : CACHE_TTL_SHORT
      companyCache = { data: summaries, ts: Date.now() - (CACHE_TTL - ttl) }
    }
    // 시총이 하나도 없으면 캐시 안 함 (다음 요청 때 재시도)

    return summaries
  })()

  try {
    return await inflightCompanyLoad
  } finally {
    inflightCompanyLoad = null
  }
}

export async function GET() {
  const companies = await loadCompanySummaries()
  const hasLiveMarketCap = companies.some((company) => company.marketCap > 0)

  return NextResponse.json({
    data: companies,
    source: hasLiveMarketCap ? "live" : "catalog",
    timestamp: new Date().toISOString(),
  })
}
