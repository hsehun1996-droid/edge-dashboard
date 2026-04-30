"use client"

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Scale,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { Header } from "@/components/layout/header"
import { ErrorState, EmptyState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { TableRowSkeleton } from "@/components/ui/skeleton"
import {
  cn,
  formatCompactDisplayCurrency,
  formatDisplayCurrency,
  formatPercent,
  getChangeColor,
} from "@/lib/utils"
import { useCurrency } from "@/store/currency"
import type { TradeRecord, TradeSuggestion } from "@/types"

const COUNTRIES = [
  { code: "", label: "전체", flag: "🌐" },
  { code: "US", label: "미국", flag: "🇺🇸" },
  { code: "CN", label: "중국", flag: "🇨🇳" },
  { code: "JP", label: "일본", flag: "🇯🇵" },
  { code: "VN", label: "베트남", flag: "🇻🇳" },
  { code: "DE", label: "독일", flag: "🇩🇪" },
  { code: "AU", label: "호주", flag: "🇦🇺" },
  { code: "SA", label: "사우디", flag: "🇸🇦" },
]

type SortKey = "productName" | "exportAmount" | "importAmount" | "balance" | "exportYoY" | "importYoY"

interface ChartTooltipPayload {
  color?: string
  name?: string
  value?: number
}

interface ChartTooltipProps {
  active?: boolean
  payload?: ChartTooltipPayload[]
  label?: string
}

interface TradeCompanySummary {
  companyName: string
  ticker?: string
  exchange?: "KOSPI" | "KOSDAQ"
  marketCap: number
  itemCount: number
}

interface TradeSelection {
  key: string
  record: TradeRecord
  records: TradeRecord[]
}

function getRecordKey(record: Pick<TradeRecord, "hsCode" | "productName">) {
  return `${record.hsCode}__${record.productName}`
}

function aggregateLatestRecords(records: TradeRecord[]) {
  const map = new Map<string, TradeRecord>()

  records.forEach((record) => {
    const key = getRecordKey(record)
    const existing = map.get(key)
    if (!existing || record.year > existing.year || (record.year === existing.year && record.month > existing.month)) {
      map.set(key, record)
    }
  })

  return Array.from(map.values())
}

function formatMarketCap(value: number) {
  if (!value) return "-"
  return formatCompactDisplayCurrency(value * 100_000_000, "KRW", 1)
}

function SortButton({
  label,
  sortKey,
  activeSortKey,
  onClick,
}: {
  label: string
  sortKey: SortKey
  activeSortKey: SortKey
  onClick: (key: SortKey) => void
}) {
  return (
    <button
      type="button"
      className="flex items-center gap-1 transition-colors hover:text-text-secondary"
      onClick={() => onClick(sortKey)}
    >
      {label}
      <ArrowUpDown size={10} className={activeSortKey === sortKey ? "text-accent" : ""} />
    </button>
  )
}

function SuggestionList({
  suggestions,
  activeIndex,
  onSelect,
}: {
  suggestions: TradeSuggestion[]
  activeIndex: number
  onSelect: (suggestion: TradeSuggestion) => void
}) {
  return (
    <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-2xl border border-surface-border bg-bg-primary shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
      <div className="border-b border-surface-border bg-bg-secondary px-4 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-text-tertiary">
        Search Suggestions
      </div>
      <div className="max-h-80 overflow-y-auto py-1.5">
        {suggestions.map((suggestion, index) => (
          <button
            key={`${suggestion.matchType}-${suggestion.queryValue}-${suggestion.hsCode ?? suggestion.productName}`}
            type="button"
            className={cn(
              "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors",
              index === activeIndex ? "bg-accent/10" : "hover:bg-bg-secondary"
            )}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(suggestion)}
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-text-primary">{suggestion.productName}</p>
              <p className="mt-0.5 text-[11px] text-text-tertiary">
                {suggestion.matchType === "company" ? suggestion.subtitle : `HS ${suggestion.hsCode}`}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-bg-secondary px-2 py-1 text-[10px] font-semibold text-text-tertiary">
              {suggestion.matchType === "hsCode"
                ? "Code"
                : suggestion.matchType === "company"
                  ? "Company"
                  : "Product"}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

async function fetchTradeData(params: {
  query: string
  country: string
}): Promise<{ records: TradeRecord[]; source: string }> {
  const qs = new URLSearchParams({ q: params.query, country: params.country })
  const res = await fetch(`/api/trade?${qs}`)
  if (!res.ok) throw new Error("무역 데이터를 불러오지 못했습니다.")
  const json = await res.json()
  return { records: json.data, source: json.source ?? "live" }
}

async function fetchTradeSuggestions(query: string): Promise<TradeSuggestion[]> {
  const qs = new URLSearchParams({ q: query })
  const res = await fetch(`/api/trade/suggest?${qs}`)
  if (!res.ok) throw new Error("검색 제안을 불러오지 못했습니다.")
  const json = await res.json()
  return json.data ?? []
}

async function fetchTradeCompanies(): Promise<{ companies: TradeCompanySummary[]; source: string }> {
  const res = await fetch("/api/trade/companies")
  if (!res.ok) throw new Error("종목 목록을 불러오지 못했습니다.")
  const json = await res.json()
  return { companies: json.data ?? [], source: json.source ?? "catalog" }
}

function computeYoY(records: TradeRecord[]): TradeRecord[] {
  const map = new Map<string, TradeRecord>()
  records.forEach((record) => map.set(`${record.hsCode}_${record.year}_${record.month}`, record))

  return records.map((record) => {
    const prev = map.get(`${record.hsCode}_${record.year - 1}_${record.month}`)
    const exportYoY = prev && prev.exportAmount > 0
      ? ((record.exportAmount - prev.exportAmount) / prev.exportAmount) * 100
      : record.exportYoY
    const importYoY = prev && prev.importAmount > 0
      ? ((record.importAmount - prev.importAmount) / prev.importAmount) * 100
      : record.importYoY

    return { ...record, exportYoY, importYoY }
  })
}

function CustomTooltip({
  active,
  payload,
  label,
  currency,
  exchangeRate,
}: ChartTooltipProps & { currency: "USD" | "KRW"; exchangeRate: number }) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border border-white/10 bg-[#1D1D1F] px-3 py-2.5 text-[12px] text-white shadow-xl">
      <p className="mb-1.5 text-[11px] font-semibold text-white/60">{label}</p>
      {payload.map((item, index) => (
        <p key={`${item.name ?? "value"}-${index}`} className="flex justify-between gap-4">
          <span style={{ color: item.color }}>{item.name}</span>
          <span className="font-semibold tabular-nums">
            {formatCompactDisplayCurrency(item.value ?? 0, currency, exchangeRate)}
          </span>
        </p>
      ))}
    </div>
  )
}

function getExportUnitPrice(record: TradeRecord) {
  if (record.avgExportPrice > 0) return record.avgExportPrice
  if (record.exportQty > 0) return record.exportAmount / record.exportQty
  return 0
}

function formatUnitPrice(value: number, currency: "USD" | "KRW", exchangeRate: number) {
  if (value <= 0) return "-"

  const converted = currency === "KRW" ? value * exchangeRate : value
  if (converted >= 1000) return formatDisplayCurrency(value, currency, exchangeRate)

  const digits = currency === "KRW" ? 0 : converted >= 100 ? 2 : converted >= 1 ? 3 : 4
  return currency === "KRW" ? `${converted.toFixed(digits)}원` : `$${converted.toFixed(digits)}`
}

function getSortValue(record: TradeRecord, key: SortKey) {
  switch (key) {
    case "productName":
      return record.productName
    case "exportAmount":
      return record.exportAmount
    case "importAmount":
      return record.importAmount
    case "balance":
      return record.balance
    case "exportYoY":
      return record.exportYoY
    case "importYoY":
      return record.importYoY
  }
}

function BalanceBadge({ value }: { value: number }) {
  const currency = useCurrency((state) => state.currency)
  const exchangeRate = useCurrency((state) => state.exchangeRate)
  const isPositive = value >= 0

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[12px] font-semibold tabular-nums",
        isPositive ? "text-positive" : "text-negative"
      )}
    >
      {isPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {formatCompactDisplayCurrency(Math.abs(value), currency, exchangeRate)}
    </span>
  )
}

function CompanyTradeRow({
  company,
  country,
  expanded,
  onToggle,
  onSelectProduct,
  selectedProductKey,
}: {
  company: TradeCompanySummary
  country: string
  expanded: boolean
  onToggle: () => void
  onSelectProduct: (selection: TradeSelection | null) => void
  selectedProductKey: string | null
}) {
  const currency = useCurrency((state) => state.currency)
  const exchangeRate = useCurrency((state) => state.exchangeRate)

  const { data, isLoading } = useQuery({
    queryKey: ["trade-company", country, company.companyName],
    queryFn: () => fetchTradeData({ query: company.companyName, country }),
    enabled: expanded,
    staleTime: 30 * 60 * 1000,
  })

  const records = useMemo(() => computeYoY(data?.records ?? []), [data?.records])
  const latestProducts = useMemo(
    () => aggregateLatestRecords(records).sort((a, b) => b.exportAmount - a.exportAmount),
    [records]
  )

  const totals = useMemo(
    () =>
      latestProducts.reduce(
        (acc, record) => {
          acc.exportAmount += record.exportAmount
          acc.importAmount += record.importAmount
          acc.balance += record.balance
          return acc
        },
        { exportAmount: 0, importAmount: 0, balance: 0 }
      ),
    [latestProducts]
  )

  return (
    <div className="border-b border-surface-border/50">
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full grid-cols-[2.1fr_1fr_1fr_1fr_90px] items-center gap-2 px-5 py-3.5 text-left text-[13px] transition-colors hover:bg-bg-secondary"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown size={15} className="text-text-tertiary" /> : <ChevronRight size={15} className="text-text-tertiary" />}
          <div className="min-w-0">
            <p className="truncate font-medium text-text-primary">{company.companyName}</p>
            <p className="text-[11px] text-text-tertiary">
              {company.ticker ?? "티커 매핑 대기"}{company.exchange ? ` · ${company.exchange}` : ""}
            </p>
          </div>
        </div>
        <span className="font-medium tabular-nums text-text-primary">{formatMarketCap(company.marketCap)}</span>
        <span className="font-medium tabular-nums text-text-primary">
          {expanded && latestProducts.length > 0 ? formatCompactDisplayCurrency(totals.exportAmount, currency, exchangeRate) : "-"}
        </span>
        <span className="font-medium tabular-nums text-text-primary">
          {expanded && latestProducts.length > 0 ? formatCompactDisplayCurrency(totals.importAmount, currency, exchangeRate) : "-"}
        </span>
        <span className="text-[12px] font-medium text-text-tertiary">{company.itemCount}개</span>
      </button>

      {expanded && (
        <div className="bg-bg-secondary/50 px-5 pb-3">
          {isLoading ? (
            <div className="space-y-2 pt-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <TableRowSkeleton key={index} cols={5} />
              ))}
            </div>
          ) : latestProducts.length === 0 ? (
            <div className="py-6 text-[12px] text-text-tertiary">하위 품목 데이터를 찾지 못했습니다.</div>
          ) : (
            <div className="space-y-1 pt-2">
              <div className="grid grid-cols-[2.1fr_1fr_1fr_1fr_90px] gap-2 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                <span>하위 품목</span>
                <span>수출액</span>
                <span>수입액</span>
                <span>무역수지</span>
                <span>수출 YoY</span>
              </div>
              {latestProducts.map((record) => {
                const key = getRecordKey(record)
                const isSelected = selectedProductKey === key

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      onSelectProduct(
                        isSelected
                          ? null
                          : {
                              key,
                              record,
                              records,
                            }
                      )
                    }
                    className={cn(
                      "grid w-full grid-cols-[2.1fr_1fr_1fr_1fr_90px] gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors",
                      isSelected ? "bg-accent/10" : "hover:bg-bg-primary"
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-text-primary">{record.productName}</p>
                      <p className="text-[11px] text-text-tertiary">HS {record.hsCode}</p>
                    </div>
                    <span className="font-medium tabular-nums text-text-primary">
                      {formatCompactDisplayCurrency(record.exportAmount, currency, exchangeRate)}
                    </span>
                    <span className="font-medium tabular-nums text-text-primary">
                      {formatCompactDisplayCurrency(record.importAmount, currency, exchangeRate)}
                    </span>
                    <BalanceBadge value={record.balance} />
                    <span className={cn("text-[12px] font-medium tabular-nums", getChangeColor(record.exportYoY))}>
                      {formatPercent(record.exportYoY)}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TradeDetailPanel({
  selection,
  onClose,
}: {
  selection: TradeSelection | null
  onClose: () => void
}) {
  const currency = useCurrency((state) => state.currency)
  const exchangeRate = useCurrency((state) => state.exchangeRate)

  const selectedRecord = selection?.record ?? null
  const selectedRecordSet = selection?.records ?? []
  const selectedProductKey = selection?.key ?? null
  const selectedExportUnitPrice = selectedRecord ? getExportUnitPrice(selectedRecord) : 0

  const amountTrendData = useMemo(() => {
    if (!selectedProductKey) return []

    return selectedRecordSet
      .filter((record) => getRecordKey(record) === selectedProductKey)
      .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month))
      .slice(-12)
      .map((record) => ({
        label: `${record.year}.${String(record.month).padStart(2, "0")}`,
        exportAmount: record.exportAmount,
        importAmount: record.importAmount,
      }))
  }, [selectedProductKey, selectedRecordSet])

  const unitPriceTrendData = useMemo(() => {
    if (!selectedProductKey) return []

    return selectedRecordSet
      .filter((record) => getRecordKey(record) === selectedProductKey)
      .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month))
      .slice(-12)
      .map((record) => ({
        label: `${record.year}.${String(record.month).padStart(2, "0")}`,
        exportUnitPrice: getExportUnitPrice(record),
      }))
  }, [selectedProductKey, selectedRecordSet])

  const yoyTrendData = useMemo(() => {
    if (!selectedProductKey) return []

    return selectedRecordSet
      .filter((record) => getRecordKey(record) === selectedProductKey)
      .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month))
      .slice(-12)
      .map((record) => ({
        label: `${record.year}.${String(record.month).padStart(2, "0")}`,
        exportAmountYoY: record.exportYoY || null,
        exportUnitPriceYoY: record.avgExportPriceYoY || null,
      }))
  }, [selectedProductKey, selectedRecordSet])

  if (!selectedRecord || amountTrendData.length === 0) {
    return (
      <div className="card flex min-h-[300px] flex-col items-center justify-center gap-3 p-8 text-center">
        <Scale size={28} className="text-text-tertiary" />
        <p className="text-[14px] font-medium text-text-secondary">품목을 선택하면</p>
        <p className="text-[12px] text-text-tertiary">
          월별 수출입 추이와 무역수지 흐름을
          <br />
          오른쪽에서 바로 볼 수 있습니다.
        </p>
      </div>
    )
  }

  return (
    <div className="card animate-[fade-in-up_200ms_ease-out] space-y-5 p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="leading-snug text-[15px] font-semibold text-text-primary">
            {selectedRecord.productName}
          </h3>
          <p className="mt-0.5 text-[12px] text-text-tertiary">
            HS {selectedRecord.hsCode} · 최근 12개월
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-[12px] text-text-tertiary transition-all hover:bg-bg-secondary hover:text-text-secondary"
        >
          닫기
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          {
            label: "수출액",
            value: formatCompactDisplayCurrency(selectedRecord.exportAmount, currency, exchangeRate),
            color: "text-chart-1",
          },
          {
            label: "수입액",
            value: formatCompactDisplayCurrency(selectedRecord.importAmount, currency, exchangeRate),
            color: "text-chart-2",
          },
          {
            label: "무역수지",
            value: `${selectedRecord.balance >= 0 ? "+" : ""}${formatCompactDisplayCurrency(Math.abs(selectedRecord.balance), currency, exchangeRate)}`,
            color: getChangeColor(selectedRecord.balance),
          },
          {
            label: "수출 단가",
            value: formatUnitPrice(selectedExportUnitPrice, currency, exchangeRate),
            color: "text-chart-3",
          },
        ].map((item) => (
          <div key={item.label} className="rounded-xl bg-bg-secondary px-4 py-3">
            <p className="mb-1 text-[11px] text-text-tertiary">{item.label}</p>
            <p className={cn("text-[16px] font-bold tabular-nums", item.color)}>{item.value}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="mb-3 text-[12px] font-medium text-text-tertiary">수출입 금액 추이</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={amountTrendData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }} />
            <YAxis
              tickFormatter={(value) => formatCompactDisplayCurrency(Number(value), currency, exchangeRate)}
              tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
              width={55}
            />
            <Tooltip content={<CustomTooltip currency={currency} exchangeRate={exchangeRate} />} />
            <Legend wrapperStyle={{ fontSize: "11px" }} iconType="rect" iconSize={8} />
            <Bar dataKey="exportAmount" fill="var(--color-chart-1)" radius={[2, 2, 0, 0]} name="수출" />
            <Bar dataKey="importAmount" fill="var(--color-chart-2)" radius={[2, 2, 0, 0]} name="수입" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <p className="mb-3 text-[12px] font-medium text-text-tertiary">수출금액 YoY</p>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={yoyTrendData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }} />
            <YAxis
              tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
              tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
              width={40}
            />
            <ReferenceLine y={0} stroke="var(--color-text-tertiary)" strokeDasharray="3 3" />
            <Tooltip
              formatter={(value) => [
                value != null ? `${Number(value).toFixed(1)}%` : "-",
                "수출금액 YoY",
              ]}
              contentStyle={{
                background: "#1D1D1F",
                border: "none",
                borderRadius: "8px",
                color: "#fff",
                fontSize: "12px",
              }}
            />
            <Line
              type="monotone"
              dataKey="exportAmountYoY"
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              dot={{ r: 2, fill: "var(--color-chart-1)" }}
              name="수출금액 YoY"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <p className="mb-3 text-[12px] font-medium text-text-tertiary">수출 단가 추이</p>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={unitPriceTrendData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }} />
            <YAxis
              tickFormatter={(value) => formatUnitPrice(Number(value), currency, exchangeRate)}
              tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
              width={64}
            />
            <Tooltip
              formatter={(value) => [formatUnitPrice(Number(value ?? 0), currency, exchangeRate), "수출 단가"]}
              contentStyle={{
                background: "#1D1D1F",
                border: "none",
                borderRadius: "8px",
                color: "#fff",
                fontSize: "12px",
              }}
            />
            <Line
              type="monotone"
              dataKey="exportUnitPrice"
              stroke="var(--color-chart-3)"
              strokeWidth={2}
              dot={{ r: 2, fill: "var(--color-chart-3)" }}
              name="수출 단가"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <p className="mb-3 text-[12px] font-medium text-text-tertiary">수출 단가 YoY</p>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={yoyTrendData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }} />
            <YAxis
              tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
              tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
              width={40}
            />
            <ReferenceLine y={0} stroke="var(--color-text-tertiary)" strokeDasharray="3 3" />
            <Tooltip
              formatter={(value) => [
                value != null ? `${Number(value).toFixed(1)}%` : "-",
                "수출 단가 YoY",
              ]}
              contentStyle={{
                background: "#1D1D1F",
                border: "none",
                borderRadius: "8px",
                color: "#fff",
                fontSize: "12px",
              }}
            />
            <Line
              type="monotone"
              dataKey="exportUnitPriceYoY"
              stroke="var(--color-chart-3)"
              strokeWidth={2}
              dot={{ r: 2, fill: "var(--color-chart-3)" }}
              name="수출 단가 YoY"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default function TradePage() {
  const currency = useCurrency((state) => state.currency)
  const exchangeRate = useCurrency((state) => state.exchangeRate)
  const [country, setCountry] = useState("")
  const [inputValue, setInputValue] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("exportAmount")
  const [sortAsc, setSortAsc] = useState(false)
  const [selectedTrade, setSelectedTrade] = useState<TradeSelection | null>(null)
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1)
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null)
  const searchWrapRef = useRef<HTMLDivElement | null>(null)
  const deferredInputValue = useDeferredValue(inputValue.trim())
  const isDefaultView = searchQuery === ""

  const {
    data,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["trade", country, searchQuery],
    queryFn: () => fetchTradeData({ query: searchQuery, country }),
    enabled: !isDefaultView,
    staleTime: 30 * 60 * 1000,
  })

  const {
    data: companyData,
    isLoading: isCompaniesLoading,
    error: companyError,
    refetch: refetchCompanies,
    isFetching: isCompaniesFetching,
  } = useQuery({
    queryKey: ["trade-companies"],
    queryFn: fetchTradeCompanies,
    enabled: isDefaultView,
    staleTime: 24 * 60 * 60 * 1000,
  })

  const {
    data: suggestions = [],
    isFetching: isSuggestionsFetching,
  } = useQuery({
    queryKey: ["trade-suggestions", deferredInputValue],
    queryFn: () => fetchTradeSuggestions(deferredInputValue),
    enabled: deferredInputValue.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  const records = useMemo(() => computeYoY(data?.records ?? []), [data?.records])
  const companies = companyData?.companies ?? []
  const isLive = data?.source === "live"
  const selectedProductKey = selectedTrade?.key ?? null

  const aggregated = useMemo(() => {
    const list = aggregateLatestRecords(records)
    return list.sort((a, b) => {
      const va = getSortValue(a, sortKey)
      const vb = getSortValue(b, sortKey)

      if (typeof va === "string" && typeof vb === "string") {
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
      }

      return sortAsc ? Number(va) - Number(vb) : Number(vb) - Number(va)
    })
  }, [records, sortKey, sortAsc])

  useEffect(() => {
    setSelectedTrade(null)
  }, [country, searchQuery])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!searchWrapRef.current?.contains(event.target as Node)) {
        setIsSuggestionOpen(false)
        setActiveSuggestionIndex(-1)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [])

  const showSuggestions = isSuggestionOpen && inputValue.trim().length > 0
  const highlightedSuggestionIndex = suggestions.length === 0
    ? -1
    : activeSuggestionIndex < 0
      ? 0
      : Math.min(activeSuggestionIndex, suggestions.length - 1)

  const handleSearchSubmit = (query: string) => {
    setSearchQuery(query.trim())
    setExpandedCompany(null)
    setIsSuggestionOpen(false)
    setActiveSuggestionIndex(-1)
  }

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault()
    handleSearchSubmit(inputValue)
  }

  const handleSuggestionSelect = (suggestion: TradeSuggestion) => {
    setInputValue(
      suggestion.matchType === "company"
        ? suggestion.productName
        : `${suggestion.hsCode ?? suggestion.queryValue} ${suggestion.productName}`
    )
    handleSearchSubmit(suggestion.queryValue)
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
      return
    }

    setSortKey(key)
    setSortAsc(false)
  }

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (event.key === "Escape") {
        setIsSuggestionOpen(false)
      }
      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveSuggestionIndex((prev) => (prev + 1) % suggestions.length)
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveSuggestionIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1))
      return
    }

    if (event.key === "Enter" && highlightedSuggestionIndex >= 0) {
      event.preventDefault()
      handleSuggestionSelect(suggestions[highlightedSuggestionIndex])
      return
    }

    if (event.key === "Escape") {
      event.preventDefault()
      setIsSuggestionOpen(false)
      setActiveSuggestionIndex(-1)
    }
  }

  return (
    <div className="space-y-6 animate-[fade-in-up_350ms_ease-out]">
      <Header
        title="Trade Data Insights"
        subtitle="관심 국가 기준 종목별·품목별 수출입 통계"
        onRefresh={isDefaultView ? refetchCompanies : refetch}
        isRefreshing={isDefaultView ? isCompaniesFetching : isFetching}
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-wrap gap-1 rounded-xl border border-surface-border bg-bg-secondary p-1">
          {COUNTRIES.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => {
                setCountry(item.code)
                setExpandedCompany(null)
              }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all",
                country === item.code
                  ? "bg-accent text-white shadow-sm"
                  : "text-text-secondary hover:bg-bg-primary hover:text-text-primary"
              )}
            >
              {item.flag} {item.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearch} className="flex flex-1 gap-2">
          <div ref={searchWrapRef} className="relative flex-1">
            <Input
              value={inputValue}
              onChange={(event) => {
                setInputValue(event.target.value)
                setIsSuggestionOpen(true)
                setActiveSuggestionIndex(0)
              }}
              onFocus={() => {
                if (inputValue.trim().length > 0) {
                  setIsSuggestionOpen(true)
                  setActiveSuggestionIndex(0)
                }
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="종목명 또는 HS 코드/품목명 입력 예: 삼성전자, 8542, 반도체"
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={showSuggestions}
              icon={<Search size={15} />}
              className="flex-1"
            />

            {showSuggestions && (
              <>
                {suggestions.length > 0 ? (
                  <SuggestionList
                    suggestions={suggestions}
                    activeIndex={highlightedSuggestionIndex}
                    onSelect={handleSuggestionSelect}
                  />
                ) : !isSuggestionsFetching ? (
                  <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 rounded-2xl border border-surface-border bg-bg-primary px-4 py-3 text-[12px] text-text-tertiary shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
                    일치하는 제안이 없습니다. Enter로 바로 검색할 수 있습니다.
                  </div>
                ) : null}
              </>
            )}
          </div>

          <button
            type="submit"
            className="rounded-xl bg-accent px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent/90"
          >
            검색
          </button>
        </form>
      </div>

      {!isDefaultView && !isLoading && data && (
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
              isLive ? "bg-positive/10 text-positive" : "bg-neutral/10 text-neutral"
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", isLive ? "bg-positive" : "bg-neutral")} />
            {isLive ? "실시간 관세청 데이터" : "모의 데이터"}
          </span>
          {isLive && (
            <span className="text-[11px] text-text-tertiary">
              {COUNTRIES.find((item) => item.code === country)?.label} 대상 수출입 추적
            </span>
          )}
        </div>
      )}

      {isDefaultView ? companyError ? (
        <ErrorState onRetry={refetchCompanies} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_400px]">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
              <div>
                <h2 className="text-[15px] font-semibold text-text-primary">종목별 수출입 현황</h2>
                <p className="mt-0.5 text-[12px] text-text-tertiary">
                  시가총액 순 정렬 · 종목을 누르면 하위 품목이 펼쳐집니다.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-[2.1fr_1fr_1fr_1fr_90px] gap-2 border-b border-surface-border bg-bg-secondary px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              <span>종목</span>
              <span>시가총액</span>
              <span>수출액</span>
              <span>수입액</span>
              <span>품목 수</span>
            </div>

            {isCompaniesLoading ? (
              Array.from({ length: 8 }).map((_, index) => <TableRowSkeleton key={index} cols={5} />)
            ) : companies.length === 0 ? (
              <div className="py-12">
                <EmptyState
                  title="표시할 종목이 없습니다."
                  message="검색으로 개별 종목이나 품목을 바로 확인해보세요."
                  icon={<Search size={20} />}
                />
              </div>
            ) : (
              companies.map((company) => (
                <CompanyTradeRow
                  key={company.companyName}
                  company={company}
                  country={country}
                  expanded={expandedCompany === company.companyName}
                  onToggle={() => setExpandedCompany((prev) => (prev === company.companyName ? null : company.companyName))}
                  selectedProductKey={selectedProductKey}
                  onSelectProduct={setSelectedTrade}
                />
              ))
            )}
          </div>

          <TradeDetailPanel selection={selectedTrade} onClose={() => setSelectedTrade(null)} />
        </div>
      ) : error ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_400px]">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
              <div>
                <h2 className="text-[15px] font-semibold text-text-primary">품목별 수출입 현황</h2>
                {!isLoading && (
                  <p className="mt-0.5 text-[12px] text-text-tertiary">
                    {aggregated.length}개 품목 · 최신월 기준
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_80px_80px] gap-2 border-b border-surface-border bg-bg-secondary px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              <SortButton label="품목" sortKey="productName" activeSortKey={sortKey} onClick={handleSort} />
              <SortButton label="수출액" sortKey="exportAmount" activeSortKey={sortKey} onClick={handleSort} />
              <SortButton label="수입액" sortKey="importAmount" activeSortKey={sortKey} onClick={handleSort} />
              <SortButton label="무역수지" sortKey="balance" activeSortKey={sortKey} onClick={handleSort} />
              <SortButton label="수출YoY" sortKey="exportYoY" activeSortKey={sortKey} onClick={handleSort} />
              <SortButton label="수입YoY" sortKey="importYoY" activeSortKey={sortKey} onClick={handleSort} />
            </div>

            {isLoading ? (
              Array.from({ length: 7 }).map((_, index) => <TableRowSkeleton key={index} cols={6} />)
            ) : aggregated.length === 0 ? (
              <div className="py-12">
                <EmptyState
                  title="검색 결과가 없습니다."
                  message="다른 종목명, HS 코드 또는 품목명으로 검색해보세요."
                  icon={<Search size={20} />}
                />
              </div>
            ) : (
              aggregated.map((record) => {
                const key = getRecordKey(record)
                const isSelected = selectedProductKey === key

                return (
                  <div
                    key={key}
                    onClick={() =>
                      setSelectedTrade(
                        isSelected
                          ? null
                          : {
                              key,
                              record,
                              records,
                            }
                      )
                    }
                    className={cn(
                      "grid cursor-pointer grid-cols-[2fr_1fr_1fr_1fr_80px_80px] items-center gap-2 border-b border-surface-border/50 px-5 py-3.5 text-[13px] transition-colors",
                      isSelected ? "border-l-2 border-l-accent bg-accent/5" : "hover:bg-bg-secondary"
                    )}
                  >
                    <div>
                      <p className="truncate font-medium text-text-primary">{record.productName}</p>
                      <p className="text-[11px] text-text-tertiary">HS {record.hsCode}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium tabular-nums text-text-primary">
                        {formatCompactDisplayCurrency(record.exportAmount, currency, exchangeRate)}
                      </p>
                      <p className="text-[11px] tabular-nums text-text-tertiary">
                        단가 {formatUnitPrice(getExportUnitPrice(record), currency, exchangeRate)}
                      </p>
                    </div>
                    <span className="font-medium tabular-nums text-text-primary">
                      {formatCompactDisplayCurrency(record.importAmount, currency, exchangeRate)}
                    </span>
                    <BalanceBadge value={record.balance} />
                    <span className={cn("text-[12px] font-medium tabular-nums", getChangeColor(record.exportYoY))}>
                      {formatPercent(record.exportYoY)}
                    </span>
                    <span className={cn("text-[12px] font-medium tabular-nums", getChangeColor(record.importYoY))}>
                      {formatPercent(record.importYoY)}
                    </span>
                  </div>
                )
              })
            )}
          </div>

          <TradeDetailPanel selection={selectedTrade} onClose={() => setSelectedTrade(null)} />
        </div>
      )}
    </div>
  )
}
