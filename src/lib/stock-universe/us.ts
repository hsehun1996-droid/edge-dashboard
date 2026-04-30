/**
 * 미국 상장 종목 목록
 * 소스: SEC EDGAR company_tickers.json (무료, 인증 불필요)
 * 10,000+ 종목 반환 (NASDAQ · NYSE · AMEX 등)
 */

export interface StockInfo {
  ticker: string
  name: string
  exchange: string
  country: "US" | "KR"
}

const EDGAR_URL = "https://www.sec.gov/files/company_tickers.json"

interface EdgarEntry {
  cik_str: number
  ticker:  string
  title:   string
}

/** 일반 보통주 티커만 허용 (1~5자리 알파벳) */
function isCommonTicker(ticker: string): boolean {
  return /^[A-Z]{1,5}$/.test(ticker)
}

export async function fetchUSStocks(): Promise<StockInfo[]> {
  const res = await fetch(EDGAR_URL, {
    headers: {
      "User-Agent": "scanner/1.0 (research use)",
      "Accept":     "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`SEC EDGAR: HTTP ${res.status}`)

  const json = await res.json() as Record<string, EdgarEntry>
  const entries = Object.values(json)

  const seen = new Set<string>()
  const results: StockInfo[] = []

  for (const e of entries) {
    const ticker = e.ticker?.trim().toUpperCase()
    if (!ticker || !isCommonTicker(ticker)) continue
    if (seen.has(ticker)) continue
    seen.add(ticker)

    results.push({
      ticker,
      name:     e.title?.trim() || ticker,
      exchange: "US",   // 실제 거래소는 Yahoo Finance 응답에서 갱신
      country:  "US",
    })
  }

  return results
}
