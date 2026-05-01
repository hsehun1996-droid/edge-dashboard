import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { TOP_HS_CODES } from "@/lib/trade-search"

export const maxDuration = 300

const CUSTOMS_BASE = "http://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList"

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
      year, statCd: get("statCd"), statCdCntnKor1: get("statCdCntnKor1"),
      statKor: get("statKor"), hsCd: get("hsCd"),
      expWgt: get("expWgt"), expDlr: get("expDlr"),
      impWgt: get("impWgt"), impDlr: get("impDlr"),
      balPayments: get("balPayments"),
    })
  }
  return items
}

async function fetchMonth(yymm: string, hsSgn: string): Promise<CustomsItem[]> {
  const apiKey = process.env.CUSTOMS_API_KEY!
  const qs = new URLSearchParams({
    serviceKey: apiKey,
    strtYymm: yymm,
    endYymm: yymm,
    hsSgn,
  })
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

function sumAcrossCountries(items: CustomsItem[]): CustomsItem[] {
  const map = new Map<string, CustomsItem>()
  for (const item of items) {
    const existing = map.get(item.hsCd)
    if (!existing) {
      map.set(item.hsCd, { ...item, statCd: "", statCdCntnKor1: "전체" })
    } else {
      map.set(item.hsCd, {
        ...existing,
        expDlr: String(parseFloat(existing.expDlr || "0") + parseFloat(item.expDlr || "0")),
        impDlr: String(parseFloat(existing.impDlr || "0") + parseFloat(item.impDlr || "0")),
        expWgt: String(parseFloat(existing.expWgt || "0") + parseFloat(item.expWgt || "0")),
        impWgt: String(parseFloat(existing.impWgt || "0") + parseFloat(item.impWgt || "0")),
        balPayments: String(parseFloat(existing.balPayments || "0") + parseFloat(item.balPayments || "0")),
      })
    }
  }
  return Array.from(map.values())
}

// YYYY.MM → YYYYMM
function shiftYymm(yymm: string, offsetMonths: number): string {
  const year = parseInt(yymm.slice(0, 4), 10)
  const month = parseInt(yymm.slice(4, 6), 10)
  const date = new Date(year, month - 1 + offsetMonths, 1)
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.CUSTOMS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "CUSTOMS_API_KEY not set" }, { status: 500 })
  }

  // 크론은 15일에 실행 → 전달 데이터가 나와 있음
  const { searchParams } = new URL(request.url)
  const now = new Date()
  const defaultYymm = `${now.getFullYear()}${String(now.getMonth()).padStart(2, "0")}` // 전달

  // ?yymm=202503 으로 수동 지정 가능
  const targetYymm = searchParams.get("yymm") ?? defaultYymm
  const prevYymm = shiftYymm(targetYymm, -12) // 전년 동월

  const hsCodes = TOP_HS_CODES.map((h) => h.code)

  // 현재 월 + 전년 동월 동시 fetch (20 + 20 = 40 병렬 호출)
  const [currResults, prevResults] = await Promise.all([
    Promise.all(hsCodes.map((code) => fetchMonth(targetYymm, code))),
    Promise.all(hsCodes.map((code) => fetchMonth(prevYymm, code))),
  ])

  const currItems = sumAcrossCountries(currResults.flat())
  const prevItems = sumAcrossCountries(prevResults.flat())
  const prevMap = new Map(prevItems.map((item) => [item.hsCd, item]))

  if (currItems.length === 0) {
    return NextResponse.json({ error: `No data for ${targetYymm}`, targetYymm }, { status: 404 })
  }

  const [yearStr, monthStr] = currItems[0].year.split(".")
  const year = parseInt(yearStr)
  const month = parseInt(monthStr)

  // 배치 upsert: 해당 월 기존 데이터 삭제 후 일괄 insert
  await prisma.tradeCache.deleteMany({ where: { country: "전체", year, month } })

  const rows = currItems.map((item) => {
    const prev = prevMap.get(item.hsCd)
    const exportAmount = parseFloat(item.expDlr) || 0
    const importAmount = parseFloat(item.impDlr) || 0
    const exportQty = parseFloat(item.expWgt) || 0
    const importQty = parseFloat(item.impWgt) || 0
    const prevExport = parseFloat(prev?.expDlr ?? "0") || 0
    const prevImport = parseFloat(prev?.impDlr ?? "0") || 0
    const prevExportQty = parseFloat(prev?.expWgt ?? "0") || 0
    const prevImportQty = parseFloat(prev?.impWgt ?? "0") || 0
    const avgExportPrice = exportQty > 0 ? exportAmount / exportQty : 0
    const avgImportPrice = importQty > 0 ? importAmount / importQty : 0
    const prevAvgExport = prevExportQty > 0 ? prevExport / prevExportQty : 0
    const prevAvgImport = prevImportQty > 0 ? prevImport / prevImportQty : 0
    const hsLabel = TOP_HS_CODES.find((h) => h.code === item.hsCd.slice(0, 4))?.name ?? item.statKor

    return {
      hsCode: item.hsCd,
      country: "전체",
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
      avgExportPriceYoY: prevAvgExport > 0 && avgExportPrice > 0
        ? ((avgExportPrice - prevAvgExport) / prevAvgExport) * 100 : 0,
      avgImportPriceYoY: prevAvgImport > 0 && avgImportPrice > 0
        ? ((avgImportPrice - prevAvgImport) / prevAvgImport) * 100 : 0,
    }
  })

  await prisma.tradeCache.createMany({ data: rows })

  return NextResponse.json({
    ok: true,
    targetYymm,
    inserted: rows.length,
  })
}
