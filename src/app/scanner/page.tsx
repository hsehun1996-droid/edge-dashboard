"use client"

import { useState, useEffect, useCallback } from "react"
import { useQuery }                           from "@tanstack/react-query"
import { Header }                             from "@/components/layout/header"
import { ErrorState, EmptyState }             from "@/components/ui/error-state"
import { Skeleton }                           from "@/components/ui/skeleton"
import { MiniChart }                          from "@/components/charts/mini-chart"
import type { ScannerResult, ScannerCountry, ScannerScope } from "@/types"
import {
  cn,
  formatDisplayCurrency,
  formatPercent,
  formatLargeNumber,
  getChangeColor,
} from "@/lib/utils"
import {
  Check,
  X,
  Radar,
  Info,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Database,
  Clock,
  AlertCircle,
} from "lucide-react"
import { useCurrency } from "@/store/currency"

// ─── Types ────────────────────────────────────────────────────────────────────

interface SyncStatus {
  status:       string
  sync_type:    string
  scope:        ScannerScope
  phase:        string
  total:        number
  success:      number
  failed:       number
  started_at:   string | null
  updated_at:   string | null
  last_scan_at: string | null
  scan_count:   number
  message:      string
  is_syncing:   boolean
}

interface ScannerData {
  needsSync?:  boolean
  syncStatus?: SyncStatus
  data?:       { passed: ScannerResult[]; all: ScannerResult[] }
  total?:      number
  timestamp:   string
}

// ─── Minervini criteria ───────────────────────────────────────────────────────

const CRITERIA = [
  { key: "above150MA",      label: "현재가 > 150일 MA",        desc: "주가가 150일 이동평균 위에 있음" },
  { key: "above200MA",      label: "현재가 > 200일 MA",        desc: "주가가 200일 이동평균 위에 있음" },
  { key: "ma150AboveMa200", label: "150일 MA > 200일 MA",      desc: "단기 MA가 장기 MA 위 (정배열)" },
  { key: "ma200Trending",   label: "200일 MA 상승 추세",        desc: "최소 1개월간 200일 MA 우상향" },
  { key: "ma50AboveMa150",  label: "50일 MA > 150일 MA",       desc: "50일 MA가 150일 MA 위 (강한 정배열)" },
  { key: "ma50AboveMa200",  label: "50일 MA > 200일 MA",       desc: "50일 MA가 200일 MA 위" },
  { key: "priceAboveMa50",  label: "현재가 > 50일 MA",         desc: "단기 지지선 위에 위치" },
  { key: "near52WeekHigh",  label: "52주 고가 -25% 이내",      desc: "신고가 근접 (신고가 돌파 준비)" },
  { key: "above52WeekLow",  label: "52주 저가 대비 +30% 이상", desc: "바닥권 탈출 및 강한 회복세" },
  { key: "highRsRating",    label: "RS Rating ≥ 70",           desc: "시장 대비 상위 30% 주가 모멘텀" },
] as const

const EXTRA_CRITERIA = [
  { key: "rs85Rating",       label: "RS Rating 85+",      desc: "상대강도 상위권만 유지" },
  { key: "near52WeekHigh15", label: "52주 고점 -15% 이내", desc: "고점 인접 리더 우선" },
  { key: "priceMinOk",       label: "최소 가격 통과",      desc: "초저가 종목 제외" },
  { key: "liquidityOk",      label: "평균 거래량 통과",    desc: "유동성 부족 종목 제외" },
  { key: "turnoverOk",       label: "거래대금 통과",      desc: "실제 수급이 붙는 종목 우선" },
  { key: "volumeSupport",    label: "거래량 지지",        desc: "현재 거래량이 평균 대비 과도하게 약하지 않음" },
] as const

const COUNTRIES: { code: ScannerCountry | "ALL"; label: string; flag: string }[] = [
  { code: "ALL", label: "전체",    flag: "🌐" },
  { code: "US",  label: "미국",    flag: "🇺🇸" },
  { code: "KR",  label: "한국",    flag: "🇰🇷" },
]

const COUNTRY_BENCHMARK: Record<ScannerCountry, string> = {
  US: "S&P 500",
  KR: "KOSPI",
}

const SYNC_SCOPES: Array<{ code: ScannerScope; label: string }> = [
  { code: "ALL", label: "전체" },
  { code: "US", label: "미국" },
  { code: "KR", label: "한국" },
]

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchScannerResults(): Promise<ScannerData> {
  const res = await fetch("/api/scanner?limit=5000")
  if (!res.ok) throw new Error("스캐너 오류")
  return res.json()
}

async function fetchSyncStatus(): Promise<SyncStatus> {
  const res = await fetch("/api/scanner/status")
  if (!res.ok) throw new Error("상태 조회 오류")
  return res.json()
}

async function triggerSync(type: "full" | "incremental", scope: ScannerScope): Promise<void> {
  const res = await fetch("/api/scanner/sync", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ type, scope }),
  })
  if (!res.ok && res.status !== 409) throw new Error("동기화 시작 실패")
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RSRatingBar({ value }: { value: number }) {
  const color =
    value >= 90 ? "#00C170" :
    value >= 70 ? "#5E6AD2" :
    value >= 50 ? "#F2994A" : "#FF3B30"
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[13px] font-bold tabular-nums" style={{ color }}>
        {value}
      </span>
    </div>
  )
}

function ScannerCard({ result }: { result: ScannerResult }) {
  const currency     = useCurrency((s) => s.currency)
  const exchangeRate = useCurrency((s) => s.exchangeRate)
  const [expanded, setExpanded] = useState(false)

  const countryConfig = COUNTRIES.find((c) => c.code === result.country)

  return (
    <div className={cn("card transition-all duration-200", expanded && "shadow-card-hover")}>
      <div className="p-5 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[17px] font-bold text-text-primary truncate">
                {result.name || result.ticker}
              </span>
              {result.enhancedPassed && (
                <span className="flex items-center gap-1 text-[11px] font-semibold bg-accent/10 text-accent px-2 py-0.5 rounded-full shrink-0">
                  <Check size={10} strokeWidth={3} /> 강화 스크린 통과
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[12px] font-semibold text-text-tertiary">{result.ticker}</span>
              {countryConfig && (
                <span className="text-[11px] text-text-tertiary bg-bg-secondary px-2 py-0.5 rounded-md">
                  {countryConfig.flag} {countryConfig.label}
                </span>
              )}
              <span className="text-[11px] text-text-tertiary bg-bg-secondary px-2 py-0.5 rounded-md">
                {result.exchange}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[20px] font-bold text-text-primary tabular-nums">
              {formatDisplayCurrency(result.price, currency, exchangeRate, result.nativeCurrency)}
            </p>
            <p className={cn("text-[13px] font-medium tabular-nums mt-0.5", getChangeColor(result.changePercent))}>
              {formatPercent(result.changePercent)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 mt-4">
          <div>
            <p className="text-[11px] text-text-tertiary mb-1">조건 충족</p>
            <div className="flex items-center gap-1.5">
              {CRITERIA.map((c) => (
                <div
                  key={c.key}
                  className={cn(
                    "w-2.5 h-2.5 rounded-full",
                    result[c.key as keyof ScannerResult] ? "bg-accent" : "bg-surface-border"
                  )}
                  title={c.label}
                />
              ))}
              <span className="ml-1 text-[12px] font-semibold text-text-secondary tabular-nums">
                {result.passCount}/10
              </span>
              <span className="text-[12px] text-text-tertiary">+</span>
              <span className="text-[12px] font-semibold text-text-secondary tabular-nums">
                {result.enhancedPassCount}/7
              </span>
            </div>
          </div>
          <div>
            <p className="text-[11px] text-text-tertiary mb-1">
              RS Rating {result.country ? `vs ${COUNTRY_BENCHMARK[result.country]}` : ""}
            </p>
            <RSRatingBar value={result.rsRating} />
          </div>
          <div>
            <p className="text-[11px] text-text-tertiary mb-1">Quality Score</p>
            <p className="text-[16px] font-bold text-text-primary tabular-nums">
              {Math.round(result.qualityScore)}
            </p>
          </div>
          <div className="ml-auto">
            {expanded
              ? <ChevronUp size={16} className="text-text-tertiary" />
              : <ChevronDown size={16} className="text-text-tertiary" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-surface-border p-5 animate-[fade-in-up_200ms_ease-out]">
          <div className="grid grid-cols-[1fr_260px] gap-5">
            <div>
              <p className="text-[13px] font-semibold text-text-primary mb-3">
                미너비니 Trend Template 체크리스트
              </p>
              <div className="space-y-2">
                {CRITERIA.map((c) => {
                  const pass = result[c.key as keyof ScannerResult] as boolean
                  return (
                    <div key={c.key} className="flex items-start gap-3">
                      <div className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                        pass ? "bg-accent" : "bg-surface-border"
                      )}>
                        {pass
                          ? <Check size={10} className="text-white" strokeWidth={3} />
                          : <X size={10} className="text-text-tertiary" strokeWidth={2} />}
                      </div>
                      <div>
                        <p className={cn("text-[13px] font-medium", pass ? "text-text-primary" : "text-text-tertiary")}>
                          {c.label}
                        </p>
                        <p className="text-[11px] text-text-tertiary">{c.desc}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <p className="text-[13px] font-semibold text-text-primary mt-5 mb-3">
                추가 강화 조건
              </p>
              <div className="space-y-2">
                {EXTRA_CRITERIA.map((c) => {
                  const pass = result[c.key as keyof ScannerResult] as boolean
                  return (
                    <div key={c.key} className="flex items-start gap-3">
                      <div className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                        pass ? "bg-accent" : "bg-surface-border"
                      )}>
                        {pass
                          ? <Check size={10} className="text-white" strokeWidth={3} />
                          : <X size={10} className="text-text-tertiary" strokeWidth={2} />}
                      </div>
                      <div>
                        <p className={cn("text-[13px] font-medium", pass ? "text-text-primary" : "text-text-tertiary")}>
                          {c.label}
                        </p>
                        <p className="text-[11px] text-text-tertiary">{c.desc}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="space-y-4">
              {result.priceHistory && result.priceHistory.length > 0 && (
                <div className="card p-3">
                  <p className="text-[11px] text-text-tertiary mb-2">60일 주가 차트</p>
                  <MiniChart
                    data={result.priceHistory}
                    ticker={result.ticker}
                    sourceCurrency={result.nativeCurrency}
                    positive={result.changePercent >= 0}
                  />
                </div>
              )}
              <div className="card p-4 space-y-2.5">
                <p className="text-[12px] font-semibold text-text-secondary">이동평균선</p>
                {[
                  { label: "현재가",       value: result.price },
                  { label: "Quality Score", value: result.qualityScore, raw: true },
                  { label: "50일 MA",     value: result.ma50 },
                  { label: "150일 MA", value: result.ma150 },
                  { label: "200일 MA", value: result.ma200 },
                  { label: "52주 고가", value: result.high52w },
                  { label: "52주 저가", value: result.low52w },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between">
                    <span className="text-[12px] text-text-secondary">{row.label}</span>
                    <span className="text-[12px] font-medium text-text-primary tabular-nums">
                      {"raw" in row
                        ? Math.round(row.value).toLocaleString()
                        : formatDisplayCurrency(row.value, currency, exchangeRate, result.nativeCurrency)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-text-tertiary">거래량</span>
                <span className="font-medium text-text-secondary tabular-nums">
                  {formatLargeNumber(result.volume)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ScannerSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card p-5 space-y-4">
          <div className="flex justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
            <div className="space-y-2 text-right">
              <Skeleton className="h-6 w-24 ml-auto" />
              <Skeleton className="h-3 w-16 ml-auto" />
            </div>
          </div>
          <div className="flex gap-6">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Sync Panel ───────────────────────────────────────────────────────────────

function SyncPanel({ syncStatus, onSynced }: { syncStatus?: SyncStatus; onSynced: () => void }) {
  const [syncing,  setSyncing]  = useState(syncStatus?.is_syncing ?? false)
  const [localMsg, setLocalMsg] = useState("")

  useEffect(() => {
    setSyncing(syncStatus?.is_syncing ?? false)
  }, [syncStatus?.is_syncing])

  // 실행 중일 때 폴링
  useEffect(() => {
    if (!syncing) return
    const id = setInterval(async () => {
      try {
        const st = await fetchSyncStatus()
        setLocalMsg(st.message)
        if (!st.is_syncing) {
          setSyncing(false)
          onSynced()
        }
      } catch { /* ignore */ }
    }, 4_000)
    return () => clearInterval(id)
  }, [syncing, onSynced])

  const handleSync = async (type: "full" | "incremental", scope: ScannerScope) => {
    const scopeLabel = SYNC_SCOPES.find((item) => item.code === scope)?.label ?? "전체"
    setSyncing(true)
    setLocalMsg(
      type === "full"
        ? `${scopeLabel} 전체 동기화 시작 중...`
        : `${scopeLabel} 증분 업데이트 시작 중...`
    )
    setLocalMsg(type === "full" ? "전체 동기화 시작 중..." : "증분 업데이트 시작 중...")
    try {
      await triggerSync(type, scope)
    } catch (e) {
      setLocalMsg("시작 실패: " + (e instanceof Error ? e.message : "오류"))
      setLocalMsg("시작 실패: " + (e instanceof Error ? e.message : "오류"))
      setSyncing(false)
    }
  }

  const progress =
    syncStatus && syncStatus.total > 0
      ? Math.round(((syncStatus.success + syncStatus.failed) / syncStatus.total) * 100)
      : 0

  const activeScopeLabel = SYNC_SCOPES.find((item) => item.code === syncStatus?.scope)?.label ?? "전체"

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-accent" />
          <p className="text-[14px] font-semibold text-text-primary">데이터 동기화</p>
        </div>
        {syncStatus?.last_scan_at && (
          <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
            <Clock size={11} />
            마지막 스캔: {new Date(syncStatus.last_scan_at).toLocaleString("ko-KR")}
          </div>
        )}
      </div>

      {syncing && (
        <div className="space-y-2">
          <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: `${Math.max(progress, 3)}%` }}
            />
          </div>
          <p className="text-[12px] text-text-secondary animate-pulse">
            {localMsg || syncStatus?.message || "처리 중..."}
            {syncStatus?.total
              ? ` — ${(syncStatus.success + syncStatus.failed).toLocaleString()} / ${syncStatus.total.toLocaleString()}`
              : ""}
          </p>
        </div>
      )}

      {!syncing && syncStatus?.status === "failed" && (
        <div className="flex items-start gap-2 text-[12px] text-red-400 bg-red-400/8 rounded-lg px-3 py-2">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{syncStatus.message || "동기화 실패"}</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => handleSync("incremental", "ALL")}
          disabled={syncing}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium bg-bg-secondary text-text-primary hover:bg-surface-border disabled:opacity-50 transition-all"
        >
          <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
          증분 업데이트
        </button>
        <button
          onClick={() => handleSync("full", "ALL")}
          disabled={syncing}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-all"
        >
          <Database size={13} />
          전체 동기화
        </button>
      </div>

      {syncStatus?.is_syncing && (
        <div className="text-[12px] text-text-tertiary">
          현재 실행: {activeScopeLabel} {syncStatus.sync_type === "incremental" ? "증분 업데이트" : "전체 동기화"}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {SYNC_SCOPES.filter((scope) => scope.code !== "ALL").map((scope) => (
          <button
            key={`incremental-${scope.code}`}
            onClick={() => handleSync("incremental", scope.code)}
            disabled={syncing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium bg-bg-secondary text-text-primary hover:bg-surface-border disabled:opacity-50 transition-all"
          >
            <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
            {scope.label} 증분
          </button>
        ))}
        {SYNC_SCOPES.filter((scope) => scope.code !== "ALL").map((scope) => (
          <button
            key={`full-${scope.code}`}
            onClick={() => handleSync("full", scope.code)}
            disabled={syncing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-all"
          >
            <Database size={13} />
            {scope.label} 전체
          </button>
        ))}
      </div>

      <p className="text-[11px] text-text-tertiary">
        전체 동기화: 전종목 1년 시세 수집 (최초 1회, 10~20분 소요) · 증분 업데이트: 최신 데이터만 갱신 (3~5분)
      </p>
    </div>
  )
}

// ─── Country Summary ──────────────────────────────────────────────────────────

function CountrySummary({
  all,
  passed,
  rs70,
}: {
  all:    ScannerResult[]
  passed: ScannerResult[]
  rs70:   ScannerResult[]
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {(["US", "KR"] as ScannerCountry[]).map((code) => {
        const config   = COUNTRIES.find((c) => c.code === code)!
        const total    = all.filter((r) => r.country === code).length
        const pass     = passed.filter((r) => r.country === code).length
        const rs70cnt  = rs70.filter((r) => r.country === code).length
        return (
          <div key={code} className="card p-4 flex flex-col gap-1">
            <p className="text-[12px] text-text-tertiary">
              {config.flag} {config.label}
            </p>
            <p className="text-[22px] font-bold text-text-primary tabular-nums">{pass}</p>
            <p className="text-[11px] text-text-tertiary">
              통과 / RS70+ {rs70cnt} / 전체 {total.toLocaleString()}
            </p>
            <div className="mt-1 h-1 bg-bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full"
                style={{ width: total > 0 ? `${(pass / total) * 100}%` : "0%" }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type ViewMode = "passed" | "rs70" | "all"

export default function ScannerPage() {
  const [viewMode,         setViewMode]         = useState<ViewMode>("passed")
  const [selectedCountry,  setSelectedCountry]  = useState<ScannerCountry | "ALL">("ALL")
  const [showCount,        setShowCount]        = useState(100)

  const {
    data,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery<ScannerData>({
    queryKey:  ["scanner"],
    queryFn:   fetchScannerResults,
    staleTime: 60 * 60 * 1000, // 1시간
  })

  const handleSynced = useCallback(() => {
    refetch()
    setShowCount(100)
  }, [refetch])

  const needsSync    = data?.needsSync ?? false
  const syncStatus   = data?.syncStatus
  const passedResults = data?.data?.passed ?? []
  const allResults    = data?.data?.all    ?? []
  const rs70Results   = allResults.filter((r) => r.rsRating >= 70)

  const baseResults =
    viewMode === "passed" ? passedResults :
    viewMode === "rs70"   ? rs70Results   :
    allResults

  const filteredResults = selectedCountry === "ALL"
    ? baseResults
    : baseResults.filter((r) => r.country === selectedCountry)

  const displayResults = filteredResults.slice(0, showCount)
  const hasMore        = filteredResults.length > showCount

  const countForTab = (code: ScannerCountry | "ALL") =>
    code === "ALL"
      ? baseResults.length
      : baseResults.filter((r) => r.country === code).length

  return (
    <div className="space-y-8 animate-[fade-in-up_350ms_ease-out]">
      <Header
        title="Alpha Scanner"
        subtitle="Minervini Trend Template 자동 필터 — 미국 · 한국 전종목"
        onRefresh={refetch}
        isRefreshing={isFetching}
      />

      {/* Info banner */}
      <div className="flex items-start gap-3 px-5 py-4 bg-chart-1/8 border border-chart-1/20 rounded-xl">
        <Info size={16} className="text-chart-1 shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-text-primary">
            Mark Minervini의 Trend Template 기준 (미국·한국 전종목 스캔)
          </p>
          <p className="text-[12px] text-text-secondary mt-0.5">
            RS Rating은 각 국가 기준지수(S&amp;P 500 · KOSPI) 대비 상대강도로 산출됩니다.
            10개 조건 중 8개 이상 충족 시 &quot;통과&quot;로 분류되며, 투자 권유가 아닙니다.
          </p>
        </div>
      </div>

      {/* Sync panel */}
      <SyncPanel
        syncStatus={needsSync ? syncStatus : (data?.syncStatus ?? syncStatus)}
        onSynced={handleSynced}
      />

      {/* No data state */}
      {!isLoading && !error && needsSync && (
        <div className="card p-12">
          <EmptyState
            title="아직 데이터가 없어요"
            message="위의 '전체 동기화' 버튼을 눌러 미국·한국 전종목 시세를 수집해주세요. 최초 실행 시 10~20분 소요됩니다."
            icon={<Database size={20} />}
          />
        </div>
      )}

      {/* Results area */}
      {!needsSync && (
        <>
          {/* Country summary */}
          {!isLoading && !error && data?.data && (
            <CountrySummary all={allResults} passed={passedResults} rs70={rs70Results} />
          )}

          {/* Filter bar */}
          {!isLoading && !error && data?.data && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                {(
                  [
                    { mode: "passed" as ViewMode, label: "강화 스크린 통과", count: passedResults.length },
                    { mode: "rs70"   as ViewMode, label: "RS Rating 70+",       count: rs70Results.length },
                    { mode: "all"    as ViewMode, label: "전체 스캔 결과",       count: allResults.length },
                  ] as const
                ).map(({ mode, label, count }) => (
                  <button
                    key={mode}
                    onClick={() => { setViewMode(mode); setShowCount(100) }}
                    className={cn(
                      "px-4 py-1.5 rounded-full text-[13px] font-medium transition-all",
                      viewMode === mode
                        ? "bg-accent text-white"
                        : "bg-bg-secondary text-text-secondary hover:text-text-primary"
                    )}
                  >
                    {label} ({count.toLocaleString()})
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {COUNTRIES.map((c) => (
                  <button
                    key={c.code}
                    onClick={() => { setSelectedCountry(c.code); setShowCount(100) }}
                    className={cn(
                      "px-3.5 py-1 rounded-full text-[12px] font-medium transition-all",
                      selectedCountry === c.code
                        ? "bg-bg-secondary text-text-primary ring-1 ring-surface-border"
                        : "text-text-tertiary hover:text-text-secondary"
                    )}
                  >
                    {c.flag} {c.label}
                    {c.code !== "ALL" && (
                      <span className="ml-1.5 tabular-nums text-text-tertiary">
                        {countForTab(c.code).toLocaleString()}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          {error ? (
            <ErrorState onRetry={refetch} />
          ) : isLoading ? (
            <ScannerSkeleton />
          ) : filteredResults.length === 0 ? (
            <div className="card p-12">
              <EmptyState
                title="조건 충족 종목이 없어요"
                message={
                  selectedCountry !== "ALL"
                    ? `${COUNTRIES.find((c) => c.code === selectedCountry)?.label} 시장에서 조건을 만족하는 종목이 없어요. 다른 국가나 전체 결과를 확인해보세요.`
                    : "현재 시장에서 미너비니 조건을 만족하는 종목을 찾지 못했어요."
                }
                icon={<Radar size={20} />}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {displayResults.map((result) => (
                  <ScannerCard key={`${result.country}-${result.ticker}`} result={result} />
                ))}
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="flex items-center justify-center pt-2">
                  <button
                    onClick={() => setShowCount((n) => n + 100)}
                    className="px-6 py-2 rounded-full text-[13px] font-medium bg-bg-secondary text-text-secondary hover:text-text-primary transition-all"
                  >
                    더 보기 ({filteredResults.length - showCount}개 남음)
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
