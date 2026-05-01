import { NextResponse } from "next/server"
import type { TradeRecord } from "@/types"
import type { CompanyHsCatalogEntry } from "@/lib/company-hs-catalog"
import { findCompanyByQuery, getCompanyNormalizedHsCodes } from "@/lib/company-hs-catalog"
import { normalizeHsCode, TOP_HS_CODES } from "@/lib/trade-search"
import { isGenericProductName, lookupHsName } from "@/lib/hs-excel-lookup"
import { prisma } from "@/lib/prisma"

const CUSTOMS_BASE = "http://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList"

interface CustomsItem {
  year: string
  statCd: string
  statCdCntnKor1: string
  statKor: string
  hsCd: string
  requestedHsSgn?: string
  expWgt: string
  expDlr: string
  impWgt: string
  impDlr: string
  balPayments: string
}

function isMonthlyRow(year: string): boolean {
  return /^\d{4}\.\d{2}$/.test(year)
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
    if (!isMonthlyRow(year)) continue

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
  if (params.cntyCd) {
    qs.set("cntyCd", params.cntyCd)
  }

  const res = await fetch(`${CUSTOMS_BASE}?${qs}`, {
    headers: { Accept: "application/xml" },
    cache: "no-store",
  })

  if (!res.ok) return []

  const text = await res.text()
  const codeMatch = text.match(/<resultCode>(.*?)<\/resultCode>/)
  if (codeMatch && codeMatch[1] !== "00") return []

  return parseXml(text).map((item) => ({
    ...item,
    requestedHsSgn: params.hsSgn,
  }))
}

function sumAcrossCountries(items: CustomsItem[]): CustomsItem[] {
  const map = new Map<string, CustomsItem>()

  for (const item of items) {
    const key = `${item.hsCd}__${item.year}`
    const existing = map.get(key)

    if (!existing) {
      map.set(key, { ...item, statCd: "", statCdCntnKor1: "\uC804\uCCB4" })
    } else {
      map.set(key, {
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

function aggregateByProduct(
  items: CustomsItem[],
  hsCodes: { code: string; name: string }[]
): CustomsItem[] {
  const map = new Map<string, CustomsItem>()

  for (const item of items) {
    const key = item.hsCd.slice(0, 4)
    const existing = map.get(key)
    const value = parseFloat(item.expDlr || "0") + parseFloat(item.impDlr || "0")
    const existingValue = existing
      ? parseFloat(existing.expDlr || "0") + parseFloat(existing.impDlr || "0")
      : -1

    if (value > existingValue) {
      const label = hsCodes.find((hsCode) => hsCode.code === key)?.name
      map.set(key, label ? { ...item, statKor: label, hsCd: key } : { ...item, hsCd: key })
    }
  }

  return Array.from(map.values())
}

function resolveProductName(hsCode: string, statKor: string, requestedHsSgn?: string): string {
  const name = statKor || "-"
  if (!isGenericProductName(name)) return name

  const resolvedHsCode = hsCode && hsCode !== "-" ? hsCode : requestedHsSgn ?? ""
  return lookupHsName(resolvedHsCode) ?? name
}

function toTradeRecord(item: CustomsItem): TradeRecord {
  const [year, month] = item.year.split(".")
  const exportAmount = parseFloat(item.expDlr) || 0
  const importAmount = parseFloat(item.impDlr) || 0
  const exportQty = parseFloat(item.expWgt) || 0
  const importQty = parseFloat(item.impWgt) || 0

  return {
    hsCode: item.hsCd || "-",
    productName: resolveProductName(item.hsCd, item.statKor, item.requestedHsSgn),
    country: item.statCdCntnKor1 || item.statCd || "\uC804\uCCB4",
    year: parseInt(year) || 0,
    month: parseInt(month) || 0,
    exportAmount,
    importAmount,
    exportQty,
    importQty,
    unit: "\uB2EC\uB7EC",
    balance: parseFloat(item.balPayments) || exportAmount - importAmount,
    exportYoY: 0,
    importYoY: 0,
    exportMoM: 0,
    importMoM: 0,
    avgExportPrice: exportQty > 0 ? exportAmount / exportQty : 0,
    avgImportPrice: importQty > 0 ? importAmount / importQty : 0,
    avgExportPriceYoY: 0,
    avgImportPriceYoY: 0,
  }
}

function buildDateRange(year?: number): { strtYymm: string; endYymm: string } {
  if (year) return { strtYymm: `${year}01`, endYymm: `${year}12` }

  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const start = new Date(end.getFullYear(), end.getMonth() - 11, 1)
  const format = (date: Date) =>
    `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`

  return { strtYymm: format(start), endYymm: format(end) }
}

function shiftYymm(yymm: string, offsetMonths: number): string {
  const year = parseInt(yymm.slice(0, 4), 10)
  const month = parseInt(yymm.slice(4, 6), 10)
  const date = new Date(year, month - 1 + offsetMonths, 1)

  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`
}

async function findLatestAvailableMonth(country: string): Promise<string | null> {
  const { endYymm } = buildDateRange()

  for (let offset = 0; offset < 24; offset += 1) {
    const probeMonth = shiftYymm(endYymm, -offset)
    const items = await fetchOne({
      strtYymm: probeMonth,
      endYymm: probeMonth,
      hsSgn: TOP_HS_CODES[0].code,
      cntyCd: country,
    })

    if (items.length > 0) {
      return probeMonth
    }
  }

  return null
}

async function resolveDateRange(
  country: string,
  year?: number
): Promise<{ strtYymm: string; endYymm: string }> {
  if (year) return buildDateRange(year)

  const latestMonth = await findLatestAvailableMonth(country)
  if (!latestMonth) return buildDateRange()

  return {
    strtYymm: shiftYymm(latestMonth, -11),
    endYymm: latestMonth,
  }
}

function generateMockData(country: string, companyEntry?: CompanyHsCatalogEntry): TradeRecord[] {
  const seedProducts = companyEntry
    ? getCompanyNormalizedHsCodes(companyEntry.companyName).slice(0, 16).map((code, index) => ({
        hsCode: code,
        name: code,
        baseExp: (6 + (index % 7) * 1.4) * 1e8,
        baseImp: (2 + (index % 5) * 0.9) * 1e8,
      }))
    : TOP_HS_CODES.slice(0, 10).map((item, index) => ({
        hsCode: item.code,
        name: item.name,
        baseExp: [12.5, 8.3, 5.2, 1.2, 3.8, 4.1, 2.9, 3.1, 1.8, 6.8][index] * 1e9,
        baseImp: [4.2, 2.1, 1.8, 9.5, 1.5, 5.2, 0.8, 0.8, 2.1, 2.3][index] * 1e9,
      }))

  const now = new Date()
  const rawRecords: TradeRecord[] = []

  for (const product of seedProducts) {
    for (let offset = 0; offset < 25; offset += 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - 1 - offset, 1)
      const noise = () => 0.85 + Math.random() * 0.3
      const exportAmount = Math.round((product.baseExp * noise()) / 12)
      const importAmount = Math.round((product.baseImp * noise()) / 12)
      const exportQty = Math.max(1, Math.round(exportAmount / 1000))
      const importQty = Math.max(1, Math.round(importAmount / 1000))

      rawRecords.push({
        hsCode: product.hsCode,
        productName: product.name,
        country,
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        exportAmount,
        importAmount,
        exportQty,
        importQty,
        unit: "\uB2EC\uB7EC",
        balance: exportAmount - importAmount,
        exportYoY: 0,
        importYoY: 0,
        exportMoM: 0,
        importMoM: 0,
        avgExportPrice: exportAmount / exportQty,
        avgImportPrice: importAmount / importQty,
        avgExportPriceYoY: 0,
        avgImportPriceYoY: 0,
      })
    }
  }

  const prevMap = new Map<string, TradeRecord>()
  rawRecords.forEach((r) => prevMap.set(`${r.hsCode}_${r.year}_${r.month}`, r))

  return rawRecords.map((r) => {
    const prev = prevMap.get(`${r.hsCode}_${r.year - 1}_${r.month}`)
    if (!prev) return r

    const exportYoY = prev.exportAmount > 0 ? ((r.exportAmount - prev.exportAmount) / prev.exportAmount) * 100 : 0
    const importYoY = prev.importAmount > 0 ? ((r.importAmount - prev.importAmount) / prev.importAmount) * 100 : 0
    const avgExportPriceYoY =
      prev.avgExportPrice > 0 && r.avgExportPrice > 0
        ? ((r.avgExportPrice - prev.avgExportPrice) / prev.avgExportPrice) * 100
        : 0
    const avgImportPriceYoY =
      prev.avgImportPrice > 0 && r.avgImportPrice > 0
        ? ((r.avgImportPrice - prev.avgImportPrice) / prev.avgImportPrice) * 100
        : 0

    return { ...r, exportYoY, importYoY, avgExportPriceYoY, avgImportPriceYoY }
  })
}

async function fetchItemsForRange(params: {
  strtYymm: string
  endYymm: string
  country: string
  companyHsCodes: string[]
  searchHs?: string
}): Promise<CustomsItem[]> {
  const { strtYymm, endYymm, country, companyHsCodes, searchHs } = params
  let items: CustomsItem[]

  if (companyHsCodes.length > 0) {
    const results = await Promise.all(
      companyHsCodes.map((code) => fetchOne({ strtYymm, endYymm, hsSgn: code, cntyCd: country }))
    )
    items = results.flat()
  } else if (searchHs) {
    items = await fetchOne({ strtYymm, endYymm, hsSgn: searchHs, cntyCd: country })
  } else {
    const batches: { code: string; name: string }[][] = []
    for (let index = 0; index < TOP_HS_CODES.length; index += 5) {
      batches.push(TOP_HS_CODES.slice(index, index + 5))
    }

    const results: CustomsItem[] = []
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map((item) => fetchOne({ strtYymm, endYymm, hsSgn: item.code, cntyCd: country }))
      )
      batchResults.forEach((batchItems) => results.push(...batchItems))
    }
    items = results
  }

  if (!country) {
    items = sumAcrossCountries(items)
  }

  return items
}

function buildPrevYearMap(prevItems: CustomsItem[]): Map<string, CustomsItem> {
  const map = new Map<string, CustomsItem>()
  for (const item of prevItems) {
    const month = item.year.split(".")[1] ?? ""
    map.set(`${item.hsCd}_${month}`, item)
  }
  return map
}

function applyYoY(record: TradeRecord, item: CustomsItem, prevMap: Map<string, CustomsItem>): TradeRecord {
  const month = item.year.split(".")[1] ?? ""
  const prev = prevMap.get(`${item.hsCd}_${month}`)
  if (!prev) return record

  const prevExport = parseFloat(prev.expDlr) || 0
  const prevImport = parseFloat(prev.impDlr) || 0
  const prevExportQty = parseFloat(prev.expWgt) || 0
  const prevImportQty = parseFloat(prev.impWgt) || 0
  const prevExportUnitPrice = prevExportQty > 0 ? prevExport / prevExportQty : 0
  const prevImportUnitPrice = prevImportQty > 0 ? prevImport / prevImportQty : 0

  return {
    ...record,
    exportYoY: prevExport > 0 ? ((record.exportAmount - prevExport) / prevExport) * 100 : record.exportYoY,
    importYoY: prevImport > 0 ? ((record.importAmount - prevImport) / prevImport) * 100 : record.importYoY,
    avgExportPriceYoY:
      prevExportUnitPrice > 0 && record.avgExportPrice > 0
        ? ((record.avgExportPrice - prevExportUnitPrice) / prevExportUnitPrice) * 100
        : 0,
    avgImportPriceYoY:
      prevImportUnitPrice > 0 && record.avgImportPrice > 0
        ? ((record.avgImportPrice - prevImportUnitPrice) / prevImportUnitPrice) * 100
        : 0,
  }
}

// DB에 캐시된 데이터가 있으면 반환, 없으면 null
async function queryTradeCache(params: {
  country: string
  year?: number
  hsCode?: string
}): Promise<TradeRecord[] | null> {
  const dbCountry = params.country || "전체"

  // 어떤 연월 범위를 찾을지 확인 (최근 12개월)
  const latest = await prisma.tradeCache.findFirst({
    where: { country: dbCountry },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { year: true, month: true, syncedAt: true },
  })
  if (!latest) return null

  // 마지막 sync가 이번 달 15일 이후인지 확인 (오래된 캐시 무시)
  const now = new Date()
  const syncAge = now.getTime() - latest.syncedAt.getTime()
  const maxAgeMs = 35 * 24 * 60 * 60 * 1000 // 35일
  if (syncAge > maxAgeMs) return null

  const endYear = latest.year
  const endMonth = latest.month
  const startDate = new Date(endYear, endMonth - 12, 1)

  const where = {
    country: dbCountry,
    ...(params.hsCode ? { hsCode: { startsWith: params.hsCode.slice(0, 4) } } : {}),
    OR: [
      { year: { gt: startDate.getFullYear() } },
      { year: startDate.getFullYear(), month: { gte: startDate.getMonth() + 1 } },
    ],
  }

  if (params.year) {
    Object.assign(where, { year: params.year })
    delete (where as Record<string, unknown>).OR
  }

  const rows = await prisma.tradeCache.findMany({ where })
  if (rows.length === 0) return null

  return rows.map((row) => ({
    hsCode: row.hsCode,
    productName: row.productName,
    country: row.country,
    year: row.year,
    month: row.month,
    exportAmount: row.exportAmount,
    importAmount: row.importAmount,
    exportQty: row.exportQty,
    importQty: row.importQty,
    unit: "달러",
    balance: row.balance,
    exportYoY: row.exportYoY,
    importYoY: row.importYoY,
    exportMoM: 0,
    importMoM: 0,
    avgExportPrice: row.avgExportPrice,
    avgImportPrice: row.avgImportPrice,
    avgExportPriceYoY: row.avgExportPriceYoY,
    avgImportPriceYoY: row.avgImportPriceYoY,
  }))
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get("q") ?? ""
  const hsParam = searchParams.get("hs") ?? undefined
  const country = searchParams.get("country") ?? "US"
  const year = searchParams.get("year") ? parseInt(searchParams.get("year")!, 10) : undefined
  const timestamp = new Date().toISOString()
  const companyEntry = findCompanyByQuery(query)

  try {
    const apiKey = process.env.CUSTOMS_API_KEY
    if (!apiKey) {
      return NextResponse.json({ data: generateMockData(country, companyEntry), timestamp, source: "mock" })
    }

    // 회사나 세부 HS 코드 검색이 아닌 기본 쿼리는 DB 캐시 우선 조회
    const searchHs = companyEntry ? undefined : normalizeHsCode(hsParam) ?? normalizeHsCode(query)
    const isDefaultQuery = !companyEntry && (!searchHs || searchHs.length <= 4)

    if (isDefaultQuery) {
      const cached = await queryTradeCache({ country, year, hsCode: searchHs })
      if (cached) {
        return NextResponse.json({ data: cached, timestamp, source: "cache" })
      }
    }

    const { strtYymm, endYymm } = await resolveDateRange(country, year)
    const companyHsCodes = companyEntry ? getCompanyNormalizedHsCodes(companyEntry.companyName) : []
    const isDetailedHsSearch = Boolean(searchHs && searchHs.length > 4)

    const fetchParams = { country, companyHsCodes, searchHs }

    const prevStrtYymm = shiftYymm(strtYymm, -12)
    const prevEndYymm = shiftYymm(endYymm, -12)

    const [allItems, prevItems] = await Promise.all([
      fetchItemsForRange({ strtYymm, endYymm, ...fetchParams }),
      fetchItemsForRange({ strtYymm: prevStrtYymm, endYymm: prevEndYymm, ...fetchParams }),
    ])

    const prevMap = buildPrevYearMap(prevItems)

    let data: TradeRecord[]

    if (companyEntry) {
      data = allItems.map((item) => applyYoY(toTradeRecord(item), item, prevMap))
    } else if (isDetailedHsSearch && searchHs) {
      data = allItems
        .filter((item) => item.hsCd === searchHs)
        .map((item) => applyYoY(toTradeRecord(item), item, prevMap))
    } else {
      const byMonth = new Map<string, CustomsItem[]>()
      for (const item of allItems) {
        const key = item.year
        if (!byMonth.has(key)) byMonth.set(key, [])
        byMonth.get(key)!.push(item)
      }

      const aggregated: CustomsItem[] = []
      for (const [, items] of byMonth) {
        aggregated.push(...aggregateByProduct(items, TOP_HS_CODES))
      }
      data = aggregated.map((item) => applyYoY(toTradeRecord(item), item, prevMap))
    }

    return NextResponse.json({ data, timestamp, source: "live", range: { strtYymm, endYymm } })
  } catch (error) {
    console.error("[trade API]", error)
    return NextResponse.json({
      data: generateMockData(country, companyEntry),
      timestamp,
      source: "mock",
      warning: String(error),
    })
  }
}
