"use client"

import { RefreshCw } from "lucide-react"
import { CurrencyToggle } from "@/components/layout/currency-toggle"

interface HeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  onRefresh?: () => void
  isRefreshing?: boolean
  lastUpdated?: string
}

export function Header({
  title,
  subtitle,
  actions,
  onRefresh,
  isRefreshing,
  lastUpdated,
}: HeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-[28px] font-bold text-text-primary leading-tight">{title}</h1>
        {subtitle && (
          <p className="text-[15px] text-text-secondary mt-0.5">{subtitle}</p>
        )}
        {lastUpdated && (
          <p className="text-[11px] text-text-tertiary mt-1">
            마지막 업데이트: {lastUpdated}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <CurrencyToggle />
        {actions}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-all duration-[150ms] disabled:opacity-40"
          >
            <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
          </button>
        )}
      </div>
    </div>
  )
}
