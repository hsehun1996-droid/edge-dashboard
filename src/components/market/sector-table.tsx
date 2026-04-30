"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { cn, getChangeBgColor, getChangeColor, formatLargeNumber, formatCompactDisplayCurrency } from "@/lib/utils"
import type { Sector } from "@/types"
import { TableRowSkeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { ChevronDown } from "lucide-react"
import { useCurrency } from "@/store/currency"

const COUNTRIES = [
  { code: "US", label: "🇺🇸 미국" },
  { code: "KR", label: "🇰🇷 한국" },
  { code: "JP", label: "🇯🇵 일본" },
  { code: "CN", label: "🇨🇳 중국" },
]

async function fetchSectors(country: string): Promise<Sector[]> {
  const res = await fetch(`/api/market/sectors?country=${country}`)
  if (!res.ok) throw new Error("섹터 데이터를 불러올 수 없어요")
  const json = await res.json()
  return json.data
}

function RSBar({ value }: { value: number }) {
  const color = value >= 80 ? "#00C170" : value >= 60 ? "#5E6AD2" : value >= 40 ? "#F2994A" : "#FF3B30"
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 h-1.5 bg-bg-secondary rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <span className="text-[12px] font-bold tabular-nums" style={{ color }}>{value}</span>
    </div>
  )
}

function ChangeChip({ value }: { value: number }) {
  return (
    <span className={cn(
      "inline-flex text-[11px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums",
      getChangeBgColor(value)
    )}>
      {value >= 0 ? "▲" : "▼"} {Math.abs(value).toFixed(2)}%
    </span>
  )
}

export function SectorPanel() {
  const [activeCountry, setActiveCountry] = useState("US")

  const { data: sectors = [], isLoading, error, refetch } = useQuery({
    queryKey: ["market-sectors", activeCountry],
    queryFn: () => fetchSectors(activeCountry),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div className="card overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-4 pb-0 border-b border-surface-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[15px] font-semibold text-text-primary">주도 섹터</h2>
            <p className="text-[11px] text-text-tertiary">O'Neil RS Rating 기준 정렬</p>
          </div>
        </div>
        {/* Country tabs */}
        <div className="flex gap-1">
          {COUNTRIES.map((c) => (
            <button
              key={c.code}
              onClick={() => setActiveCountry(c.code)}
              className={cn(
                "px-3 py-1.5 text-[12px] font-medium rounded-t-lg transition-all duration-150 -mb-px",
                activeCountry === c.code
                  ? "bg-bg-primary border border-b-bg-primary border-surface-border text-text-primary"
                  : "text-text-tertiary hover:text-text-secondary"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-y-auto flex-1 scrollbar-thin">
        {/* Header row */}
        <div className="grid grid-cols-[1.8fr_1.4fr_70px_80px_80px_90px] gap-2 px-4 py-2 bg-bg-secondary sticky top-0 z-10 border-b border-surface-border">
          {["섹터 / ETF", "대장주", "수익률", "거래대금", "RS 대비", "RS Rating"].map((h) => (
            <p key={h} className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">{h}</p>
          ))}
        </div>

        {error ? (
          <div className="p-4">
            <ErrorState compact onRetry={refetch} message="섹터 데이터를 불러올 수 없어요." />
          </div>
        ) : isLoading ? (
          Array.from({ length: 8 }).map((_, i) => <TableRowSkeleton key={i} cols={6} />)
        ) : (
          sectors.map((sector, i) => (
            <SectorRow key={`${sector.country}-${sector.ticker}`} sector={sector} rank={i} />
          ))
        )}
      </div>
    </div>
  )
}

function SectorRow({ sector, rank }: { sector: Sector; rank: number }) {
  const [expanded, setExpanded] = useState(false)
  const { currency, exchangeRate } = useCurrency()

  return (
    <>
      <div
        className={cn(
          "grid grid-cols-[1.8fr_1.4fr_70px_80px_80px_90px] gap-2 px-4 py-3 items-center",
          "border-b border-surface-border/40 hover:bg-bg-secondary/60 transition-colors cursor-pointer select-none"
        )}
        onClick={() => setExpanded((prev) => !prev)}
      >
        {/* Sector + ETF */}
        <div className="flex items-start gap-2 min-w-0">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-text-primary truncate">{sector.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-medium text-accent bg-accent-light px-1.5 py-0.5 rounded">
                ETF
              </span>
              <span className="text-[10px] text-text-tertiary truncate">{sector.etf.ticker}</span>
            </div>
          </div>
          <ChevronDown
            size={12}
            className={cn(
              "text-text-tertiary shrink-0 mt-1 transition-transform duration-200",
              expanded && "rotate-180"
            )}
          />
        </div>

        {/* Top Stock — 이름 표출 */}
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-text-primary truncate">{sector.topStock.name}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <ChangeChip value={sector.topStock.changePercent} />
          </div>
        </div>

        {/* Sector return */}
        <span className={cn("text-[13px] font-bold tabular-nums", getChangeColor(sector.returnPct))}>
          {sector.returnPct >= 0 ? "+" : ""}{sector.returnPct.toFixed(2)}%
        </span>

        {/* Volume */}
        <span className="text-[11px] text-text-secondary tabular-nums">
          {sector.volume > 0 ? formatCompactDisplayCurrency(sector.volume, currency, exchangeRate) : "—"}
        </span>

        {/* RS vs index */}
        <span className={cn(
          "text-[11px] font-medium px-1.5 py-0.5 rounded-full w-fit",
          getChangeBgColor(sector.rs)
        )}>
          {sector.rs >= 0 ? "+" : ""}{sector.rs.toFixed(1)}%
        </span>

        {/* RS Rating */}
        <RSBar value={sector.rsRating} />
      </div>

      {/* 대표 종목 5개 드롭다운 */}
      {expanded && sector.topStocks && sector.topStocks.length > 0 && (
        <div className="border-b border-surface-border bg-bg-secondary/30">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-1.5 border-b border-surface-border/30">
            <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">대표 종목</span>
            <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider text-right">현재가</span>
            <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider text-right w-20">등락률</span>
          </div>
          {sector.topStocks.map((stock, idx) => {
            const isKrwSector = sector.country === "KR"
            const displayPrice = stock.price > 0
              ? isKrwSector
                ? `${stock.price.toLocaleString("ko-KR")}원`
                : `$${stock.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "—"
            return (
              <div
                key={stock.ticker}
                className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-4 py-2 hover:bg-bg-secondary/60 transition-colors border-b border-surface-border/20 last:border-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] text-text-tertiary w-4 shrink-0">{idx + 1}</span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-text-primary truncate">{stock.name}</p>
                    <p className="text-[10px] text-text-tertiary truncate">{stock.ticker}</p>
                  </div>
                </div>
                <span className="text-[12px] font-medium tabular-nums text-text-primary text-right">
                  {displayPrice}
                </span>
                <div className="w-20 flex justify-end">
                  <ChangeChip value={stock.changePercent} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

export function SectorTableSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="h-[88px] bg-bg-secondary border-b border-surface-border" />
      <div className="h-9 bg-bg-secondary border-b border-surface-border" />
      {Array.from({ length: 6 }).map((_, i) => (
        <TableRowSkeleton key={i} cols={6} />
      ))}
    </div>
  )
}
