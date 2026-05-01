import { NextResponse } from "next/server"
import type { MarketIndex, Sector } from "@/types"
import { generateSparkline } from "@/lib/market-data"
import { withCache } from "@/lib/server-cache"

const CACHE_TTL = 5 * 60 * 1000 // 5분

// ─── Yahoo Finance v8 (unofficial, no API key required) ─────────────────────
const YF_BASE = "https://query1.finance.yahoo.com/v8/finance/spark"

const INDICES: Array<{
  ticker: string
  country: string
  countryCode: string
  flag: string
  name: string
}> = [
  { ticker: "^GSPC",    country: "미국",   countryCode: "US", flag: "🇺🇸", name: "S&P 500" },
  { ticker: "^NDX",     country: "미국",   countryCode: "US", flag: "🇺🇸", name: "NASDAQ 100" },
  { ticker: "^KS11",    country: "한국",   countryCode: "KR", flag: "🇰🇷", name: "KOSPI" },
  { ticker: "^KQ11",    country: "한국",   countryCode: "KR", flag: "🇰🇷", name: "KOSDAQ" },
  { ticker: "000001.SS",country: "중국",   countryCode: "CN", flag: "🇨🇳", name: "상해종합" },
  { ticker: "^N225",    country: "일본",   countryCode: "JP", flag: "🇯🇵", name: "닛케이 225" },
  { ticker: "^BSESN",   country: "인도",   countryCode: "IN", flag: "🇮🇳", name: "SENSEX" },
  { ticker: "IMOEX.ME", country: "러시아", countryCode: "RU", flag: "🇷🇺", name: "MOEX Russia" },
  { ticker: "^FTSE",    country: "영국",   countryCode: "GB", flag: "🇬🇧", name: "FTSE 100" },
  { ticker: "^GDAXI",   country: "독일",   countryCode: "DE", flag: "🇩🇪", name: "DAX 40" },
  { ticker: "^BVSP",    country: "브라질", countryCode: "BR", flag: "🇧🇷", name: "BOVESPA" },
]

async function fetchQuote(ticker: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1mo`
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 300 },
  })
  if (!res.ok) throw new Error(`Yahoo Finance error for ${ticker}: ${res.status}`)
  const json = await res.json()
  return json.chart?.result?.[0]
}

async function fetchAllIndices(): Promise<MarketIndex[]> {
  const fetchedAt = new Date().toISOString()
  const results = await Promise.allSettled(INDICES.map((idx) => fetchQuote(idx.ticker)))

  return INDICES.map((meta, i) => {
    const result = results[i]

    if (result.status === "rejected" || !result.value) {
      const seed = meta.ticker.charCodeAt(0) * 31 + meta.ticker.charCodeAt(1)
      const sparkline = generateSparkline(seed)
      const price = 10000 + (seed % 5000)
      const changePct = ((seed % 400) - 200) / 100
      return {
        country: meta.country,
        countryCode: meta.countryCode,
        flag: meta.flag,
        name: meta.name,
        ticker: meta.ticker,
        price,
        change: price * changePct / 100,
        changePercent: changePct,
        volume: (seed % 1_000_000) * 100,
        lastUpdated: fetchedAt,
        sparkline,
        _isMock: true,
      } as MarketIndex & { _isMock: boolean }
    }

    const data = result.value
    const meta2 = data.meta
    const closes: number[] = data.indicators?.quote?.[0]?.close ?? []
    const validCloses = closes.filter((v): v is number => v != null && v > 0)
    const current = meta2.regularMarketPrice ?? validCloses[validCloses.length - 1] ?? 0

    // marketState: "REGULAR" = 장중, "CLOSED"/"PRE"/"POST" = 장외
    const isMarketOpen = (meta2.marketState ?? "CLOSED") === "REGULAR"
    const prev = isMarketOpen
      ? (validCloses[validCloses.length - 1] ?? current)
      : (validCloses[validCloses.length - 2] ?? validCloses[validCloses.length - 1] ?? current)

    const change = current - prev
    const changePercent = prev ? (change / prev) * 100 : 0
    const sparkline = validCloses.slice(-30)

    return {
      country: meta.country,
      countryCode: meta.countryCode,
      flag: meta.flag,
      name: meta.name,
      ticker: meta.ticker,
      price: current,
      change,
      changePercent,
      volume: meta2.regularMarketVolume ?? 0,
      lastUpdated: fetchedAt,
      sparkline,
    } satisfies MarketIndex
  })
}

export async function GET() {
  const timestamp = new Date().toISOString()

  try {
    const indices = await withCache("market:indices", CACHE_TTL, fetchAllIndices)

    return NextResponse.json(
      { data: indices, timestamp },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } }
    )
  } catch (err) {
    return NextResponse.json(
      { error: "시장 데이터를 불러오는 중 오류가 발생했어요.", timestamp },
      { status: 500 }
    )
  }
}
