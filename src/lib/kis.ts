// 한국투자증권 KIS OpenAPI 유틸리티
// 문서: https://apiportal.koreainvestment.com

const KIS_BASE = "https://openapi.koreainvestment.com:9443"

// ─── 토큰 캐시 (서버 프로세스 메모리, 24시간 유효) ──────────────────────────────
let cachedToken: string | null = null
let tokenExpiresAt = 0

async function getAccessToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && now < tokenExpiresAt - 5 * 60 * 1000) return cachedToken

  const appkey = process.env.KIS_APP_KEY!
  const appsecret = process.env.KIS_APP_SECRET!

  const res = await fetch(`${KIS_BASE}/oauth2/tokenP`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey, appsecret }),
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`KIS 토큰 발급 실패: ${res.status}`)

  const json = await res.json()
  cachedToken = json.access_token as string
  tokenExpiresAt = now + (json.expires_in as number) * 1000
  return cachedToken
}

// ─── 공통 타입 ────────────────────────────────────────────────────────────────
export interface KisQuote {
  price: number
  change: number        // 전일대비 (절대값, 음수 가능)
  changePercent: number // 전일대비율 (%)
  volume: number
  high52w: number
  low52w: number
  marketCap?: number    // 국내: 억원 단위, 해외: 통화 단위
}

// ─── 국내 주식 현재가 (가격만) ────────────────────────────────────────────────
export async function fetchKisDomesticPrice(code: string): Promise<number | null> {
  const quote = await fetchKisDomesticQuote(code)
  return quote?.price ?? null
}

// ─── 국내 주식 풀 시세 ─────────────────────────────────────────────────────────
export async function fetchKisDomesticQuote(code: string): Promise<KisQuote | null> {
  try {
    const token = await getAccessToken()
    const appkey = process.env.KIS_APP_KEY!
    const appsecret = process.env.KIS_APP_SECRET!

    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "J",
      FID_INPUT_ISCD: code,
    })

    const res = await fetch(
      `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-price?${params}`,
      {
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          appkey,
          appsecret,
          tr_id: "FHKST01010100",
        },
        next: { revalidate: 60 },
      }
    )
    if (!res.ok) return null

    const json = await res.json()
    const out = json.output
    if (!out?.stck_prpr) return null

    // prdy_vrss_sign: 1=상한 2=상승 3=보합 4=하한 5=하락
    const sign = out.prdy_vrss_sign as string
    const isNeg = sign === "4" || sign === "5"
    const changeAbs = parseFloat(out.prdy_vrss) || 0
    const changePct = parseFloat(out.prdy_ctrt) || 0

    return {
      price: parseFloat(out.stck_prpr),
      change: isNeg ? -changeAbs : changeAbs,
      changePercent: isNeg && changePct > 0 ? -changePct : changePct,
      volume: parseFloat(out.acml_vol) || 0,
      high52w: parseFloat(out.w52_hgpr) || 0,
      low52w: parseFloat(out.w52_lwpr) || 0,
      marketCap: parseFloat(out.hts_avls) || undefined, // 억원
    }
  } catch {
    return null
  }
}

// ─── 해외 주식 현재가 (가격만) ────────────────────────────────────────────────
export async function fetchKisOverseasPrice(excd: string, symb: string): Promise<number | null> {
  const quote = await fetchKisOverseasQuote(excd, symb)
  return quote?.price ?? null
}

// ─── 해외 주식 풀 시세 ─────────────────────────────────────────────────────────
export async function fetchKisOverseasQuote(excd: string, symb: string): Promise<KisQuote | null> {
  try {
    const token = await getAccessToken()
    const appkey = process.env.KIS_APP_KEY!
    const appsecret = process.env.KIS_APP_SECRET!

    const params = new URLSearchParams({ AUTH: "", EXCD: excd, SYMB: symb })

    const res = await fetch(
      `${KIS_BASE}/uapi/overseas-price/v1/quotations/price?${params}`,
      {
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          appkey,
          appsecret,
          tr_id: "HHDFS00000300",
        },
        next: { revalidate: 60 },
      }
    )
    if (!res.ok) return null

    const json = await res.json()
    const out = json.output
    if (!out?.last) return null

    return {
      price: parseFloat(out.last),
      change: parseFloat(out.diff) || 0,
      changePercent: parseFloat(out.rate) || 0,
      volume: parseFloat(out.tvol) || 0,
      high52w: parseFloat(out.h52p) || 0,
      low52w: parseFloat(out.l52p) || 0,
      marketCap: parseFloat(out.mktv) || undefined,
    }
  } catch {
    return null
  }
}

// ─── 티커 → KIS 거래소코드 매핑 ───────────────────────────────────────────────
export function tickerToKisExcd(ticker: string): string | null {
  const t = ticker.toUpperCase()
  if (t.endsWith(".T") || t.endsWith(".OS")) return "TSE"
  if (t.endsWith(".SS")) return "SHS"
  if (t.endsWith(".SZ")) return "SZS"
  if (t.endsWith(".HK")) return "HKS"
  if (t.endsWith(".L")) return "LSE"
  if (t.endsWith(".DE") || t.endsWith(".F")) return "FRS"
  // 순수 알파벳 티커 → 미국 NASDAQ 우선 (NYS fallback은 호출부에서 처리)
  if (/^[A-Z]{1,5}(-[A-Z])?$/.test(t)) return "NAS"
  return null
}
