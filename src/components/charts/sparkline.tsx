"use client"

import { useId } from "react"
import { ResponsiveContainer, AreaChart, Area } from "recharts"

interface SparklineProps {
  data: number[]
  positive?: boolean
  height?: number
  width?: number
}

export function Sparkline({ data, positive, height = 40, width = 100 }: SparklineProps) {
  const uid = useId().replace(/:/g, "")

  const color = positive === undefined
    ? (data[data.length - 1] >= data[0] ? "#00C170" : "#FF3B30")
    : positive ? "#00C170" : "#FF3B30"

  const gradId = `spark-grad-${uid}`
  const chartData = data.map((v, i) => ({ v, i }))

  return (
    <ResponsiveContainer width={width} height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
