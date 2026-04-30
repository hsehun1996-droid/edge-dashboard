import { NextResponse } from "next/server"
import {
  fetchKisDomesticQuote,
  fetchKisOverseasQuote,
  tickerToKisExcd,
} from "@/lib/kis"

export interface PriceQuote {
  price: number
  changePercent: number
}

// ─── Yahoo Finance 폴백 ───────────────────────────────────────────────────────
async function fetchYahooQuote(ticker: string): Promise<PriceQuote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 60 },
  })
  if (!res.ok) return null
  const json = await res.json()
  const meta = json.chart?.result?.[0]?.meta
  const price = meta?.regularMarketPrice
  if (!price) return null
  return {
    price,
    changePercent: meta?.regularMarketChangePercent ?? 0,
  }
}

// ─── 한국 종목 감지 ───────────────────────────────────────────────────────────
function parseKrTicker(ticker: string): { code: string; altSuffix: string } | null {
  const m = ticker.match(/^(\d{6})\.(KS|KQ)$/i)
  if (!m) return null
  return { code: m[1], altSuffix: m[2].toUpperCase() === "KS" ? "KQ" : "KS" }
}

// ─── 단일 티커 시세 조회 ──────────────────────────────────────────────────────
async function resolveQuote(ticker: string): Promise<PriceQuote | null> {
  const kisEnabled = !!(process.env.KIS_APP_KEY && process.env.KIS_APP_SECRET)
  const kr = parseKrTicker(ticker)

  if (kr) {
    if (kisEnabled) {
      const quote = await fetchKisDomesticQuote(kr.code)
      if (quote) return { price: quote.price, changePercent: quote.changePercent }
    }
    let q = await fetchYahooQuote(ticker)
    if (!q) q = await fetchYahooQuote(`${kr.code}.${kr.altSuffix}`)
    return q
  }

  if (kisEnabled) {
    const excd = tickerToKisExcd(ticker)
    if (excd) {
      const symb = ticker.replace(/\.[A-Z]+$/i, "")
      let quote = await fetchKisOverseasQuote(excd, symb)
      if (!quote && excd === "NAS") quote = await fetchKisOverseasQuote("NYS", symb)
      if (quote) return { price: quote.price, changePercent: quote.changePercent }
    }
  }

  return fetchYahooQuote(ticker)
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tickers = searchParams.get("tickers")?.split(",").filter(Boolean) ?? []

  if (!tickers.length) {
    return NextResponse.json({ data: {} })
  }

  const prices: Record<string, PriceQuote> = {}

  await Promise.allSettled(
    tickers.map(async (ticker) => {
      try {
        const quote = await resolveQuote(ticker)
        if (quote) prices[ticker] = quote
      } catch {
        // 실패 무시
      }
    })
  )

  return NextResponse.json({ data: prices })
}
