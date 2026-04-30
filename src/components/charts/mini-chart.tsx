"use client"

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts"
import { formatDisplayCurrency } from "@/lib/utils"
import { useCurrency } from "@/store/currency"

interface MiniChartProps {
  data: { date: string; price: number }[]
  ticker: string
  sourceCurrency?: "USD" | "KRW"
  positive?: boolean
}

interface TooltipPayload {
  value?: number
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
  sourceCurrency?: "USD" | "KRW"
}

function CustomTooltip({ active, payload, label, sourceCurrency = "USD" }: CustomTooltipProps) {
  const currency = useCurrency((state) => state.currency)
  const exchangeRate = useCurrency((state) => state.exchangeRate)
  if (!active || !payload?.length) return null
  const value = payload[0]?.value ?? 0

  return (
    <div className="bg-text-primary text-text-inverse text-[12px] px-2.5 py-1.5 rounded-lg shadow-tooltip">
      <p className="font-semibold">{formatDisplayCurrency(value, currency, exchangeRate, sourceCurrency)}</p>
      <p className="text-text-tertiary">{label}</p>
    </div>
  )
}

export function MiniChart({ data, ticker, sourceCurrency = "USD", positive = true }: MiniChartProps) {
  const color = positive ? "#00C170" : "#FF3B30"

  return (
    <ResponsiveContainer width="100%" height={80}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <defs>
          <linearGradient id={`mini-grad-${ticker}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E7" vertical={false} />
        <XAxis dataKey="date" hide />
        <YAxis domain={["auto", "auto"]} hide />
        <Tooltip content={<CustomTooltip sourceCurrency={sourceCurrency} />} />
        <Area
          type="monotone"
          dataKey="price"
          stroke={color}
          strokeWidth={2}
          fill={`url(#mini-grad-${ticker})`}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
