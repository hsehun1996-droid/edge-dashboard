"use client"

import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { ko } from "date-fns/locale"
import { Header } from "@/components/layout/header"
import { MarketCard, MarketCardSkeleton } from "@/components/market/market-card"
import { NewsFeed, NewsFeedSkeleton } from "@/components/market/news-feed"
import { SectorPanel } from "@/components/market/sector-table"
import { ErrorState } from "@/components/ui/error-state"
import type { MarketIndex, NewsItem } from "@/types"

async function fetchMarketData(): Promise<MarketIndex[]> {
  const res = await fetch("/api/market")
  if (!res.ok) throw new Error("시장을 불러올 수 없습니다.")
  return (await res.json()).data
}

async function fetchNews(): Promise<NewsItem[]> {
  const res = await fetch("/api/market/news")
  if (!res.ok) throw new Error("뉴스를 불러올 수 없습니다.")
  return (await res.json()).data
}

export default function GlobalMarketPulsePage() {
  const {
    data: indices,
    isLoading: loadingIndices,
    error: errorIndices,
    refetch: refetchIndices,
    isFetching: fetchingIndices,
  } = useQuery({
    queryKey: ["market-indices"],
    queryFn: fetchMarketData,
    refetchInterval: 5 * 60 * 1000,
  })

  const {
    data: news,
    isLoading: loadingNews,
    error: errorNews,
    refetch: refetchNews,
  } = useQuery({
    queryKey: ["market-news"],
    queryFn: fetchNews,
    refetchInterval: 30 * 60 * 1000,
  })

  const now = format(new Date(), "M월 d일 HH:mm", { locale: ko })
  const advancing = indices?.filter((i) => i.changePercent > 0).length ?? 0
  const declining = indices?.filter((i) => i.changePercent < 0).length ?? 0
  const total = indices?.length ?? 0
  const unchanged = total - advancing - declining
  const isRefreshing = loadingIndices || loadingNews || fetchingIndices

  return (
    <div className="space-y-5 animate-[fade-in-up_350ms_ease-out]">
      <Header
        title="Global Market Pulse"
        subtitle="9개국 주요 지수의 실시간 흐름"
        lastUpdated={now}
        onRefresh={() => {
          refetchIndices()
          refetchNews()
        }}
        isRefreshing={isRefreshing}
      />

      {!loadingIndices && !errorIndices && indices && (
        <div className="flex items-center gap-5 rounded-xl border border-surface-border bg-bg-primary px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-positive" />
            <span className="text-[12px] text-text-secondary">
              상승 <span className="font-semibold text-positive">{advancing}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-negative" />
            <span className="text-[12px] text-text-secondary">
              하락 <span className="font-semibold text-negative">{declining}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-neutral" />
            <span className="text-[12px] text-text-secondary">
              보합 <span className="font-semibold text-neutral">{unchanged}</span>
            </span>
          </div>
          <div className="ml-auto text-[11px] text-text-tertiary">{total}개 지수 추적 중</div>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-[14px] font-semibold uppercase tracking-wider text-text-secondary">
          주요 지수
        </h2>
        {errorIndices ? (
          <ErrorState onRetry={refetchIndices} />
        ) : loadingIndices ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {Array.from({ length: 9 }).map((_, i) => (
              <MarketCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {(indices ?? []).map((index) => (
              <MarketCard key={index.ticker} index={index} />
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_380px]">
        <div className="min-h-[520px]">
          <SectorPanel />
        </div>

        <div className="card p-4">
          <h2 className="mb-3 text-[14px] font-semibold uppercase tracking-wider text-text-secondary">
            주요 증권 뉴스
          </h2>
          {errorNews ? (
            <ErrorState compact onRetry={refetchNews} message="뉴스를 불러올 수 없습니다." />
          ) : loadingNews ? (
            <NewsFeedSkeleton />
          ) : (
            <NewsFeed news={news ?? []} />
          )}
        </div>
      </div>
    </div>
  )
}
