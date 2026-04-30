import { NextResponse } from "next/server"

async function fetchYahooSparkline(ticker: string): Promise<number[] | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1mo`
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const json = await res.json()
    const closes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close as (number | null)[] | undefined
    if (!closes?.length) return null
    return closes.filter((v): v is number => v !== null && v !== undefined).slice(-30)
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tickers = searchParams.get("tickers")?.split(",").filter(Boolean) ?? []

  if (!tickers.length) return NextResponse.json({ data: {} })

  const result: Record<string, number[]> = {}

  await Promise.allSettled(
    tickers.map(async (ticker) => {
      const data = await fetchYahooSparkline(ticker)
      if (data && data.length >= 2) result[ticker] = data
    })
  )

  return NextResponse.json({ data: result })
}
