import { NextResponse } from "next/server"

export interface KrxStock {
  ticker: string // e.g. "005930.KS"
  name: string
  exchange: "KOSPI" | "KOSDAQ"
  currency: "KRW"
  flag: "🇰🇷"
  type: string
}

// ─── 서버 메모리 캐시 (24시간) ────────────────────────────────────────────────
let cache: KrxStock[] | null = null
let cacheTs = 0
const CACHE_TTL = 24 * 60 * 60 * 1000

const KR_ETF_RE = /^(KODEX|TIGER|ARIRANG|KBSTAR|HANARO|ACE|RISE|SOL|TIMEFOLIO|KOSEF|PLUS|MASTER|SMART)\s/i

async function fetchAllKrxStocks(): Promise<KrxStock[]> {
  if (cache && Date.now() - cacheTs < CACHE_TTL) return cache

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
        "Referer": "https://data.krx.co.kr/",
        "Accept": "application/json, text/javascript, */*",
      },
      body: body.toString(),
      cache: "no-store",
    })

    if (!res.ok) return []
    const json = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const block1: any[] = json.block1 ?? []

    const results: KrxStock[] = block1
      .map((item) => {
        const code: string = item.short_code ?? ""
        const name: string = item.codeName ?? ""
        if (!code || !name || !/^\d{6}$/.test(code)) return null

        const isKosdaq = item.marketCode === "KSQ"
        const exchange = isKosdaq ? "KOSDAQ" : "KOSPI"
        const ticker = `${code}.${isKosdaq ? "KQ" : "KS"}`

        return {
          ticker,
          name,
          exchange,
          currency: "KRW" as const,
          flag: "🇰🇷" as const,
          type: KR_ETF_RE.test(name) ? "ETF" : "주식",
        }
      })
      .filter((x): x is KrxStock => x !== null)

    cache = results
    cacheTs = Date.now()
    return results
  } catch {
    return cache ?? []
  }
}

export async function GET() {
  const stocks = await fetchAllKrxStocks()
  return NextResponse.json(
    { data: stocks, count: stocks.length },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
      },
    }
  )
}
