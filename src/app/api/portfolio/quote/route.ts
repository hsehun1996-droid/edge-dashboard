import { NextResponse } from "next/server"
import type { KisQuote } from "@/lib/kis"
import { fetchKisDomesticQuote, fetchKisOverseasQuote, tickerToKisExcd } from "@/lib/kis"

// ─── 한국 종목 감지 ───────────────────────────────────────────────────────────
function parseKrTicker(ticker: string): { code: string; altSuffix: string } | null {
  const m = ticker.match(/^(\d{6})\.(KS|KQ)$/i)
  if (!m) return null
  return { code: m[1], altSuffix: m[2].toUpperCase() === "KS" ? "KQ" : "KS" }
}

// ─── Yahoo Finance 풀 시세 폴백 ──────────────────────────────────────────────
async function fetchYahooQuote(ticker: string): Promise<KisQuote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y`
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    const json = await res.json()
    const meta = json.chart?.result?.[0]?.meta
    if (!meta?.regularMarketPrice) return null

    return {
      price: meta.regularMarketPrice,
      change: meta.regularMarketChange ?? 0,
      changePercent: meta.regularMarketChangePercent ?? 0,
      volume: meta.regularMarketVolume ?? 0,
      high52w: meta.fiftyTwoWeekHigh ?? 0,
      low52w: meta.fiftyTwoWeekLow ?? 0,
      marketCap: meta.marketCap,
    }
  } catch {
    return null
  }
}

// ─── Route handler ─────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ticker = searchParams.get("ticker")?.trim()

  if (!ticker) {
    return NextResponse.json({ error: "ticker 파라미터가 필요합니다" }, { status: 400 })
  }

  const kisEnabled = !!(process.env.KIS_APP_KEY && process.env.KIS_APP_SECRET)
  const kr = parseKrTicker(ticker)

  // 국내 주식
  if (kr) {
    if (kisEnabled) {
      const quote = await fetchKisDomesticQuote(kr.code)
      if (quote) return NextResponse.json({ data: quote })
    }
    // KIS 실패 시 Yahoo 폴백
    const quote = await fetchYahooQuote(ticker)
      ?? await fetchYahooQuote(`${kr.code}.${kr.altSuffix}`)
    if (quote) return NextResponse.json({ data: quote })
    return NextResponse.json({ error: "시세 조회 실패" }, { status: 502 })
  }

  // 해외 주식
  if (kisEnabled) {
    const excd = tickerToKisExcd(ticker)
    if (excd) {
      const symb = ticker.replace(/\.[A-Z]+$/i, "")
      let quote = await fetchKisOverseasQuote(excd, symb)
      if (!quote && excd === "NAS") quote = await fetchKisOverseasQuote("NYS", symb)
      if (quote) return NextResponse.json({ data: quote })
    }
  }

  // Yahoo 폴백
  const quote = await fetchYahooQuote(ticker)
  if (quote) return NextResponse.json({ data: quote })
  return NextResponse.json({ error: "시세 조회 실패" }, { status: 502 })
}
