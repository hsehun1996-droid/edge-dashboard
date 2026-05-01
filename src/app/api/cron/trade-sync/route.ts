import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { TOP_HS_CODES } from "@/lib/trade-search"

const CUSTOMS_BASE = "http://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList"

// 미리 저장할 국가 목록 ("" = 전체 합산)
const CACHE_COUNTRIES = ["", "US", "CN", "JP", "VN", "DE"]

interface CustomsItem {
  year: string
  statCd: string
  statCdCntnKor1: string
  statKor: string
  hsCd: string
  expWgt: string
  expDlr: string
  impWgt: string
  impDlr: string
  balPayments: string
}

function parseXml(xml: string): CustomsItem[] {
  const items: CustomsItem[] = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  let match: RegExpExecArray | null

  while ((match = itemRe.exec(xml)) !== null) {
    const inner = match[1]
    const get = (tag: string) => {
      const found = inner.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))
      return found ? found[1].trim() : ""
    }
    const year = get("year")
    if (!/^\d{4}\.\d{2}$/.test(year)) continue
    items.push({
      year,
      statCd: get("statCd"),
      statCdCntnKor1: get("statCdCntnKor1"),
      statKor: get("statKor"),
      hsCd: get("hsCd"),
      expWgt: get("expWgt"),
      expDlr: get("expDlr"),
      impWgt: get("impWgt"),
      impDlr: get("impDlr"),
      balPayments: get("balPayments"),
    })
  }
  return items
}

async function fetchOne(params: {
  strtYymm: string
  endYymm: string
  hsSgn: string
  cntyCd: string
}): Promise<CustomsItem[]> {
  const apiKey = process.env.CUSTOMS_API_KEY!
  const qs = new URLSearchParams({
    serviceKey: apiKey,
    strtYymm: params.strtYymm,
    endYymm: params.endYymm,
    hsSgn: params.hsSgn,
  })
  if (params.cntyCd) qs.set("cntyCd", params.cntyCd)

  const res = await fetch(`${CUSTOMS_BASE}?${qs}`, {
    headers: { Accept: "application/xml" },
    cache: "no-store",
  })
  if (!res.ok) return []

  const text = await res.text()
  const codeMatch = text.match(/<resultCode>(.*?)<\/resultCode>/)
  if (codeMatch && codeMatch[1] !== "00") return []

  return parseXml(text)
}

function shiftYymm(yymm: string, offsetMonths: number): string {
  const year = parseInt(yymm.slice(0, 4), 10)
  const month = parseInt(yymm.slice(4, 6), 10)
  const date = new Date(year, month - 1 + offsetMonths, 1)
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`
}

async function findLatestAvailableMonth(): Promise<string | null> {
  const now = new Date()
  const candidate = `${now.getFullYear()}${String(now.getMonth()).padStart(2, "0")}` // 전달

  for (let offset = 0; offset < 6; offset++) {
    const probeMonth = shiftYymm(candidate, -offset)
    const items = await fetchOne({
      strtYymm: probeMonth,
      endYymm: probeMonth,
      hsSgn: TOP_HS_CODES[0].code,
      cntyCd: "US",
    })
    if (items.length > 0) return probeMonth
  }
  return null
}

function buildPrevYearMap(items: CustomsItem[]): Map<string, CustomsItem> {
  const map = new Map<string, CustomsItem>()
  for (const item of items) {
    const month = item.year.split(".")[1] ?? ""
    map.set(`${item.hsCd}_${month}`, item)
  }
  return map
}

function sumAcrossCountries(items: CustomsItem[]): CustomsItem[] {
  const map = new Map<string, CustomsItem>()
  for (const item of items) {
    const key = `${item.hsCd}__${item.year}`
    const existing = map.get(key)
    if (!existing) {
      map.set(key, { ...item, statCd: "", statCdCntnKor1: "전체" })
    } else {
      map.set(key, {
        ...existing,
        expDlr: String(parseFloat(existing.expDlr || "0") + parseFloat(item.expDlr || "0")),
        impDlr: String(parseFloat(existing.impDlr || "0") + parseFloat(item.impDlr || "0")),
        expWgt: String(parseFloat(existing.expWgt || "0") + parseFloat(item.expWgt || "0")),
        impWgt: String(parseFloat(existing.impWgt || "0") + parseFloat(item.impWgt || "0")),
        balPayments: String(
          parseFloat(existing.balPayments || "0") + parseFloat(item.balPayments || "0")
        ),
      })
    }
  }
  return Array.from(map.values())
}

export async function GET(request: Request) {
  // Vercel Cron은 Authorization 헤더로 보호
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.CUSTOMS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "CUSTOMS_API_KEY not set" }, { status: 500 })
  }

  const latestMonth = await findLatestAvailableMonth()
  if (!latestMonth) {
    return NextResponse.json({ error: "No data available from customs API" }, { status: 503 })
  }

  const endYymm = latestMonth
  const strtYymm = shiftYymm(endYymm, -11) // 최근 12개월
  const prevStrtYymm = shiftYymm(strtYymm, -12)
  const prevEndYymm = shiftYymm(endYymm, -12)

  let totalUpserted = 0
  const errors: string[] = []

  for (const country of CACHE_COUNTRIES) {
    try {
      // 현재 기간 + 전년 동기 동시 fetch
      const hsCodeList = TOP_HS_CODES.map((h) => h.code)
      const [currResults, prevResults] = await Promise.all([
        Promise.all(
          hsCodeList.map((code) =>
            fetchOne({ strtYymm, endYymm, hsSgn: code, cntyCd: country })
          )
        ),
        Promise.all(
          hsCodeList.map((code) =>
            fetchOne({ strtYymm: prevStrtYymm, endYymm: prevEndYymm, hsSgn: code, cntyCd: country })
          )
        ),
      ])

      let currItems = currResults.flat()
      let prevItems = prevResults.flat()

      // 전체(국가 미지정)는 국가별 합산
      if (!country) {
        currItems = sumAcrossCountries(currItems)
        prevItems = sumAcrossCountries(prevItems)
      }

      const prevMap = buildPrevYearMap(prevItems)

      // DB upsert
      for (const item of currItems) {
        const [yearStr, monthStr] = item.year.split(".")
        const year = parseInt(yearStr)
        const month = parseInt(monthStr)
        const exportAmount = parseFloat(item.expDlr) || 0
        const importAmount = parseFloat(item.impDlr) || 0
        const exportQty = parseFloat(item.expWgt) || 0
        const importQty = parseFloat(item.impWgt) || 0

        const prev = prevMap.get(`${item.hsCd}_${monthStr}`)
        const prevExport = parseFloat(prev?.expDlr ?? "0") || 0
        const prevImport = parseFloat(prev?.impDlr ?? "0") || 0
        const prevExportQty = parseFloat(prev?.expWgt ?? "0") || 0
        const prevImportQty = parseFloat(prev?.impWgt ?? "0") || 0
        const avgExportPrice = exportQty > 0 ? exportAmount / exportQty : 0
        const avgImportPrice = importQty > 0 ? importAmount / importQty : 0
        const prevAvgExport = prevExportQty > 0 ? prevExport / prevExportQty : 0
        const prevAvgImport = prevImportQty > 0 ? prevImport / prevImportQty : 0

        const hsLabel = TOP_HS_CODES.find((h) => h.code === item.hsCd.slice(0, 4))?.name ?? item.statKor

        await prisma.tradeCache.upsert({
          where: {
            hsCode_country_year_month: {
              hsCode: item.hsCd,
              country: country || "전체",
              year,
              month,
            },
          },
          update: {
            productName: hsLabel,
            exportAmount,
            importAmount,
            exportQty,
            importQty,
            balance: parseFloat(item.balPayments) || exportAmount - importAmount,
            exportYoY: prevExport > 0 ? ((exportAmount - prevExport) / prevExport) * 100 : 0,
            importYoY: prevImport > 0 ? ((importAmount - prevImport) / prevImport) * 100 : 0,
            avgExportPrice,
            avgImportPrice,
            avgExportPriceYoY:
              prevAvgExport > 0 && avgExportPrice > 0
                ? ((avgExportPrice - prevAvgExport) / prevAvgExport) * 100
                : 0,
            avgImportPriceYoY:
              prevAvgImport > 0 && avgImportPrice > 0
                ? ((avgImportPrice - prevAvgImport) / prevAvgImport) * 100
                : 0,
            syncedAt: new Date(),
          },
          create: {
            hsCode: item.hsCd,
            country: country || "전체",
            year,
            month,
            productName: hsLabel,
            exportAmount,
            importAmount,
            exportQty,
            importQty,
            balance: parseFloat(item.balPayments) || exportAmount - importAmount,
            exportYoY: prevExport > 0 ? ((exportAmount - prevExport) / prevExport) * 100 : 0,
            importYoY: prevImport > 0 ? ((importAmount - prevImport) / prevImport) * 100 : 0,
            avgExportPrice,
            avgImportPrice,
            avgExportPriceYoY:
              prevAvgExport > 0 && avgExportPrice > 0
                ? ((avgExportPrice - prevAvgExport) / prevAvgExport) * 100
                : 0,
            avgImportPriceYoY:
              prevAvgImport > 0 && avgImportPrice > 0
                ? ((avgImportPrice - prevAvgImport) / prevAvgImport) * 100
                : 0,
          },
        })
        totalUpserted++
      }
    } catch (err) {
      errors.push(`country=${country || "전체"}: ${String(err)}`)
    }
  }

  return NextResponse.json({
    ok: true,
    range: { strtYymm, endYymm },
    totalUpserted,
    errors,
  })
}
