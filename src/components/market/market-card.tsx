"use client"

import { cn, formatNumber, formatPercent, getChangeBgColor, getChangeColor } from "@/lib/utils"
import { Sparkline } from "@/components/charts/sparkline"
import type { MarketIndex } from "@/types"
import { Skeleton } from "@/components/ui/skeleton"

interface MarketCardProps {
  index: MarketIndex
  className?: string
}

// Indices that are KRW-native (KOSPI, KOSDAQ etc.) — integer points
const KRW_NATIVE = ["^KS11", "^KQ11", "^KSPI"]

export function MarketCard({ index, className }: MarketCardProps) {
  const isPositive = index.changePercent >= 0
  const isKrwNative = KRW_NATIVE.includes(index.ticker)

  // Indices are always shown in their native unit (points) — no currency conversion
  const showDecimals = !isKrwNative

  return (
    <div className={cn("card card-hover p-4 flex flex-col gap-3 cursor-default", className)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[18px] leading-none">{index.flag}</span>
            <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">
              {index.country}
            </span>
          </div>
          <p className="text-[14px] font-semibold text-text-primary leading-tight">{index.name}</p>
          <p className="text-[10px] text-text-tertiary">{index.ticker}</p>
        </div>
        {index.sparkline && index.sparkline.length > 0 && (
          <Sparkline data={index.sparkline} positive={isPositive} height={36} width={72} />
        )}
      </div>

      {/* Price */}
      <div>
        <p className="text-[22px] font-bold text-text-primary tabular-nums leading-none">
          {formatNumber(index.price, {
            minimumFractionDigits: showDecimals ? 2 : 0,
            maximumFractionDigits: showDecimals ? 2 : 0,
          })}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className={cn("text-[12px] font-medium tabular-nums", getChangeColor(index.changePercent))}>
            {isPositive ? "▲" : "▼"}{" "}
            {formatNumber(Math.abs(index.change), {
              minimumFractionDigits: showDecimals ? 2 : 0,
              maximumFractionDigits: showDecimals ? 2 : 0,
            })}
          </span>
          <span className={cn("text-[11px] font-semibold px-1.5 py-0.5 rounded-full", getChangeBgColor(index.changePercent))}>
            {formatPercent(index.changePercent)}
          </span>
        </div>
      </div>

      {/* Volume */}
      <div className="flex items-center justify-between pt-2 border-t border-surface-border">
        <p className="text-[10px] text-text-tertiary">거래량</p>
        <p className="text-[11px] font-medium text-text-secondary tabular-nums">
          {formatNumber(index.volume)}
        </p>
      </div>
    </div>
  )
}

export function MarketCardSkeleton() {
  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-9 w-18 rounded-lg" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex justify-between pt-2 border-t border-surface-border">
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
  )
}
