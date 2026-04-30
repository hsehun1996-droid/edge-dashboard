/**
 * Korean stock universe
 * Source: KIND market download
 */

import type { StockInfo } from "./us"

const KIND_BASE =
  "https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13&marketType="

async function fetchKINDMarket(
  marketType: "stockMkt" | "kosdaqMkt"
): Promise<StockInfo[]> {
  const exchange = marketType === "stockMkt" ? "KOSPI" : "KOSDAQ"
  const suffix = marketType === "stockMkt" ? ".KS" : ".KQ"

  const res = await fetch(KIND_BASE + marketType, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      Referer: "https://kind.krx.co.kr/",
      Accept: "application/vnd.ms-excel, */*",
    },
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) throw new Error(`KIND ${exchange}: HTTP ${res.status}`)

  const html = new TextDecoder("euc-kr").decode(Buffer.from(await res.arrayBuffer()))
  const rows = parseKindTable(html)

  const results: StockInfo[] = []

  for (let i = 1; i < rows.length; i++) {
    const name = String(rows[i]?.[0] ?? "").trim()
    const raw = String(rows[i]?.[2] ?? "").trim()
    const code = raw.padStart(6, "0")
    if (!name || !/^\d{6}$/.test(code)) continue

    results.push({
      ticker: `${code}${suffix}`,
      name,
      exchange,
      country: "KR",
    })
  }

  return results
}

function parseKindTable(html: string): string[][] {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((rowMatch) =>
      [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cellMatch) =>
        decodeHtmlEntities(cellMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      )
    )
    .filter((row) => row.length >= 3)
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
}

export async function fetchKRStocks(): Promise<StockInfo[]> {
  const [kospi, kosdaq] = await Promise.allSettled([
    fetchKINDMarket("stockMkt"),
    fetchKINDMarket("kosdaqMkt"),
  ])

  const kospiList = kospi.status === "fulfilled" ? kospi.value : []
  const kosdaqList = kosdaq.status === "fulfilled" ? kosdaq.value : []

  if (kospi.status === "rejected") console.error("[kr] KOSPI failed:", kospi.reason)
  if (kosdaq.status === "rejected") console.error("[kr] KOSDAQ failed:", kosdaq.reason)

  return [...kospiList, ...kosdaqList]
}
