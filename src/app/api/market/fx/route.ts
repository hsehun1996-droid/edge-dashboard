import { NextResponse } from "next/server"

export async function GET() {
  try {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/KRW%3DX?interval=1d&range=5d"
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 300 },
    })
    if (!res.ok) throw new Error(`${res.status}`)
    const json = await res.json()
    const rate = json.chart?.result?.[0]?.meta?.regularMarketPrice ?? 1380
    return NextResponse.json({ rate, timestamp: new Date().toISOString() })
  } catch {
    return NextResponse.json({ rate: 1380, timestamp: new Date().toISOString(), fallback: true })
  }
}
