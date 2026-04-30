import { NextResponse } from "next/server"

// ── Types ─────────────────────────────────────────────────────────────────────

interface StockResult {
  ticker: string
  name: string
  exchange: string
  currency: string
  flag: string
  type: string
}

// ── 서버-사이드 메모리 캐시 ────────────────────────────────────────────────────
// KRX는 POST 요청이라 Next.js fetch 캐시가 적용 안 됨 → 직접 캐시
const krxCache = new Map<string, { results: StockResult[]; ts: number }>()
const yahooCache = new Map<string, { results: StockResult[]; ts: number }>()
const KRX_CACHE_TTL   = 15 * 60 * 1000 // 15분 (종목 목록은 잘 안 바뀜)
const YAHOO_CACHE_TTL =  5 * 60 * 1000 // 5분

function getKrxCached(q: string): StockResult[] | null {
  const entry = krxCache.get(q)
  return entry && Date.now() - entry.ts < KRX_CACHE_TTL ? entry.results : null
}

function getYahooCached(q: string): StockResult[] | null {
  const entry = yahooCache.get(q)
  return entry && Date.now() - entry.ts < YAHOO_CACHE_TTL ? entry.results : null
}

// ── Yahoo Finance helpers ─────────────────────────────────────────────────────

function exchangeDisplay(exchange: string, symbol: string): string {
  const s = symbol.toUpperCase()
  if (s.endsWith(".DE") || s.endsWith(".F") || s.endsWith(".MU") || s.endsWith(".DU") || s.endsWith(".HA") || s.endsWith(".SG") || s.endsWith(".BE")) return "XETRA"
  if (s.endsWith(".L") || s.endsWith(".IL")) return "LSE"
  if (s.endsWith(".T") || s.endsWith(".OS")) return "TSE"
  if (s.endsWith(".SS")) return "SSE"
  if (s.endsWith(".SZ")) return "SZSE"
  if (s.endsWith(".HK")) return "HKEX"
  if (s.endsWith(".NS")) return "NSE"
  if (s.endsWith(".BO")) return "BSE"
  if (s.endsWith(".SA")) return "B3"
  if (s.endsWith(".ME")) return "MOEX"
  if (s.endsWith(".KS")) return "KOSPI"
  if (s.endsWith(".KQ")) return "KOSDAQ"
  if (exchange === "NMS" || exchange === "NGM" || exchange === "NCM") return "NASDAQ"
  if (exchange === "NYQ" || exchange === "NYE") return "NYSE"
  if (exchange === "ASE" || exchange === "PCX") return "AMEX"
  return exchange || "—"
}

function inferCurrency(symbol: string, exchange: string): string {
  const s = symbol.toUpperCase()
  if (s.endsWith(".DE") || s.endsWith(".F") || s.endsWith(".MU") || s.endsWith(".DU") || s.endsWith(".HA") || s.endsWith(".SG") || s.endsWith(".BE")) return "EUR"
  if (s.endsWith(".L")) return "GBP"
  if (s.endsWith(".IL")) return "ILS"
  if (s.endsWith(".T") || s.endsWith(".OS")) return "JPY"
  if (s.endsWith(".SS") || s.endsWith(".SZ")) return "CNY"
  if (s.endsWith(".HK")) return "HKD"
  if (s.endsWith(".NS") || s.endsWith(".BO")) return "INR"
  if (s.endsWith(".SA")) return "BRL"
  if (s.endsWith(".ME")) return "RUB"
  if (s.endsWith(".KS") || s.endsWith(".KQ")) return "KRW"
  const us = ["NMS", "NYQ", "ASE", "PCX", "NGM", "NCM", "NYE", "BATS", "CBOE", "OBB", "PNK", "BTS"]
  if (us.includes(exchange)) return "USD"
  return "USD"
}

function countryFlag(symbol: string, exchange: string): string {
  const s = symbol.toUpperCase()
  if (s.endsWith(".DE") || s.endsWith(".F") || s.endsWith(".MU") || s.endsWith(".DU") || s.endsWith(".HA") || s.endsWith(".SG") || s.endsWith(".BE")) return "🇩🇪"
  if (s.endsWith(".L") || s.endsWith(".IL")) return "🇬🇧"
  if (s.endsWith(".T") || s.endsWith(".OS")) return "🇯🇵"
  if (s.endsWith(".SS") || s.endsWith(".SZ")) return "🇨🇳"
  if (s.endsWith(".HK")) return "🇭🇰"
  if (s.endsWith(".NS") || s.endsWith(".BO")) return "🇮🇳"
  if (s.endsWith(".SA")) return "🇧🇷"
  if (s.endsWith(".ME")) return "🇷🇺"
  if (s.endsWith(".KS") || s.endsWith(".KQ")) return "🇰🇷"
  void exchange
  return "🇺🇸"
}

// ── KRX (한국거래소) ───────────────────────────────────────────────────────────

const KR_ETF_RE = /^(KODEX|TIGER|ARIRANG|KBSTAR|HANARO|ACE|RISE|SOL|TIMEFOLIO|KOSEF|PLUS|MASTER|SMART)\s/i

async function searchKrx(q: string): Promise<StockResult[]> {
  const cacheKey = q.toLowerCase()
  const cached = getKrxCached(cacheKey)
  if (cached) return cached

  try {
    const body = new URLSearchParams({
      bld: "dbms/comm/finder/finder_stkisu",
      mktsel: "ALL",
      searchText: q,
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

    const results = block1
      .map((item) => {
        const code: string = item.short_code ?? ""
        const name: string = item.codeName ?? ""
        if (!code || !name || !/^\d{6}$/.test(code)) return null

        const isKosdaq = item.marketCode === "KSQ"
        const exchange = isKosdaq ? "KOSDAQ" : "KOSPI"
        const ticker = `${code}.${isKosdaq ? "KQ" : "KS"}`
        const isETF = KR_ETF_RE.test(name)

        return {
          ticker,
          name,
          exchange,
          currency: "KRW",
          flag: "🇰🇷",
          type: isETF ? "ETF" : "주식",
        } satisfies StockResult
      })
      .filter((x): x is StockResult => x !== null)

    krxCache.set(cacheKey, { results, ts: Date.now() })
    return results
  } catch {
    return []
  }
}

// ── Yahoo Finance ─────────────────────────────────────────────────────────────

async function searchYahoo(q: string): Promise<StockResult[]> {
  const cacheKey = q.toLowerCase()
  const cached = getYahooCached(cacheKey)
  if (cached) return cached

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0&enableFuzzyQuery=false&region=US&lang=en-US`
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EdgeDashboard/1.0)" },
      next: { revalidate: 300 },
    })
    if (!res.ok) return []
    const json = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotes: any[] = json.quotes ?? []

    const results = quotes
      .filter((q) => ["EQUITY", "ETF", "MUTUALFUND"].includes(q.quoteType))
      .map((q) => ({
        ticker: q.symbol as string,
        name: (q.longname ?? q.shortname ?? q.symbol) as string,
        exchange: exchangeDisplay(q.exchange, q.symbol),
        currency: inferCurrency(q.symbol, q.exchange),
        flag: countryFlag(q.symbol, q.exchange),
        type: q.quoteType === "ETF" ? "ETF" : q.quoteType === "MUTUALFUND" ? "펀드" : "주식",
      }))

    yahooCache.set(cacheKey, { results, ts: Date.now() })
    return results
  } catch {
    return []
  }
}

// ── 한글 포함 여부 ────────────────────────────────────────────────────────────

function hasKorean(s: string): boolean {
  return /[\uAC00-\uD7A3\u3131-\u314E\u314F-\u3163]/.test(s)
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q")?.trim()

  if (!q || q.length < 1) {
    return NextResponse.json({ data: [] })
  }

  const isKorean = hasKorean(q)

  let krxResults: StockResult[]
  let yahooResults: StockResult[]

  if (isKorean) {
    // 한글 검색 → KRX만 사용 (Yahoo는 한글 이름을 못 찾음)
    krxResults = await searchKrx(q)
    yahooResults = []
  } else {
    // 영문 검색 → 병렬로 KRX + Yahoo
    ;[krxResults, yahooResults] = await Promise.all([searchKrx(q), searchYahoo(q)])
  }

  // 티커 기준 중복 제거
  const seen = new Set<string>()
  const ordered = isKorean
    ? [...krxResults, ...yahooResults]
    : [...yahooResults, ...krxResults]

  const results = ordered.filter((r) => {
    if (seen.has(r.ticker)) return false
    seen.add(r.ticker)
    return true
  })

  return NextResponse.json({ data: results })
}
