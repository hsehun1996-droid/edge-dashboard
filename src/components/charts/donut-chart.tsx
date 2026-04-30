"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"

interface DonutItem {
  name: string
  value: number
  color: string
}

interface DonutChartProps {
  data: DonutItem[]
  centerLabel?: string
  centerValue?: string
}

const CHART_COLORS = ["#5E6AD2", "#26B5CE", "#F2994A", "#BB87FC", "#00C170", "#FF9F0A"]

interface DonutTooltipPayload {
  name?: string
  value?: number
}

interface DonutTooltipProps {
  active?: boolean
  payload?: DonutTooltipPayload[]
}

function CustomTooltip({ active, payload }: DonutTooltipProps) {
  if (!active || !payload?.length) return null
  const item = payload[0]

  if (!item) return null

  return (
    <div className="bg-text-primary text-text-inverse text-[12px] px-2.5 py-1.5 rounded-lg shadow-tooltip">
      <p className="font-semibold">{item.name}</p>
      <p>{(item.value ?? 0).toFixed(1)}%</p>
    </div>
  )
}

export function DonutChart({ data, centerLabel, centerValue }: DonutChartProps) {
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={65}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color ?? CHART_COLORS[index % CHART_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label */}
      {(centerLabel || centerValue) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {centerValue && (
            <p className="text-[20px] font-bold text-text-primary tabular-nums">{centerValue}</p>
          )}
          {centerLabel && (
            <p className="text-[11px] text-text-tertiary mt-0.5">{centerLabel}</p>
          )}
        </div>
      )}
    </div>
  )
}
