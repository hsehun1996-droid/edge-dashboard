import { create } from "zustand"

interface CurrencyStore {
  currency: "USD" | "KRW"
  exchangeRate: number
  setCurrency: (currency: "USD" | "KRW") => void
  setExchangeRate: (rate: number) => void
  convert: (usdPrice: number) => number
  symbol: string
}

export const useCurrency = create<CurrencyStore>((set, get) => ({
  currency: "USD",
  exchangeRate: 1380,
  symbol: "$",
  setCurrency: (currency) =>
    set({ currency, symbol: currency === "USD" ? "$" : "₩" }),
  setExchangeRate: (rate) => set({ exchangeRate: rate }),
  convert: (usdPrice) => {
    const { currency, exchangeRate } = get()
    return currency === "KRW" ? usdPrice * exchangeRate : usdPrice
  },
}))
