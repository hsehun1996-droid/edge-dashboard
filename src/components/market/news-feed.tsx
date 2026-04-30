"use client"

import { formatDistanceToNow } from "date-fns"
import { ko } from "date-fns/locale"
import { ExternalLink } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { NewsItem } from "@/types"

interface NewsFeedProps {
  news: NewsItem[]
}

export function NewsFeed({ news }: NewsFeedProps) {
  return (
    <div className="max-h-[620px] space-y-3 overflow-y-auto pr-2">
      {news.slice(0, 100).map((item) => (
        <NewsCard key={item.id} item={item} />
      ))}
      {news.length === 0 && (
        <p className="py-8 text-center text-[13px] text-text-tertiary">
          표시할 뉴스가 없습니다.
        </p>
      )}
    </div>
  )
}

function NewsCard({ item }: { item: NewsItem }) {
  const sentimentColor = {
    positive: "border-l-positive",
    negative: "border-l-negative",
    neutral: "border-l-neutral",
  }[item.sentiment ?? "neutral"]

  let timeAgo = ""
  try {
    timeAgo = formatDistanceToNow(new Date(item.publishedAt), {
      addSuffix: true,
      locale: ko,
    })
  } catch {
    timeAgo = ""
  }

  return (
    <a
      href={item.url !== "#" ? item.url : undefined}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "block cursor-pointer rounded-xl border border-surface-border border-l-4 p-4 transition-colors hover:bg-bg-secondary",
        sentimentColor
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[11px] text-text-tertiary">한국 뉴스</span>
            <span className="text-[11px] text-text-tertiary">•</span>
            <span className="text-[11px] font-medium text-text-secondary">{item.source}</span>
          </div>
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-text-primary">
            {item.title}
          </p>
          {item.summary && (
            <p className="mt-1 line-clamp-2 text-[12px] text-text-secondary">{item.summary}</p>
          )}
        </div>
        {item.url !== "#" && (
          <ExternalLink size={14} className="mt-0.5 shrink-0 text-text-tertiary" />
        )}
      </div>
      {timeAgo && <p className="mt-2 text-[11px] text-text-tertiary">{timeAgo}</p>}
    </a>
  )
}

export function NewsFeedSkeleton() {
  return (
    <div className="max-h-[620px] space-y-3 overflow-hidden pr-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="space-y-2 rounded-xl border border-surface-border p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  )
}
