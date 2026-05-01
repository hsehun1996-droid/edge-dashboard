import { NextResponse } from "next/server"
import { withCache } from "@/lib/server-cache"

async function fetchFxRate(): Promise<number> {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/KRW%3DX?interval=1d&range=5d"
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`${res.status}`)
  const json = await res.json()
  return json.chart?.result?.[0]?.meta?.regularMarketPrice ?? 1380
}

export async function GET() {
  try {
    const rate = await withCache("market:fx", 5 * 60 * 1000, fetchFxRate)
    return NextResponse.json(
      { rate, timestamp: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } }
    )
  } catch {
    return NextResponse.json({ rate: 1380, timestamp: new Date().toISOString(), fallback: true })
  }
}
