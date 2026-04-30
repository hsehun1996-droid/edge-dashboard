"use client"

import { cn } from "@/lib/utils"
import { useCurrency } from "@/store/currency"

export function CurrencyToggle() {
  const { currency, setCurrency, exchangeRate } = useCurrency()

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-text-tertiary">
        1 USD = ₩{exchangeRate.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}
      </span>
      <div className="flex bg-bg-secondary border border-surface-border rounded-lg p-0.5 gap-0.5">
        {(["USD", "KRW"] as const).map((code) => (
          <button
            key={code}
            onClick={() => setCurrency(code)}
            className={cn(
              "px-3 py-1 text-[12px] font-semibold rounded-md transition-all duration-150",
              currency === code
                ? "bg-bg-primary text-accent shadow-sm"
                : "text-text-tertiary hover:text-text-primary"
            )}
          >
            {code === "USD" ? "$ USD" : "₩ KRW"}
          </button>
        ))}
      </div>
    </div>
  )
}
