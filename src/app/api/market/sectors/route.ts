import { NextResponse } from "next/server"
import type { Sector } from "@/types"
import { calculateRSScore } from "@/lib/market-data"

// ─── Country Sector Definitions ───────────────────────────────────────────────

type StockDef = { ticker: string; name: string }
type SectorDef = {
  name: string; nameEn: string; etfTicker: string; etfName: string
  topTicker: string; topName: string
  stocks: StockDef[]
}

const US_SECTORS: SectorDef[] = [
  { name: "기술",        nameEn: "Technology",       etfTicker: "XLK",  etfName: "SPDR Tech ETF",          topTicker: "NVDA", topName: "NVIDIA",
    stocks: [{ ticker: "NVDA", name: "NVIDIA" }, { ticker: "AAPL", name: "Apple" }, { ticker: "MSFT", name: "Microsoft" }, { ticker: "AVGO", name: "Broadcom" }, { ticker: "AMD", name: "AMD" }] },
  { name: "금융",        nameEn: "Financials",        etfTicker: "XLF",  etfName: "SPDR Financials ETF",    topTicker: "JPM",  topName: "JPMorgan",
    stocks: [{ ticker: "JPM", name: "JPMorgan" }, { ticker: "BAC", name: "Bank of America" }, { ticker: "GS", name: "Goldman Sachs" }, { ticker: "MS", name: "Morgan Stanley" }, { ticker: "BLK", name: "BlackRock" }] },
  { name: "헬스케어",    nameEn: "Health Care",       etfTicker: "XLV",  etfName: "SPDR Health Care ETF",   topTicker: "UNH",  topName: "UnitedHealth",
    stocks: [{ ticker: "UNH", name: "UnitedHealth" }, { ticker: "LLY", name: "Eli Lilly" }, { ticker: "JNJ", name: "Johnson & Johnson" }, { ticker: "ABT", name: "Abbott" }, { ticker: "TMO", name: "Thermo Fisher" }] },
  { name: "에너지",      nameEn: "Energy",            etfTicker: "XLE",  etfName: "SPDR Energy ETF",        topTicker: "XOM",  topName: "ExxonMobil",
    stocks: [{ ticker: "XOM", name: "ExxonMobil" }, { ticker: "CVX", name: "Chevron" }, { ticker: "COP", name: "ConocoPhillips" }, { ticker: "EOG", name: "EOG Resources" }, { ticker: "PSX", name: "Phillips 66" }] },
  { name: "산업재",      nameEn: "Industrials",       etfTicker: "XLI",  etfName: "SPDR Industrials ETF",   topTicker: "CAT",  topName: "Caterpillar",
    stocks: [{ ticker: "CAT", name: "Caterpillar" }, { ticker: "HON", name: "Honeywell" }, { ticker: "UPS", name: "UPS" }, { ticker: "RTX", name: "RTX" }, { ticker: "GE", name: "GE Aerospace" }] },
  { name: "경기소비재",  nameEn: "Consumer Discr.",   etfTicker: "XLY",  etfName: "SPDR Cons. Discr. ETF",  topTicker: "AMZN", topName: "Amazon",
    stocks: [{ ticker: "AMZN", name: "Amazon" }, { ticker: "TSLA", name: "Tesla" }, { ticker: "HD", name: "Home Depot" }, { ticker: "MCD", name: "McDonald's" }, { ticker: "NKE", name: "Nike" }] },
  { name: "필수소비재",  nameEn: "Consumer Staples",  etfTicker: "XLP",  etfName: "SPDR Cons. Staples ETF", topTicker: "WMT",  topName: "Walmart",
    stocks: [{ ticker: "WMT", name: "Walmart" }, { ticker: "PG", name: "P&G" }, { ticker: "KO", name: "Coca-Cola" }, { ticker: "PEP", name: "PepsiCo" }, { ticker: "COST", name: "Costco" }] },
  { name: "커뮤니케이션", nameEn: "Communication",   etfTicker: "XLC",  etfName: "SPDR Comm. ETF",         topTicker: "META", topName: "Meta",
    stocks: [{ ticker: "META", name: "Meta" }, { ticker: "GOOGL", name: "Alphabet" }, { ticker: "NFLX", name: "Netflix" }, { ticker: "DIS", name: "Disney" }, { ticker: "T", name: "AT&T" }] },
  { name: "소재",        nameEn: "Materials",         etfTicker: "XLB",  etfName: "SPDR Materials ETF",     topTicker: "LIN",  topName: "Linde",
    stocks: [{ ticker: "LIN", name: "Linde" }, { ticker: "SHW", name: "Sherwin-Williams" }, { ticker: "APD", name: "Air Products" }, { ticker: "FCX", name: "Freeport-McMoRan" }, { ticker: "NEM", name: "Newmont" }] },
  { name: "유틸리티",    nameEn: "Utilities",         etfTicker: "XLU",  etfName: "SPDR Utilities ETF",     topTicker: "NEE",  topName: "NextEra Energy",
    stocks: [{ ticker: "NEE", name: "NextEra Energy" }, { ticker: "DUK", name: "Duke Energy" }, { ticker: "SO", name: "Southern Co." }, { ticker: "AEP", name: "Am. Electric Power" }, { ticker: "D", name: "Dominion Energy" }] },
  { name: "부동산",      nameEn: "Real Estate",       etfTicker: "XLRE", etfName: "SPDR Real Estate ETF",   topTicker: "PLD",  topName: "Prologis",
    stocks: [{ ticker: "PLD", name: "Prologis" }, { ticker: "AMT", name: "American Tower" }, { ticker: "EQIX", name: "Equinix" }, { ticker: "SPG", name: "Simon Property" }, { ticker: "CCI", name: "Crown Castle" }] },
]

// Korean sectors — Yahoo Finance uses .KS for KOSPI stocks
const KR_SECTORS: SectorDef[] = [
  { name: "반도체",    nameEn: "Semiconductors",  etfTicker: "091230.KQ", etfName: "KODEX 반도체",       topTicker: "005930.KS", topName: "삼성전자",
    stocks: [{ ticker: "005930.KS", name: "삼성전자" }, { ticker: "000660.KS", name: "SK하이닉스" }, { ticker: "042700.KS", name: "한미반도체" }, { ticker: "DB.KQ", name: "DB하이텍" }, { ticker: "240810.KS", name: "원익IPS" }] },
  { name: "2차전지",   nameEn: "Battery",         etfTicker: "305540.KS", etfName: "TIGER 2차전지TOP10", topTicker: "373220.KS", topName: "LG에너지솔루션",
    stocks: [{ ticker: "373220.KS", name: "LG에너지솔루션" }, { ticker: "006400.KS", name: "삼성SDI" }, { ticker: "096770.KS", name: "SK이노베이션" }, { ticker: "247540.KQ", name: "에코프로비엠" }, { ticker: "003670.KS", name: "포스코퓨처엠" }] },
  { name: "바이오",    nameEn: "Biotech",         etfTicker: "143860.KS", etfName: "TIGER 헬스케어",     topTicker: "207940.KS", topName: "삼성바이오로직스",
    stocks: [{ ticker: "207940.KS", name: "삼성바이오로직스" }, { ticker: "068270.KS", name: "셀트리온" }, { ticker: "000100.KS", name: "유한양행" }, { ticker: "128940.KS", name: "한미약품" }, { ticker: "006280.KS", name: "녹십자" }] },
  { name: "자동차",    nameEn: "Automotive",      etfTicker: "091220.KQ", etfName: "KODEX 자동차",       topTicker: "005380.KS", topName: "현대차",
    stocks: [{ ticker: "005380.KS", name: "현대차" }, { ticker: "000270.KS", name: "기아" }, { ticker: "012330.KS", name: "현대모비스" }, { ticker: "018880.KS", name: "한온시스템" }, { ticker: "060980.KS", name: "HL만도" }] },
  { name: "은행",      nameEn: "Banking",         etfTicker: "091170.KQ", etfName: "KODEX 은행",         topTicker: "105560.KS", topName: "KB금융",
    stocks: [{ ticker: "105560.KS", name: "KB금융" }, { ticker: "055550.KS", name: "신한지주" }, { ticker: "086790.KS", name: "하나금융지주" }, { ticker: "316140.KS", name: "우리금융지주" }, { ticker: "024110.KS", name: "기업은행" }] },
  { name: "조선",      nameEn: "Shipbuilding",    etfTicker: "139230.KS", etfName: "TIGER 200 조선",     topTicker: "329180.KS", topName: "HD현대중공업",
    stocks: [{ ticker: "329180.KS", name: "HD현대중공업" }, { ticker: "042660.KS", name: "한화오션" }, { ticker: "010140.KS", name: "삼성중공업" }, { ticker: "010620.KS", name: "현대미포조선" }, { ticker: "267250.KS", name: "HD현대" }] },
  { name: "방산",      nameEn: "Defense",         etfTicker: "425330.KS", etfName: "TIGER K방산",        topTicker: "012450.KS", topName: "한화에어로스페이스",
    stocks: [{ ticker: "012450.KS", name: "한화에어로스페이스" }, { ticker: "079550.KS", name: "LIG넥스원" }, { ticker: "047810.KS", name: "한국항공우주" }, { ticker: "064350.KS", name: "현대로템" }, { ticker: "010820.KS", name: "퍼스텍" }] },
  { name: "철강/소재",  nameEn: "Steel/Materials", etfTicker: "138230.KS", etfName: "TIGER 200 철강소재", topTicker: "005490.KS", topName: "POSCO홀딩스",
    stocks: [{ ticker: "005490.KS", name: "POSCO홀딩스" }, { ticker: "004020.KS", name: "현대제철" }, { ticker: "010130.KS", name: "고려아연" }, { ticker: "001230.KS", name: "동국제강" }, { ticker: "001430.KS", name: "세아베스틸지주" }] },
  { name: "화학",      nameEn: "Chemicals",       etfTicker: "NONE",      etfName: "TIGER 화학",         topTicker: "051910.KS", topName: "LG화학",
    stocks: [{ ticker: "051910.KS", name: "LG화학" }, { ticker: "011170.KS", name: "롯데케미칼" }, { ticker: "009830.KS", name: "한화솔루션" }, { ticker: "011780.KS", name: "금호석유" }, { ticker: "011790.KS", name: "SKC" }] },
  { name: "IT부품",    nameEn: "IT Components",   etfTicker: "157490.KS", etfName: "TIGER IT플러스",     topTicker: "011070.KS", topName: "LG이노텍",
    stocks: [{ ticker: "011070.KS", name: "LG이노텍" }, { ticker: "009150.KS", name: "삼성전기" }, { ticker: "091700.KQ", name: "파트론" }, { ticker: "090460.KQ", name: "비에이치" }, { ticker: "353200.KS", name: "대덕전자" }] },
]

const JP_SECTORS: SectorDef[] = [
  { name: "기술·전자", nameEn: "Technology",    etfTicker: "1631.T", etfName: "NEXT FUNDS 情報通信業",   topTicker: "6758.T", topName: "Sony",
    stocks: [{ ticker: "6758.T", name: "Sony" }, { ticker: "6861.T", name: "Keyence" }, { ticker: "8035.T", name: "Tokyo Electron" }, { ticker: "6981.T", name: "Murata" }, { ticker: "6594.T", name: "Nidec" }] },
  { name: "자동차",    nameEn: "Automotive",    etfTicker: "1632.T", etfName: "NEXT FUNDS 輸送機器業",   topTicker: "7203.T", topName: "Toyota",
    stocks: [{ ticker: "7203.T", name: "Toyota" }, { ticker: "7267.T", name: "Honda" }, { ticker: "7201.T", name: "Nissan" }, { ticker: "7270.T", name: "Subaru" }, { ticker: "7261.T", name: "Mazda" }] },
  { name: "금융·보험", nameEn: "Financials",    etfTicker: "1633.T", etfName: "NEXT FUNDS 銀行業",       topTicker: "8306.T", topName: "MUFG",
    stocks: [{ ticker: "8306.T", name: "MUFG" }, { ticker: "8316.T", name: "SMFG" }, { ticker: "8411.T", name: "Mizuho FG" }, { ticker: "8766.T", name: "Tokio Marine" }, { ticker: "8591.T", name: "ORIX" }] },
  { name: "헬스케어",  nameEn: "Health Care",   etfTicker: "1634.T", etfName: "NEXT FUNDS 医薬品業",     topTicker: "4568.T", topName: "Daiichi Sankyo",
    stocks: [{ ticker: "4568.T", name: "Daiichi Sankyo" }, { ticker: "4519.T", name: "Chugai Pharma" }, { ticker: "4523.T", name: "Eisai" }, { ticker: "4502.T", name: "Takeda" }, { ticker: "4507.T", name: "Shionogi" }] },
  { name: "소재·화학", nameEn: "Materials",     etfTicker: "1635.T", etfName: "NEXT FUNDS 化学工業",     topTicker: "4063.T", topName: "Shin-Etsu Chemical",
    stocks: [{ ticker: "4063.T", name: "Shin-Etsu Chemical" }, { ticker: "4188.T", name: "Mitsubishi Chemical" }, { ticker: "3407.T", name: "Asahi Kasei" }, { ticker: "4208.T", name: "UBE" }, { ticker: "4005.T", name: "Sumitomo Chemical" }] },
  { name: "산업재",    nameEn: "Industrials",   etfTicker: "1636.T", etfName: "NEXT FUNDS 機械業",       topTicker: "6861.T", topName: "Keyence",
    stocks: [{ ticker: "6861.T", name: "Keyence" }, { ticker: "6367.T", name: "Daikin" }, { ticker: "6273.T", name: "SMC" }, { ticker: "7741.T", name: "HOYA" }, { ticker: "6302.T", name: "Sumitomo Heavy" }] },
  { name: "부동산",    nameEn: "Real Estate",   etfTicker: "1637.T", etfName: "NEXT FUNDS 不動産業",     topTicker: "8801.T", topName: "Mitsui Fudosan",
    stocks: [{ ticker: "8801.T", name: "Mitsui Fudosan" }, { ticker: "8802.T", name: "Mitsubishi Estate" }, { ticker: "8804.T", name: "Tokyo Tatemono" }, { ticker: "3003.T", name: "Hulic" }, { ticker: "8830.T", name: "Sumitomo Realty" }] },
  { name: "에너지",    nameEn: "Energy",        etfTicker: "1638.T", etfName: "NEXT FUNDS 鉱業業",       topTicker: "5020.T", topName: "ENEOS",
    stocks: [{ ticker: "5020.T", name: "ENEOS" }, { ticker: "5019.T", name: "Idemitsu Kosan" }, { ticker: "1605.T", name: "INPEX" }, { ticker: "5021.T", name: "Cosmo Energy" }, { ticker: "6988.T", name: "Nitto Denko" }] },
]

const CN_SECTORS: SectorDef[] = [
  { name: "기술·AI",  nameEn: "Technology/AI",  etfTicker: "KWEB",  etfName: "KraneShares CSI China Internet", topTicker: "BABA",  topName: "Alibaba",
    stocks: [{ ticker: "BABA", name: "Alibaba" }, { ticker: "TCEHY", name: "Tencent" }, { ticker: "JD", name: "JD.com" }, { ticker: "BIDU", name: "Baidu" }, { ticker: "PDD", name: "PDD Holdings" }] },
  { name: "에너지",   nameEn: "Energy",          etfTicker: "CHIE",  etfName: "Global X China Energy ETF",      topTicker: "PTR",   topName: "PetroChina",
    stocks: [{ ticker: "PTR", name: "PetroChina" }, { ticker: "SNP", name: "Sinopec" }, { ticker: "CEO", name: "CNOOC" }, { ticker: "SHI", name: "Sinopec SH" }, { ticker: "601985.SS", name: "中国核能" }] },
  { name: "헬스케어", nameEn: "Health Care",     etfTicker: "KURE",  etfName: "KraneShares MSCI Health",        topTicker: "1093.HK",topName: "CSPC Pharma",
    stocks: [{ ticker: "1093.HK", name: "CSPC Pharma" }, { ticker: "1177.HK", name: "Sino Biopharm" }, { ticker: "2269.HK", name: "WuXi Biologics" }, { ticker: "6160.HK", name: "BeiGene" }, { ticker: "2359.HK", name: "WuXi AppTec" }] },
  { name: "금융",     nameEn: "Financials",      etfTicker: "CHIX",  etfName: "Global X China Financials",      topTicker: "601398.SS",topName: "ICBC",
    stocks: [{ ticker: "601398.SS", name: "ICBC" }, { ticker: "601939.SS", name: "건설은행" }, { ticker: "601288.SS", name: "농업은행" }, { ticker: "600036.SS", name: "초상은행" }, { ticker: "601166.SS", name: "흥업은행" }] },
  { name: "소비",     nameEn: "Consumer",        etfTicker: "CHIQ",  etfName: "Global X China Consumer",        topTicker: "PDD",   topName: "PDD Holdings",
    stocks: [{ ticker: "PDD", name: "PDD Holdings" }, { ticker: "9988.HK", name: "Alibaba HK" }, { ticker: "600519.SS", name: "Kweichow Moutai" }, { ticker: "000858.SZ", name: "五粮液" }, { ticker: "002594.SZ", name: "BYD" }] },
  { name: "산업재",   nameEn: "Industrials",     etfTicker: "CHII",  etfName: "Global X China Industrials",     topTicker: "CRRC.HK",topName: "CRRC Corp",
    stocks: [{ ticker: "CRRC.HK", name: "CRRC Corp" }, { ticker: "1766.HK", name: "CRRC HK" }, { ticker: "600893.SS", name: "航发动力" }, { ticker: "601006.SS", name: "大秦铁路" }, { ticker: "000333.SZ", name: "Midea Group" }] },
  { name: "소재",     nameEn: "Materials",       etfTicker: "CHIM",  etfName: "Global X China Materials",       topTicker: "600019.SS",topName: "Baoshan Iron",
    stocks: [{ ticker: "600019.SS", name: "Baoshan Iron" }, { ticker: "601899.SS", name: "Zijin Mining" }, { ticker: "600362.SS", name: "Jiangxi Copper" }, { ticker: "000636.SZ", name: "风华高科" }, { ticker: "002460.SZ", name: "赣锋锂业" }] },
  { name: "부동산",   nameEn: "Real Estate",     etfTicker: "TAO",   etfName: "Invesco China Real Estate",      topTicker: "3333.HK",topName: "Evergrande(참고)",
    stocks: [{ ticker: "3333.HK", name: "Evergrande" }, { ticker: "2202.HK", name: "Vanke" }, { ticker: "960.HK", name: "Longfor Group" }, { ticker: "688.HK", name: "CIFI Holdings" }, { ticker: "3900.HK", name: "Greentown China" }] },
]

// ─── Fetch helpers ─────────────────────────────────────────────────────────────

// Fetch 1-month chart (enough for 1m RS, daily change)
async function fetchChart(ticker: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1mo`
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 300 },
  })
  if (!res.ok) throw new Error(`${res.status}`)
  const json = await res.json()
  return json.chart?.result?.[0]
}

function getReturnPct(data: any): number {
  const meta = data?.meta
  // regularMarketChangePercent is present in some endpoints but NOT in v8/chart
  if (typeof meta?.regularMarketChangePercent === "number") {
    return meta.regularMarketChangePercent
  }
  // v8/chart: calculate daily change from last two closes in indicators
  const closes: number[] = data?.indicators?.quote?.[0]?.close?.filter(Boolean) ?? []
  if (closes.length >= 2) {
    const n = closes.length
    // Use regularMarketPrice as today if available (intraday), else last close
    const today = meta?.regularMarketPrice ?? closes[n - 1]
    const yesterday = closes[n - 2]
    return yesterday ? ((today - yesterday) / yesterday) * 100 : 0
  }
  const current = meta?.regularMarketPrice ?? 0
  const prev = meta?.previousClose ?? meta?.regularMarketPreviousClose ?? current
  return prev ? ((current - prev) / prev) * 100 : 0
}

function get1mReturn(data: any): number {
  const closes: number[] = data?.indicators?.quote?.[0]?.close?.filter(Boolean) ?? []
  if (closes.length < 2) return getReturnPct(data)
  const n = closes.length
  // 1-month: compare last close vs first close of the fetched range
  return ((closes[n - 1] - closes[0]) / closes[0]) * 100
}

// ─── Generate US sectors ──────────────────────────────────────────────────────

async function buildUSSectors(): Promise<Sector[]> {
  const spxData = await fetchChart("SPY").catch(() => null)
  const spx1m = spxData ? get1mReturn(spxData) : 0

  const results = await Promise.allSettled(
    US_SECTORS.map(async (def) => {
      const [etfData, ...allStockResults] = await Promise.allSettled([
        fetchChart(def.etfTicker),
        ...def.stocks.map((s) => fetchChart(s.ticker)),
      ])

      const etf = etfData.status === "fulfilled" ? etfData.value : null
      const stock = allStockResults[0].status === "fulfilled" ? allStockResults[0].value : null

      const returnPct = etf ? getReturnPct(etf) : (Math.random() - 0.5) * 4
      const sector1m = etf ? get1mReturn(etf) : returnPct
      const rs = sector1m - spx1m
      const rsRating = Math.min(99, Math.max(1, Math.round(50 + rs * 5)))
      const vol: number[] = etf?.indicators?.quote?.[0]?.volume?.filter(Boolean) ?? []
      const price: number = etf?.meta?.regularMarketPrice ?? 100
      const avgVol = vol.length ? vol.slice(-5).reduce((a: number, b: number) => a + b, 0) / 5 : 0

      const topChangePercent = stock ? getReturnPct(stock) : (Math.random() - 0.5) * 6
      const seed = def.etfTicker.split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 0)
      const rng = (n: number) => ((n * 1664525 + 1013904223) & 0x7fffffff) / 0x7fffffff
      const topStocks = def.stocks.map((s, idx) => {
        const stockResult = allStockResults[idx]
        const stockData = stockResult.status === "fulfilled" ? stockResult.value : null
        const changePercent = stockData ? getReturnPct(stockData) : (rng(seed + idx * 7) - 0.48) * 8
        const stockPrice = stockData?.meta?.regularMarketPrice ?? 0
        return { ticker: s.ticker, name: s.name, changePercent, price: stockPrice }
      })

      return {
        name: def.name,
        nameEn: def.nameEn,
        ticker: def.etfTicker,
        country: "US",
        returnPct,
        volume: avgVol * price,
        rs,
        rsRating,
        marketCap: etf?.meta?.marketCap ?? 0,
        topStock: {
          ticker: def.topTicker,
          name: def.topName,
          changePercent: topChangePercent,
        },
        topStocks,
        etf: {
          ticker: def.etfTicker,
          name: def.etfName,
          changePercent: returnPct,
        },
      } satisfies Sector
    })
  )

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value
    const def = US_SECTORS[i]
    const rnd = (Math.random() - 0.5) * 4
    return mockSector(def, "US", rnd)
  })
}

// ─── Mock sector builder (for KR / JP / CN) ──────────────────────────────────

function mockSector(def: SectorDef, country: string, baseReturn?: number): Sector {
  const seed = def.etfTicker.split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 0)
  const rng = (n: number) => ((n * 1664525 + 1013904223) & 0x7fffffff) / 0x7fffffff
  const returnPct = baseReturn ?? (rng(seed) - 0.48) * 8
  const topChange = (rng(seed + 1) - 0.48) * 10
  const rs = returnPct - (rng(seed + 2) - 0.5) * 3
  const topStocks = def.stocks.map((s, idx) => ({
    ticker: s.ticker,
    name: s.name,
    changePercent: idx === 0 ? topChange : (rng(seed + idx * 7) - 0.48) * 8,
    price: 0,
  }))
  return {
    name: def.name,
    nameEn: def.nameEn,
    ticker: def.etfTicker,
    country,
    returnPct,
    volume: (seed % 1000) * 1_000_000,
    rs,
    rsRating: Math.min(99, Math.max(1, Math.round(50 + rs * 4))),
    marketCap: (seed % 500) * 1_000_000_000,
    topStock: { ticker: def.topTicker, name: def.topName, changePercent: topChange },
    topStocks,
    etf: { ticker: def.etfTicker, name: def.etfName, changePercent: returnPct },
  }
}

async function buildKRSectors(): Promise<Sector[]> {
  // Fetch KOSPI index for RS baseline
  const kospiData = await fetchChart("^KS11").catch(() => null)
  const kospi1d = kospiData ? getReturnPct(kospiData) : 0

  const results = await Promise.allSettled(
    KR_SECTORS.map(async (def) => {
      try {
        const allStockResults = await Promise.allSettled(
          def.stocks.map((s) => fetchChart(s.ticker))
        )
        const topStockData = allStockResults[0].status === "fulfilled" ? allStockResults[0].value : null
        if (!topStockData) return mockSector(def, "KR")

        const topChange = getReturnPct(topStockData)
        const rs = topChange - kospi1d
        const sector = mockSector(def, "KR")
        const topStocks = def.stocks.map((s, idx) => {
          const result = allStockResults[idx]
          const data = result.status === "fulfilled" ? result.value : null
          const changePercent = data ? getReturnPct(data) : sector.topStocks![idx]?.changePercent ?? 0
          const price = data?.meta?.regularMarketPrice ?? 0
          return { ticker: s.ticker, name: s.name, changePercent, price }
        })
        return {
          ...sector,
          topStock: { ticker: def.topTicker, name: def.topName, changePercent: topChange },
          topStocks,
          returnPct: topChange,
          rs,
          rsRating: Math.min(99, Math.max(1, Math.round(50 + rs * 8))),
        } satisfies Sector
      } catch {
        return mockSector(def, "KR")
      }
    })
  )
  return results.map((r) => (r.status === "fulfilled" ? r.value : mockSector(KR_SECTORS[0], "KR")))
}

function buildJPSectors(): Sector[] {
  return JP_SECTORS.map((def) => mockSector(def, "JP"))
}

function buildCNSectors(): Sector[] {
  return CN_SECTORS.map((def) => mockSector(def, "CN"))
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const country = (searchParams.get("country") ?? "US").toUpperCase()
  const timestamp = new Date().toISOString()

  try {
    let sectors: Sector[]
    switch (country) {
      case "KR": sectors = await buildKRSectors(); break
      case "JP": sectors = buildJPSectors(); break
      case "CN": sectors = buildCNSectors(); break
      default:   sectors = await buildUSSectors(); break
    }
    // Sort by RS Rating desc
    sectors.sort((a, b) => b.rsRating - a.rsRating)
    return NextResponse.json({ data: sectors, timestamp })
  } catch (err) {
    return NextResponse.json({ error: "섹터 데이터 오류", timestamp }, { status: 500 })
  }
}
