"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ErrorState, EmptyState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { DonutChart } from "@/components/charts/donut-chart"
import { Sparkline } from "@/components/charts/sparkline"
import type { PortfolioItem } from "@/types"
import type { PriceQuote } from "@/app/api/portfolio/price/route"
import { cn, formatLargeNumber, formatPercent, getChangeColor } from "@/lib/utils"
import { useCurrency } from "@/store/currency"
import { Trash2, Edit2, X, Check, Wallet, Search, Loader2, Plus, CheckCircle2, TrendingDown, LogIn } from "lucide-react"
import { useSession, signIn } from "next-auth/react"

const CHART_COLORS = ["#5E6AD2", "#26B5CE", "#F2994A", "#BB87FC", "#00C170", "#FF9F0A", "#FF3B30", "#8E8E93"]

const CURRENCY_COLORS: Record<string, string> = {
  USD: "#5E6AD2", KRW: "#26B5CE", EUR: "#F2994A", JPY: "#BB87FC", GBP: "#00C170",
}
const EXCHANGE_COLORS: Record<string, string> = {
  NASDAQ: "#5E6AD2", NYSE: "#26B5CE", KRX: "#F2994A", AMEX: "#BB87FC", TSE: "#00C170",
}

// ─── 테이블 그리드 정의 (헤더 + 바디 공유) ────────────────────────────────────
const TABLE_GRID = "grid-cols-[auto_1fr_72px_88px_88px_76px_76px_92px_100px_72px]"

type AnalysisTab = "weight" | "currency" | "exchange"

// ─── 유틸 ─────────────────────────────────────────────────────────────────────
async function parseJsonSafely<T>(res: Response): Promise<T | null> {
  const text = await res.text()
  if (!text) return null
  try { return JSON.parse(text) as T } catch { return null }
}

async function fetchPortfolio(): Promise<PortfolioItem[]> {
  const res = await fetch("/api/portfolio")
  if (!res.ok) throw new Error("포트폴리오 데이터를 불러올 수 없습니다.")
  const json = await parseJsonSafely<{ data?: PortfolioItem[] }>(res)
  return json?.data ?? []
}

async function fetchCurrentPrices(tickers: string[]): Promise<Record<string, PriceQuote>> {
  if (!tickers.length) return {}
  const res = await fetch(`/api/portfolio/price?tickers=${tickers.join(",")}`)
  if (!res.ok) return {}
  const json = await parseJsonSafely<{ data?: Record<string, PriceQuote> }>(res)
  return json?.data ?? {}
}

async function fetchSparklines(tickers: string[]): Promise<Record<string, number[]>> {
  if (!tickers.length) return {}
  const res = await fetch(`/api/portfolio/sparkline?tickers=${tickers.join(",")}`)
  if (!res.ok) return {}
  const json = await parseJsonSafely<{ data?: Record<string, number[]> }>(res)
  return json?.data ?? {}
}

async function addPortfolioItem(data: {
  ticker: string; name: string; exchange?: string; currency?: string
  quantity: number; avgCost: number; type?: string
}) {
  const res = await fetch("/api/portfolio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  const json = await parseJsonSafely<{ data?: PortfolioItem; error?: string }>(res)
  if (!res.ok) throw new Error(json?.error ?? "종목 추가에 실패했습니다.")
  if (!json?.data) throw new Error("종목 추가 응답을 확인하지 못했습니다.")
  return json.data
}

async function deletePortfolioItem(id: string) {
  const res = await fetch(`/api/portfolio/${id}`, { method: "DELETE" })
  if (!res.ok) throw new Error("삭제에 실패했습니다.")
}

async function updatePortfolioItem(id: string, data: { quantity?: number; avgCost?: number }) {
  const res = await fetch(`/api/portfolio/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  const json = await parseJsonSafely<{ data?: PortfolioItem; error?: string }>(res)
  if (!res.ok) throw new Error(json?.error ?? "수정에 실패했습니다.")
  return json?.data
}

// ─── 종목 검색 ────────────────────────────────────────────────────────────────
interface StockSuggestion {
  ticker: string; name: string; exchange: string; currency: string; flag: string; type: string
}
interface StockQuote {
  price: number; change: number; changePercent: number; volume: number
  high52w: number; low52w: number
}

let krxAllCache: StockSuggestion[] | null = null
let krxAllFetchPromise: Promise<StockSuggestion[]> | null = null

function hasKorean(s: string) {
  return /[\uAC00-\uD7A3\u3131-\u314E\u314F-\u3163]/.test(s)
}

async function getKrxAll(): Promise<StockSuggestion[]> {
  if (krxAllCache) return krxAllCache
  if (krxAllFetchPromise) return krxAllFetchPromise
  krxAllFetchPromise = fetch("/api/portfolio/search/krx-all")
    .then((r) => r.json())
    .then((j) => { krxAllCache = (j.data ?? []) as StockSuggestion[]; return krxAllCache })
    .catch(() => [])
  return krxAllFetchPromise
}

function filterKrx(q: string, list: StockSuggestion[]): StockSuggestion[] {
  const lq = q.toLowerCase()
  const exact: StockSuggestion[] = [], starts: StockSuggestion[] = [], includes: StockSuggestion[] = []
  for (const s of list) {
    const ln = s.name.toLowerCase(), lt = s.ticker.toLowerCase()
    if (ln === lq || lt === lq) { exact.push(s); continue }
    if (ln.startsWith(lq) || lt.startsWith(lq)) { starts.push(s); continue }
    if (ln.includes(lq) || lt.includes(lq)) includes.push(s)
  }
  return [...exact, ...starts, ...includes].slice(0, 10)
}

async function fetchIntlSuggestions(q: string, signal: AbortSignal): Promise<StockSuggestion[]> {
  const res = await fetch(`/api/portfolio/search?q=${encodeURIComponent(q)}`, { signal })
  if (!res.ok) return []
  const json = await res.json()
  return ((json.data ?? []) as StockSuggestion[]).filter((s) => !s.ticker.match(/\.(KS|KQ)$/i))
}

async function fetchQuote(ticker: string): Promise<StockQuote | null> {
  try {
    const res = await fetch(`/api/portfolio/quote?ticker=${encodeURIComponent(ticker)}`)
    if (!res.ok) return null
    const json = await res.json()
    return (json.data ?? null) as StockQuote | null
  } catch { return null }
}

// ─── StockSearchField ─────────────────────────────────────────────────────────
function StockSearchField({
  onSelect, error, value, onChange,
}: {
  onSelect: (s: StockSuggestion, quote: StockQuote | null) => void
  error?: string
  value: string
  onChange: (v: string) => void
}) {
  const [suggestions, setSuggestions] = useState<StockSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => { getKrxAll() }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()
    const q = value.trim()
    if (!q) { setSuggestions([]); setOpen(false); setIsLoading(false); return }
    const korean = hasKorean(q)
    if (korean) {
      const krx = krxAllCache
      if (krx) {
        const results = filterKrx(q, krx)
        setSuggestions(results); setOpen(results.length > 0); setIsLoading(false)
      } else {
        setIsLoading(true)
        getKrxAll().then((list) => {
          const results = filterKrx(q, list)
          setSuggestions(results); setOpen(results.length > 0); setIsLoading(false)
        })
      }
    } else {
      setIsLoading(true)
      debounceRef.current = setTimeout(() => {
        const ac = new AbortController(); abortRef.current = ac
        const krxLocal = krxAllCache ? filterKrx(q, krxAllCache) : []
        if (krxLocal.length > 0) { setSuggestions(krxLocal); setOpen(true) }
        fetchIntlSuggestions(q, ac.signal)
          .then((intl) => {
            const merged = [...intl, ...filterKrx(q, krxAllCache ?? []).filter(
              (k) => !intl.some((r) => r.ticker === k.ticker)
            )].slice(0, 10)
            setSuggestions(merged); setOpen(merged.length > 0)
          })
          .catch(() => {})
          .finally(() => setIsLoading(false))
      }, 150)
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)) }
    else if (e.key === "Enter" && activeIndex >= 0) { e.preventDefault(); handleSelect(suggestions[activeIndex]) }
    else if (e.key === "Escape") setOpen(false)
  }

  const handleSelect = async (s: StockSuggestion) => {
    onChange(s.name); setOpen(false)
    const quote = await fetchQuote(s.ticker)
    onSelect(s, quote)
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
          placeholder="종목명 또는 티커 검색..."
          className={cn(
            "w-full rounded-[10px] border bg-bg-tertiary py-2.5 pl-9 pr-4 text-[14px] text-text-primary placeholder:text-text-tertiary focus:outline-none transition-colors",
            error ? "border-negative focus:border-negative" : "border-text-tertiary/50 focus:border-accent"
          )}
          autoComplete="off"
        />
        {isLoading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-text-tertiary" />}
      </div>
      {error && <p className="mt-1 text-[12px] text-negative">{error}</p>}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-surface-border bg-bg-secondary shadow-xl">
          {suggestions.slice(0, 10).map((s, i) => (
            <button
              key={s.ticker} type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(s) }}
              onMouseEnter={() => setActiveIndex(i)}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                i === activeIndex ? "bg-accent/10" : "hover:bg-bg-tertiary"
              )}
            >
              <span className="text-base leading-none">{s.flag}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-text-primary">{s.ticker}</span>
                  <span className="rounded bg-bg-secondary px-1.5 py-0.5 text-[10px] text-text-tertiary">{s.exchange}</span>
                  <span className="rounded bg-bg-secondary px-1.5 py-0.5 text-[10px] text-text-tertiary">{s.type}</span>
                </div>
                <p className="truncate text-[12px] text-text-secondary">{s.name}</p>
              </div>
              <span className="shrink-0 text-[12px] text-text-tertiary">{s.currency}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── StockSearchPanel ──────────────────────────────────────────────────────────
function StockSearchPanel({ onAdded }: { onAdded: () => void }) {
  const queryClient = useQueryClient()
  const exchangeRate = useCurrency((s) => s.exchangeRate)

  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<{ stock: StockSuggestion; quote: StockQuote | null } | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quantity, setQuantity] = useState("")
  const [avgCost, setAvgCost] = useState("")
  // 매수가 입력 통화 (종목 선택 시 native currency 로 자동 설정)
  const [costCurrency, setCostCurrency] = useState<"USD" | "KRW">("USD")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState(false)

  const mutation = useMutation({
    mutationFn: addPortfolioItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio"] })
      setSuccess(true)
      setTimeout(() => {
        setSelected(null)
        setQuery("")
        setQuantity("")
        setAvgCost("")
        setErrors({})
        setSuccess(false)
      }, 1500)
      onAdded()
    },
  })

  const handleStockSelect = (s: StockSuggestion, quote: StockQuote | null) => {
    setErrors({})
    setSuccess(false)
    // 기본 입력 통화를 종목 native 통화로 설정 (USD/KRW 외 통화도 USD 로 처리)
    setCostCurrency(s.currency === "KRW" ? "KRW" : "USD")
    if (quote) {
      setSelected({ stock: s, quote })
    } else {
      setQuoteLoading(true)
      setSelected({ stock: s, quote: null })
      fetchQuote(s.ticker).then((q) => {
        setSelected({ stock: s, quote: q })
        setQuoteLoading(false)
      })
    }
  }

  const handleClear = () => {
    setSelected(null)
    setQuery("")
    setQuantity("")
    setAvgCost("")
    setErrors({})
    setSuccess(false)
  }

  const validate = () => {
    const next: Record<string, string> = {}
    if (!selected) next.ticker = "종목을 검색해서 선택해 주세요."
    if (!quantity || Number(quantity) <= 0) next.quantity = "유효한 수량을 입력해 주세요."
    if (!avgCost || Number(avgCost) <= 0) next.avgCost = "유효한 매수가를 입력해 주세요."
    setErrors(next)
    return Object.keys(next).length === 0
  }

  // 입력 통화 → 종목 native 통화 변환
  const toNativeCost = (inputVal: number): number => {
    if (!selected) return inputVal
    const nativeCur = selected.stock.currency === "KRW" ? "KRW" : "USD"
    if (costCurrency === nativeCur) return inputVal
    if (costCurrency === "USD" && nativeCur === "KRW") return inputVal * exchangeRate
    if (costCurrency === "KRW" && nativeCur === "USD") return inputVal / exchangeRate
    return inputVal
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate() || !selected) return
    const avgCostNative = toNativeCost(Number(avgCost))
    mutation.mutate({
      ticker: selected.stock.ticker,
      name: selected.stock.name,
      exchange: selected.stock.exchange,
      currency: selected.stock.currency,
      quantity: Number(quantity),
      avgCost: avgCostNative,
    })
  }

  const previewCost = Number(quantity || "0") * Number(avgCost || "0")
  // 종목 native 통화 기준 예상 투입 금액
  const previewCostNative = Number(quantity || "0") * toNativeCost(Number(avgCost || "0"))
  const nativeCur = selected ? (selected.stock.currency === "KRW" ? "KRW" : "USD") : "USD"
  const showConversion = selected && costCurrency !== nativeCur

  return (
    <div className="card flex flex-col gap-4 p-5">
      <h3 className="text-[13px] font-semibold text-text-primary">종목 검색</h3>

      {/* 검색창 */}
      <StockSearchField
        value={query}
        onChange={setQuery}
        onSelect={handleStockSelect}
        error={errors.ticker}
      />

      {/* 선택된 종목 */}
      {selected && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 animate-[fade-in-up_200ms_ease-out]">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[14px] font-bold text-text-primary">{selected.stock.ticker}</span>
                <span className="rounded bg-bg-secondary px-1.5 py-0.5 text-[10px] text-text-tertiary">{selected.stock.exchange}</span>
                <span className="rounded bg-bg-secondary px-1.5 py-0.5 text-[10px] text-text-tertiary">{selected.stock.currency}</span>
              </div>
              <p className="mt-0.5 truncate text-[12px] text-text-secondary">{selected.stock.name}</p>
            </div>
            <button type="button" onClick={handleClear} className="mt-0.5 shrink-0 text-text-tertiary hover:text-text-primary">
              <X size={14} />
            </button>
          </div>

          {/* 시세 */}
          <div className="mt-3 border-t border-accent/20 pt-3">
            {quoteLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 size={12} className="animate-spin text-text-tertiary" />
                <span className="text-[12px] text-text-tertiary">현재가 조회 중...</span>
              </div>
            ) : selected.quote ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div>
                  <p className="text-[10px] text-text-tertiary">현재가</p>
                  <p className="text-[14px] font-bold tabular-nums text-text-primary">{selected.quote.price.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-tertiary">등락</p>
                  <p className={cn("text-[13px] font-medium tabular-nums", getChangeColor(selected.quote.changePercent))}>
                    {selected.quote.changePercent >= 0 ? "+" : ""}{selected.quote.changePercent.toFixed(2)}%
                  </p>
                </div>
                <div className="col-span-2 mt-1">
                  <p className="text-[10px] text-text-tertiary">52주 고/저</p>
                  <p className="text-[12px] tabular-nums text-text-secondary">
                    {selected.quote.high52w.toLocaleString()} / {selected.quote.low52w.toLocaleString()}
                  </p>
                </div>
              </div>
            ) : (
              <span className="text-[12px] text-text-tertiary">현재가 조회 실패</span>
            )}
          </div>
        </div>
      )}

      {/* 수량 / 매수가 입력 */}
      {selected && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 animate-[fade-in-up_200ms_ease-out]">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-secondary">수량 *</label>
            <Input
              type="number" value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="100" min="0" step="any"
              error={errors.quantity}
            />
          </div>
          <div>
            {/* 매수가 통화 토글 */}
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[11px] font-medium text-text-secondary">매수가 *</label>
              <div className="flex items-center gap-1 rounded-lg bg-bg-secondary p-0.5">
                {(["USD", "KRW"] as const).map((cur) => (
                  <button
                    key={cur}
                    type="button"
                    onClick={() => setCostCurrency(cur)}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[10px] font-semibold transition-colors",
                      costCurrency === cur
                        ? "bg-accent text-white"
                        : "text-text-tertiary hover:text-text-secondary"
                    )}
                  >
                    {cur}
                  </button>
                ))}
              </div>
            </div>
            <Input
              type="number" value={avgCost}
              onChange={(e) => setAvgCost(e.target.value)}
              placeholder={costCurrency === "KRW" ? "75000" : "150.00"}
              min="0" step="any"
              error={errors.avgCost}
            />
            {showConversion && avgCost && Number(avgCost) > 0 && (
              <p className="mt-1 text-[11px] text-text-tertiary">
                ≈ {nativeCur === "KRW" ? "" : "$"}{toNativeCost(Number(avgCost)).toLocaleString(nativeCur === "KRW" ? "ko-KR" : "en-US", { maximumFractionDigits: nativeCur === "KRW" ? 0 : 2 })}{nativeCur === "KRW" ? "원" : ""} 으로 저장됩니다
              </p>
            )}
          </div>

          {(quantity || avgCost) && (
            <div className="flex items-center justify-between rounded-xl bg-bg-secondary px-4 py-2.5">
              <span className="text-[11px] text-text-secondary">예상 투입 금액</span>
              <div className="text-right">
                <span className="text-[13px] font-bold tabular-nums text-text-primary">
                  {costCurrency === "KRW" ? "" : "$"}{previewCost.toLocaleString(costCurrency === "KRW" ? "ko-KR" : "en-US", { maximumFractionDigits: costCurrency === "KRW" ? 0 : 2 })}{costCurrency === "KRW" ? "원" : ""}
                </span>
                {showConversion && (
                  <p className="text-[11px] tabular-nums text-text-tertiary">
                    {nativeCur === "KRW" ? "" : "$"}{previewCostNative.toLocaleString(nativeCur === "KRW" ? "ko-KR" : "en-US", { maximumFractionDigits: nativeCur === "KRW" ? 0 : 2 })}{nativeCur === "KRW" ? "원" : ""}
                  </p>
                )}
              </div>
            </div>
          )}

          {mutation.error && (
            <p className="text-[12px] text-negative">{(mutation.error as Error).message}</p>
          )}

          {success ? (
            <div className="flex items-center justify-center gap-2 rounded-xl bg-positive/10 px-4 py-2.5">
              <CheckCircle2 size={14} className="text-positive" />
              <span className="text-[13px] font-medium text-positive">추가 완료</span>
            </div>
          ) : (
            <Button type="submit" loading={mutation.isPending} className="w-full">
              <Plus size={14} />
              포트폴리오에 추가
            </Button>
          )}
        </form>
      )}

      {!selected && (
        <p className="text-center text-[12px] text-text-tertiary py-2">
          종목을 검색하면<br />시세와 추가 폼이 표시됩니다
        </p>
      )}
    </div>
  )
}

// ─── 집계 아이템 타입 ──────────────────────────────────────────────────────────
interface LotItem {
  id: string
  quantity: number
  avgCost: number
  buyDate?: string | null
}

interface AggregatedItem {
  ids: string[]
  buyIds: string[]
  lots: LotItem[]
  ticker: string
  name: string
  exchange: string
  currency: string
  quantity: number      // 잔여 수량 (BUY - SELL)
  avgCost: number
  totalInvested: number // 잔여 보유분 투입금
  realizedGain: number
  lotCount: number      // BUY lot 수
  currentPrice?: number
  currentValue: number
  gainLoss: number
  gainLossPercent: number
  weight: number
}

// ─── PortfolioRow ──────────────────────────────────────────────────────────────
function PortfolioRow({
  item, weight, color, sparklineData, onDelete, onUpdate, onSell,
}: {
  item: AggregatedItem
  weight: number
  color: string
  sparklineData?: number[]
  onDelete: (ids: string[]) => void
  onUpdate: (id: string, data: { quantity?: number; avgCost?: number }) => void
  onSell: (ticker: string, qty: number, price: number) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editQty, setEditQty] = useState(String(item.quantity))
  const [editCost, setEditCost] = useState(String(item.avgCost))
  const [isSelling, setIsSelling] = useState(false)
  const [sellQty, setSellQty] = useState("")
  const [sellPrice, setSellPrice] = useState(String(item.currentPrice ?? item.avgCost))
  const [isEditingLots, setIsEditingLots] = useState(false)
  const [lotEdits, setLotEdits] = useState<Record<string, { qty: string; cost: string }>>({})

  const handleEditClick = () => {
    if (item.lotCount === 1) {
      setIsEditing(true)
    } else {
      const edits: Record<string, { qty: string; cost: string }> = {}
      for (const lot of item.lots) {
        edits[lot.id] = { qty: String(lot.quantity), cost: String(lot.avgCost) }
      }
      setLotEdits(edits)
      setIsEditingLots(true)
      setIsSelling(false)
    }
  }

  const handleSave = () => {
    onUpdate(item.buyIds[0], { quantity: Number(editQty), avgCost: Number(editCost) })
    setIsEditing(false)
  }

  const handleLotSave = (lotId: string) => {
    const edit = lotEdits[lotId]
    if (edit) {
      onUpdate(lotId, { quantity: Number(edit.qty), avgCost: Number(edit.cost) })
    }
  }

  const handleSellConfirm = () => {
    const qty = Number(sellQty)
    const price = Number(sellPrice)
    if (qty > 0 && qty <= item.quantity && price > 0) {
      onSell(item.ticker, qty, price)
      setIsSelling(false)
      setSellQty("")
      setSellPrice(String(item.currentPrice ?? item.avgCost))
    }
  }

  const handleSellOpen = () => {
    setSellQty(String(item.quantity))
    setSellPrice(String(item.currentPrice ?? item.avgCost))
    setIsSelling(true)
    setIsEditing(false)
    setIsEditingLots(false)
  }

  return (
    <div className="border-b border-surface-border/50">
      <div className={cn(
        `grid ${TABLE_GRID} items-center gap-3 px-5 py-3.5`,
        "hover:bg-bg-secondary/40 transition-colors"
      )}>
        {/* 색상 도트 */}
        <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />

        {/* 종목명 */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13px] font-semibold text-text-primary">{item.name}</p>
            {item.lotCount > 1 && (
              <span className="shrink-0 rounded bg-accent/15 px-1 py-0.5 text-[10px] text-accent">{item.lotCount}lots</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] text-text-tertiary">{item.ticker}</p>
            <span className="rounded bg-bg-secondary px-1 py-0.5 text-[10px] text-text-tertiary">{item.exchange}</span>
          </div>
        </div>

        {/* 스파크라인 */}
        <div className="flex items-center justify-center">
          {sparklineData && sparklineData.length >= 2 ? (
            <Sparkline data={sparklineData} height={32} width={68} />
          ) : (
            <div className="h-8 w-[68px] rounded bg-bg-secondary/60" />
          )}
        </div>

        {/* 수량 */}
        {isEditing ? (
          <input
            type="number" value={editQty} onChange={(e) => setEditQty(e.target.value)}
            className="w-full rounded-lg border border-accent bg-bg-tertiary px-2 py-1 text-right text-[13px] tabular-nums"
          />
        ) : (
          <span className="text-right text-[13px] tabular-nums text-text-primary">{item.quantity.toLocaleString()}</span>
        )}

        {/* 매수가 */}
        {isEditing ? (
          <input
            type="number" value={editCost} onChange={(e) => setEditCost(e.target.value)}
            className="w-full rounded-lg border border-accent bg-bg-tertiary px-2 py-1 text-right text-[13px] tabular-nums"
          />
        ) : (
          <span className="text-right text-[13px] tabular-nums text-text-primary">{item.avgCost.toLocaleString()}</span>
        )}

        {/* 투입금 */}
        <span className="text-right text-[12px] tabular-nums text-text-secondary">{formatLargeNumber(item.totalInvested)}</span>

        {/* 평가금 */}
        <span className="text-right text-[13px] font-medium tabular-nums text-text-primary">
          {item.currentPrice ? formatLargeNumber(item.currentValue) : "--"}
        </span>

        {/* 수익률 */}
        <div className="text-right">
          {item.currentPrice ? (
            <>
              <p className={cn("text-[12px] font-medium tabular-nums", getChangeColor(item.gainLossPercent))}>
                {formatPercent(item.gainLossPercent)}
              </p>
              <p className={cn("text-[11px] tabular-nums", getChangeColor(item.gainLoss))}>
                {(item.gainLoss >= 0 ? "+" : "") + formatLargeNumber(Math.abs(item.gainLoss))}
              </p>
            </>
          ) : (
            <span className="text-[12px] text-text-tertiary">--</span>
          )}
        </div>

        {/* 비중 바 */}
        <div className="px-1">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] tabular-nums text-text-tertiary">{weight.toFixed(1)}%</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-bg-secondary">
            <div
              className="h-1 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(weight, 100)}%`, backgroundColor: color }}
            />
          </div>
        </div>

        {/* 작업 버튼 */}
        <div className="flex items-center justify-end gap-1">
          {isEditing ? (
            <>
              <button onClick={handleSave} className="rounded-lg p-1.5 text-accent transition-colors hover:bg-accent/10">
                <Check size={14} />
              </button>
              <button onClick={() => setIsEditing(false)} className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-bg-secondary">
                <X size={14} />
              </button>
            </>
          ) : isSelling ? (
            <>
              <button onClick={handleSellConfirm} className="rounded-lg p-1.5 text-negative transition-colors hover:bg-negative/10">
                <Check size={14} />
              </button>
              <button onClick={() => setIsSelling(false)} className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-bg-secondary">
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleEditClick}
                title={item.lotCount > 1 ? "로트별 개별 수정" : "수정"}
                className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-bg-secondary hover:text-text-secondary"
              >
                <Edit2 size={14} />
              </button>
              <button
                onClick={handleSellOpen}
                title="매도"
                className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-negative/10 hover:text-negative"
              >
                <TrendingDown size={14} />
              </button>
              <button onClick={() => onDelete(item.ids)} className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-negative/10 hover:text-negative">
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* 매도 입력 폼 (인라인) */}
      {isSelling && (
        <div className="flex items-center gap-3 border-t border-negative/20 bg-negative/5 px-5 py-3 animate-[fade-in-up_150ms_ease-out]">
          <span className="shrink-0 text-[11px] font-semibold text-negative">매도</span>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-text-tertiary">수량</label>
            <input
              type="number"
              value={sellQty}
              onChange={(e) => setSellQty(e.target.value)}
              max={item.quantity}
              min={1}
              step="any"
              placeholder={String(item.quantity)}
              className="w-24 rounded-lg border border-negative/40 bg-bg-tertiary px-2 py-1 text-right text-[13px] tabular-nums focus:border-negative focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-text-tertiary">매도가</label>
            <input
              type="number"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              min={0}
              step="any"
              className="w-28 rounded-lg border border-negative/40 bg-bg-tertiary px-2 py-1 text-right text-[13px] tabular-nums focus:border-negative focus:outline-none"
            />
          </div>
          {Number(sellQty) > 0 && Number(sellPrice) > 0 && (
            <span className={cn(
              "text-[11px] tabular-nums",
              (Number(sellPrice) - item.avgCost) >= 0 ? "text-positive" : "text-negative"
            )}>
              예상 실현손익: {((Number(sellPrice) - item.avgCost) * Number(sellQty) >= 0 ? "+" : "") + formatLargeNumber(Math.abs((Number(sellPrice) - item.avgCost) * Number(sellQty)))}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={handleSellConfirm}
              disabled={!sellQty || !sellPrice || Number(sellQty) <= 0 || Number(sellQty) > item.quantity || Number(sellPrice) <= 0}
              className="rounded-lg bg-negative px-3 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-negative/90 disabled:opacity-40"
            >
              매도 확정
            </button>
            <button onClick={() => setIsSelling(false)} className="rounded-lg px-2 py-1 text-[12px] text-text-tertiary transition-colors hover:bg-bg-secondary">
              취소
            </button>
          </div>
        </div>
      )}

      {/* 로트별 개별 수정 패널 */}
      {isEditingLots && (
        <div className="border-t border-accent/20 bg-accent/5 px-5 py-3 animate-[fade-in-up_150ms_ease-out]">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-accent">로트별 수정</span>
            <span className="text-[11px] text-text-tertiary">{item.lotCount}개 매수 기록</span>
          </div>
          <div className="space-y-2">
            {item.lots.map((lot, index) => (
              <div key={lot.id} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-[11px] text-text-tertiary">
                  {lot.buyDate
                    ? new Date(lot.buyDate).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })
                    : `로트 ${index + 1}`}
                </span>
                <div className="flex items-center gap-1.5">
                  <label className="shrink-0 text-[11px] text-text-tertiary">수량</label>
                  <input
                    type="number"
                    value={lotEdits[lot.id]?.qty ?? ""}
                    onChange={(e) => setLotEdits((prev) => ({ ...prev, [lot.id]: { ...prev[lot.id], qty: e.target.value } }))}
                    className="w-24 rounded-lg border border-accent/40 bg-bg-tertiary px-2 py-1 text-right text-[13px] tabular-nums focus:border-accent focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="shrink-0 text-[11px] text-text-tertiary">매수가</label>
                  <input
                    type="number"
                    value={lotEdits[lot.id]?.cost ?? ""}
                    onChange={(e) => setLotEdits((prev) => ({ ...prev, [lot.id]: { ...prev[lot.id], cost: e.target.value } }))}
                    className="w-28 rounded-lg border border-accent/40 bg-bg-tertiary px-2 py-1 text-right text-[13px] tabular-nums focus:border-accent focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => handleLotSave(lot.id)}
                  title="저장"
                  className="rounded-lg p-1.5 text-accent transition-colors hover:bg-accent/10"
                >
                  <Check size={13} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => setIsEditingLots(false)}
              className="rounded-lg px-2 py-1 text-[12px] text-text-tertiary transition-colors hover:bg-bg-secondary"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 분석 패널 탭 ──────────────────────────────────────────────────────────────
function AnalysisPanel({
  items,
  activeTab,
  onTabChange,
}: {
  items: Array<{ ticker: string; currentValue: number; weight: number; currency: string; exchange: string }>
  activeTab: AnalysisTab
  onTabChange: (tab: AnalysisTab) => void
}) {
  const donutData = useMemo(() =>
    items.map((item, index) => ({
      name: item.ticker,
      value: item.weight,
      color: CHART_COLORS[index % CHART_COLORS.length],
    })),
    [items]
  )

  const currencyData = useMemo(() => {
    const map: Record<string, number> = {}
    for (const item of items) {
      map[item.currency] = (map[item.currency] ?? 0) + item.currentValue
    }
    const total = Object.values(map).reduce((a, b) => a + b, 0)
    return Object.entries(map).map(([cur, val]) => ({
      name: cur,
      value: total > 0 ? (val / total) * 100 : 0,
      color: CURRENCY_COLORS[cur] ?? "#8E8E93",
    }))
  }, [items])

  const exchangeData = useMemo(() => {
    const map: Record<string, number> = {}
    for (const item of items) {
      map[item.exchange] = (map[item.exchange] ?? 0) + item.currentValue
    }
    const total = Object.values(map).reduce((a, b) => a + b, 0)
    return Object.entries(map).map(([exch, val]) => ({
      name: exch,
      value: total > 0 ? (val / total) * 100 : 0,
      color: EXCHANGE_COLORS[exch] ?? "#8E8E93",
    }))
  }, [items])

  const chartData = activeTab === "weight" ? donutData : activeTab === "currency" ? currencyData : exchangeData
  const centerLabel = activeTab === "weight" ? "종목 수" : activeTab === "currency" ? "통화" : "거래소"
  const centerValue = activeTab === "weight" ? String(items.length) : String(chartData.length)

  const TABS: { id: AnalysisTab; label: string }[] = [
    { id: "weight", label: "비중" },
    { id: "currency", label: "통화" },
    { id: "exchange", label: "거래소" },
  ]

  return (
    <div className="card p-5">
      {/* 탭 헤더 */}
      <div className="mb-4 flex gap-1 rounded-lg bg-bg-secondary p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
              activeTab === tab.id
                ? "bg-bg-primary text-text-primary shadow-sm"
                : "text-text-tertiary hover:text-text-secondary"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 도넛 차트 */}
      <DonutChart data={chartData} centerLabel={centerLabel} centerValue={centerValue} />

      {/* 범례 */}
      <div className="mt-3 space-y-2">
        {chartData.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-[12px] text-text-secondary">{entry.name}</span>
            </div>
            <span className="text-[12px] font-medium tabular-nums text-text-primary">{entry.value.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── 현금자산 KPI 카드 ─────────────────────────────────────────────────────────
function CashCard({
  cashDisplay,
  displayCurrency,
  onSave,
}: {
  cashDisplay: number
  displayCurrency: "USD" | "KRW"
  onSave: (amount: number, currency: "USD" | "KRW") => void
}) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState("")

  const handleOpen = () => {
    setInput(cashDisplay > 0 ? String(Math.round(cashDisplay)) : "")
    setEditing(true)
  }

  const handleSave = () => {
    const val = Number(input)
    if (!isNaN(val) && val >= 0) onSave(val, displayCurrency)
    setEditing(false)
  }

  const fmt = (v: number) => {
    const formatted = new Intl.NumberFormat(displayCurrency === "KRW" ? "ko-KR" : "en-US", {
      minimumFractionDigits: displayCurrency === "KRW" ? 0 : 2,
      maximumFractionDigits: displayCurrency === "KRW" ? 0 : 2,
    }).format(v)
    return displayCurrency === "KRW" ? `${formatted}원` : `$${formatted}`
  }

  if (editing) {
    return (
      <div className="card p-5">
        <p className="text-[12px] text-text-tertiary mb-3">현금자산 ({displayCurrency})</p>
        <input
          type="number"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={displayCurrency === "KRW" ? "5000000" : "5000.00"}
          className="w-full rounded-lg border border-accent bg-bg-tertiary px-3 py-2 text-[15px] font-bold tabular-nums text-text-primary outline-none"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false) }}
          min="0"
          step="any"
        />
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleSave}
            className="flex-1 rounded-lg bg-accent py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-accent/90"
          >
            저장
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded-lg px-3 py-1.5 text-[12px] text-text-tertiary transition-colors hover:bg-bg-secondary"
          >
            취소
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="card p-5 cursor-pointer group transition-colors hover:bg-bg-secondary/30"
      onClick={handleOpen}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12px] text-text-tertiary">현금자산</p>
        <Edit2 size={11} className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="text-[20px] font-bold tabular-nums leading-tight text-text-primary">
        {cashDisplay > 0 ? fmt(cashDisplay) : "—"}
      </p>
      <p className="mt-1 text-[12px] text-text-tertiary">
        {cashDisplay > 0 ? "클릭하여 수정" : "클릭하여 입력"}
      </p>
    </div>
  )
}

// ─── VaultPage ─────────────────────────────────────────────────────────────────
export default function VaultPage() {
  const [activeTab, setActiveTab] = useState<AnalysisTab>("weight")
  const queryClient = useQueryClient()
  const { data: session, status } = useSession()

  // ─ 통화 설정 ─
  const currency    = useCurrency((s) => s.currency)
  const exchangeRate = useCurrency((s) => s.exchangeRate)

  // ─ 현금자산 (localStorage) ─
  const [cashAmount, setCashAmount] = useState<number>(0)
  const [cashCurrency, setCashCurrency] = useState<"USD" | "KRW">("KRW")

  useEffect(() => {
    const amount = Number(localStorage.getItem("vault_cash_amount") ?? "0")
    const cur    = (localStorage.getItem("vault_cash_currency") ?? "KRW") as "USD" | "KRW"
    setCashAmount(amount)
    setCashCurrency(cur)
  }, [])

  const saveCash = useCallback((amount: number, cur: "USD" | "KRW") => {
    setCashAmount(amount)
    setCashCurrency(cur)
    localStorage.setItem("vault_cash_amount", String(amount))
    localStorage.setItem("vault_cash_currency", cur)
  }, [])

  // ─ 포트폴리오 데이터 ─
  const { data: rawItems = [], isLoading, error, refetch } = useQuery({
    queryKey: ["portfolio"],
    queryFn: fetchPortfolio,
    enabled: status === "authenticated",
  })

  const tickers = useMemo(() => [...new Set(rawItems.map((item) => item.ticker))], [rawItems])

  const { data: prices = {} } = useQuery({
    queryKey: ["portfolio-prices", tickers.join(",")],
    queryFn: () => fetchCurrentPrices(tickers),
    enabled: tickers.length > 0,
    refetchInterval: 5 * 60 * 1000,
  })

  const { data: sparklines = {} } = useQuery({
    queryKey: ["portfolio-sparklines", tickers.join(",")],
    queryFn: () => fetchSparklines(tickers),
    enabled: tickers.length > 0,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
  })

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map(deletePortfolioItem)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portfolio"] }),
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { quantity?: number; avgCost?: number } }) =>
      updatePortfolioItem(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portfolio"] }),
  })
  const sellMutation = useMutation({
    mutationFn: ({ ticker, qty, price }: { ticker: string; qty: number; price: number }) => {
      const item = rawItems.find((i) => i.ticker === ticker)
      if (!item) throw new Error("종목을 찾을 수 없습니다.")
      return addPortfolioItem({
        ticker: item.ticker,
        name: item.name,
        exchange: item.exchange,
        currency: item.currency,
        quantity: qty,
        avgCost: price,
        type: "SELL",
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portfolio"] }),
  })

  // ─ 종목 집계 ─
  const items = useMemo((): AggregatedItem[] => {
    const map = new Map<string, {
      ids: string[]; buyIds: string[]; lots: LotItem[]; ticker: string; name: string; exchange: string; currency: string
      totalBuyQuantity: number; totalBuyInvested: number
      totalSellQuantity: number; totalRealizedGain: number
    }>()

    for (const item of rawItems) {
      if (!map.has(item.ticker)) {
        map.set(item.ticker, {
          ids: [], buyIds: [], lots: [], ticker: item.ticker, name: item.name,
          exchange: item.exchange, currency: item.currency,
          totalBuyQuantity: 0, totalBuyInvested: 0,
          totalSellQuantity: 0, totalRealizedGain: 0,
        })
      }
      const entry = map.get(item.ticker)!
      entry.ids.push(item.id)
      const isBuy = item.type === "BUY" || !item.type
      if (isBuy) {
        entry.buyIds.push(item.id)
        entry.lots.push({ id: item.id, quantity: item.quantity, avgCost: item.avgCost, buyDate: item.buyDate })
        entry.totalBuyQuantity += item.quantity
        entry.totalBuyInvested += item.totalInvested
      } else {
        // SELL lot: 수량 차감, 실현손익 누적
        entry.totalSellQuantity += item.quantity
        entry.totalRealizedGain += item.realizedGain ?? 0
      }
    }

    const aggregated = Array.from(map.values()).map((entry) => {
      const quote = prices[entry.ticker]
      const avgCostBasis = entry.totalBuyQuantity > 0 ? entry.totalBuyInvested / entry.totalBuyQuantity : 0
      const remainingQty = Math.max(0, entry.totalBuyQuantity - entry.totalSellQuantity)
      const remainingInvested = remainingQty * avgCostBasis
      const currentValue = quote ? quote.price * remainingQty : remainingInvested
      const gainLoss = quote ? currentValue - remainingInvested : 0
      return {
        ids: entry.ids,
        buyIds: entry.buyIds,
        lots: entry.lots,
        ticker: entry.ticker,
        name: entry.name,
        exchange: entry.exchange,
        currency: entry.currency,
        quantity: remainingQty,
        avgCost: avgCostBasis,
        totalInvested: remainingInvested,
        realizedGain: entry.totalRealizedGain,
        lotCount: entry.buyIds.length,
        currentPrice: quote?.price,
        currentValue,
        gainLoss,
        gainLossPercent: remainingInvested > 0 ? (gainLoss / remainingInvested) * 100 : 0,
        weight: 0,
      }
    }).filter((item) => item.quantity > 0) // 전량 매도 종목은 목록에서 제외

    const total = aggregated.reduce((sum, item) => sum + item.currentValue, 0)
    return aggregated.map((item) => ({
      ...item,
      weight: total > 0 ? (item.currentValue / total) * 100 : 0,
    }))
  }, [prices, rawItems])

  // ─ 통화 변환 헬퍼 ─
  const toDisplay = useCallback((value: number, fromCurrency: string): number => {
    if (fromCurrency === currency) return value
    if (fromCurrency === "USD" && currency === "KRW") return value * exchangeRate
    if (fromCurrency === "KRW" && currency === "USD") return value / exchangeRate
    return value
  }, [currency, exchangeRate])

  // 표시 통화 포맷터
  const fmtDisplay = useCallback((value: number): string => {
    const formatted = new Intl.NumberFormat(currency === "KRW" ? "ko-KR" : "en-US", {
      minimumFractionDigits: currency === "KRW" ? 0 : 2,
      maximumFractionDigits: currency === "KRW" ? 0 : 2,
    }).format(value)
    return currency === "KRW" ? `${formatted}원` : `$${formatted}`
  }, [currency])

  // ─ KPI 합산 (표시 통화 기준) ─
  const totalInvestedDisplay  = items.reduce((s, i) => s + toDisplay(i.totalInvested, i.currency), 0)
  const totalStockValueDisplay = items.reduce((s, i) => s + toDisplay(i.currentValue, i.currency), 0)
  const cashDisplay            = toDisplay(cashAmount, cashCurrency)
  const totalValueDisplay      = totalStockValueDisplay + cashDisplay
  const totalGainLossDisplay   = totalStockValueDisplay - totalInvestedDisplay
  const totalGainLossPercent   = totalInvestedDisplay > 0 ? (totalGainLossDisplay / totalInvestedDisplay) * 100 : 0
  const totalRealizedGainDisplay = items.reduce((s, i) => s + toDisplay(i.realizedGain, i.currency), 0)

  // ─ KPI 카드 구성 ─
  // 순서: 총자산 | 현금자산 | 투입자본 | 평가손익 | 수익률 | 실현손익
  const kpiCards = [
    {
      label: "총 자산",
      value: fmtDisplay(totalValueDisplay),
      sub: `${items.length}개 종목`,
      color: undefined as string | undefined,
    },
    null, // 현금자산 (별도 컴포넌트)
    {
      label: "투입 자본",
      value: fmtDisplay(totalInvestedDisplay),
      sub: "매수가 기준",
      color: undefined,
    },
    {
      label: "평가 손익",
      value: (totalGainLossDisplay >= 0 ? "+" : "") + fmtDisplay(Math.abs(totalGainLossDisplay)),
      sub: formatPercent(totalGainLossPercent),
      color: getChangeColor(totalGainLossDisplay),
    },
    {
      label: "수익률",
      value: formatPercent(totalGainLossPercent),
      sub: totalGainLossDisplay >= 0 ? "수익 중" : "손실 중",
      color: getChangeColor(totalGainLossPercent),
    },
    {
      label: "실현손익",
      value: totalRealizedGainDisplay !== 0
        ? (totalRealizedGainDisplay >= 0 ? "+" : "") + fmtDisplay(Math.abs(totalRealizedGainDisplay))
        : "—",
      sub: "매도 확정 손익",
      color: totalRealizedGainDisplay !== 0 ? getChangeColor(totalRealizedGainDisplay) : undefined,
    },
  ]

  if (status === "unauthenticated") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="w-14 h-14 rounded-2xl bg-accent-light flex items-center justify-center">
          <Wallet size={24} className="text-accent" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-text-primary">Private Vault</h2>
          <p className="text-[14px] text-text-secondary mt-1">
            로그인하면 나만의 포트폴리오를 저장하고 관리할 수 있습니다.
          </p>
        </div>
        <button
          onClick={() => signIn()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-[14px] font-medium hover:bg-accent-dark transition-colors cursor-pointer"
        >
          <LogIn size={16} />
          로그인하기
        </button>
      </div>
    )
  }

  return (
    /* 전체 레이아웃: 좌(포트폴리오) + 우(종목 검색) */
    <div className="flex gap-6 items-start animate-[fade-in-up_350ms_ease-out]">

      {/* ── 왼쪽: 포트폴리오 영역 ── */}
      <div className="min-w-0 flex-1 space-y-6">
        <Header
          title="Private Vault"
          subtitle="포트폴리오 관리"
          onRefresh={refetch}
          isRefreshing={isLoading}
        />

        {error && <ErrorState onRetry={refetch} />}

        {isLoading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="card space-y-2 p-5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-7 w-28" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          </div>
        )}

        {!isLoading && !error && items.length === 0 && (
          <div className="card p-12">
            <EmptyState title="아직 보유 종목이 없습니다." message="오른쪽에서 종목을 검색해 포트폴리오를 시작해 보세요." icon={<Wallet size={20} />} />
          </div>
        )}

        {!isLoading && !error && items.length > 0 && (
          <>
            {/* KPI 카드 */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
              {kpiCards.map((kpi, idx) =>
                kpi === null ? (
                  /* 현금자산 카드 */
                  <CashCard
                    key="cash"
                    cashDisplay={cashDisplay}
                    displayCurrency={currency as "USD" | "KRW"}
                    onSave={saveCash}
                  />
                ) : (
                  <div key={kpi.label} className="card p-5">
                    <p className="mb-2 text-[12px] text-text-tertiary">{kpi.label}</p>
                    <p className={cn("text-[20px] font-bold tabular-nums leading-tight", kpi.color ?? "text-text-primary")}>
                      {kpi.value}
                    </p>
                    <p className={cn("mt-1 text-[12px]", kpi.color ?? "text-text-secondary")}>{kpi.sub}</p>
                  </div>
                )
              )}
            </div>

            {/* 분석 패널 + 테이블 */}
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[280px_1fr]">
              <AnalysisPanel
                items={items.map((item) => ({
                  ticker: item.ticker,
                  currentValue: item.currentValue,
                  weight: item.weight ?? 0,
                  currency: item.currency,
                  exchange: item.exchange,
                }))}
                activeTab={activeTab}
                onTabChange={setActiveTab}
              />

              {/* 보유 종목 테이블 */}
              <div className="card overflow-hidden">
                <div className={cn(
                  `grid ${TABLE_GRID} gap-3 border-b border-surface-border bg-bg-secondary px-5 py-2.5`,
                  "text-[11px] font-medium uppercase tracking-wider text-text-tertiary"
                )}>
                  <span className="w-2.5" />
                  <span>종목</span>
                  <span className="text-center">30일</span>
                  <span className="text-right">수량</span>
                  <span className="text-right">매수가</span>
                  <span className="text-right">투입금</span>
                  <span className="text-right">평가금</span>
                  <span className="text-right">수익률</span>
                  <span className="text-center">비중</span>
                  <span className="text-right">작업</span>
                </div>

                {items.map((item, index) => (
                  <PortfolioRow
                    key={item.ticker}
                    item={item}
                    weight={item.weight}
                    color={CHART_COLORS[index % CHART_COLORS.length]}
                    sparklineData={sparklines[item.ticker]}
                    onDelete={(ids) => deleteMutation.mutate(ids)}
                    onUpdate={(id, data) => updateMutation.mutate({ id, data })}
                    onSell={(ticker, qty, price) => sellMutation.mutate({ ticker, qty, price })}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── 오른쪽: 종목 검색 패널 (sticky) ── */}
      <div className="w-[300px] shrink-0">
        <div className="sticky top-6">
          <StockSearchPanel onAdded={() => {}} />
        </div>
      </div>

    </div>
  )
}
