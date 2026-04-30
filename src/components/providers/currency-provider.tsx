"use client"

import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { useCurrency } from "@/store/currency"

async function fetchFxRate(): Promise<number> {
  const res = await fetch("/api/market/fx")
  if (!res.ok) return 1380
  return (await res.json()).rate
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const setExchangeRate = useCurrency((state) => state.setExchangeRate)

  const { data: fxRate } = useQuery({
    queryKey: ["fx-rate"],
    queryFn: fetchFxRate,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  })

  useEffect(() => {
    if (fxRate) {
      setExchangeRate(fxRate)
    }
  }, [fxRate, setExchangeRate])

  return children
}
